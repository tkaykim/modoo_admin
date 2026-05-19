/**
 * lib/google-drive.ts — modoo_admin 전용 경량 Drive 클라이언트
 *
 * 의존성 추가 없이 fetch + OAuth refresh_token으로 Drive REST v3 직접 호출.
 * 환경변수가 비어있으면 graceful no-op으로 동작 — 기존 서비스 동작에 영향 없음.
 *
 * 필요한 환경변수 (.env.local):
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   GOOGLE_DRIVE_REFRESH_TOKEN
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export function driveCredsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  );
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.token;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[google-drive] token refresh failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

/** 상위 폴더 내 같은 이름의 폴더가 있으면 ID 반환, 없으면 생성. */
export async function ensureSubFolder(
  parentFolderId: string,
  name: string,
): Promise<string> {
  const token = await getAccessToken();
  const escapedName = name.replace(/'/g, "\\'");
  const q = [
    `'${parentFolderId}' in parents`,
    'trashed = false',
    "mimeType = 'application/vnd.google-apps.folder'",
    `name = '${escapedName}'`,
  ].join(' and ');

  const listRes = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) {
    throw new Error(`[google-drive] list failed: ${listRes.status} ${await listRes.text()}`);
  }
  const listData = (await listRes.json()) as { files?: Array<{ id: string }> };
  if (listData.files && listData.files.length > 0) {
    return listData.files[0].id;
  }

  const createRes = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });
  if (!createRes.ok) {
    throw new Error(`[google-drive] create failed: ${createRes.status} ${await createRes.text()}`);
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

/** 링크 보유자 누구나 편집(파일 업로드) 가능하도록 권한 부여. 이미 있으면 조용히 통과. */
export async function setAnyoneLinkWriter(fileId: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${DRIVE_API}/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'anyone', role: 'writer' }),
  });
  if (!res.ok) {
    const text = await res.text();
    // 이미 존재하는 경우 등은 무시
    if (!/already exists|duplicate/i.test(text)) {
      throw new Error(`[google-drive] setAnyoneLinkWriter failed: ${res.status} ${text}`);
    }
  }
}

/** webViewLink (공유 가능한 URL) 조회. */
export async function getFileWebViewLink(fileId: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?fields=webViewLink`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`[google-drive] getFileWebViewLink failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { webViewLink?: string };
  return data.webViewLink ?? `https://drive.google.com/drive/folders/${fileId}`;
}

/**
 * 공장 배정 시 호출하는 통합 헬퍼.
 * 거래처 폴더 아래에 "[디자인명] [고객명] [YYYY-MM-DD] [#XXXX]" 형태의 하위 폴더 생성 +
 * 링크보유자 편집 권한 부여 + webViewLink 반환.
 * 실패해도 throw하지 않고 null을 반환 — 공장 배정 흐름이 멈추면 안 됨.
 */
export async function ensureWorkFolderForOrderItem(input: {
  parentDriveFolderId: string;
  designTitle: string | null;
  customerName: string | null;
  orderItemId: string;
  createdAtIso: string;
}): Promise<{ folderId: string; webViewLink: string } | null> {
  if (!driveCredsConfigured()) {
    console.warn('[google-drive] OAuth creds not configured — skipping folder creation');
    return null;
  }

  try {
    const date = new Date(input.createdAtIso);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateLabel = `${yyyy}-${mm}-${dd}`;
    const shortId = input.orderItemId.slice(-4);

    // Drive 폴더명 금지문자 정리 (/, \)
    const safeTitle =
      (input.designTitle?.trim() || '디자인명 없음').replace(/[/\\]/g, '_');
    const safeCustomer =
      (input.customerName?.trim() || '').replace(/[/\\]/g, '_');

    const folderName = [safeTitle, safeCustomer, dateLabel, `#${shortId}`]
      .filter(Boolean)
      .join(' ')
      .slice(0, 100);

    const folderId = await ensureSubFolder(input.parentDriveFolderId, folderName);
    await setAnyoneLinkWriter(folderId);
    const webViewLink = await getFileWebViewLink(folderId);
    return { folderId, webViewLink };
  } catch (err) {
    console.error('[google-drive] ensureWorkFolderForOrderItem failed:', err);
    return null;
  }
}
