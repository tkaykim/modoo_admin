import bcrypt from 'bcryptjs';
import { fetch as undiciFetch, FormData, ProxyAgent } from 'undici';

const API_BASE = process.env.NAVER_COMMERCE_API_BASE_URL || 'https://api.commerce.naver.com/external';
const TOKEN_PATH = '/v1/oauth2/token';

type TokenCache = { accessToken: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

export class NaverCommerceError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = 'NaverCommerceError';
  }
}

function config() {
  const clientId = process.env.NAVER_COMMERCE_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_COMMERCE_CLIENT_SECRET?.trim();
  const proxyUrl = process.env.NAVER_COMMERCE_PROXY_URL?.trim() || process.env.LOGEN_PROXY_URL?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_COMMERCE_CLIENT_ID와 NAVER_COMMERCE_CLIENT_SECRET이 필요합니다.');
  }
  return { clientId, clientSecret, dispatcher: proxyUrl ? new ProxyAgent(proxyUrl) : undefined };
}

export function isNaverCommerceConfigured() {
  return Boolean(process.env.NAVER_COMMERCE_CLIENT_ID?.trim() && process.env.NAVER_COMMERCE_CLIENT_SECRET?.trim());
}

function createSignature(clientId: string, timestamp: number, clientSecret: string) {
  const hashed = bcrypt.hashSync(`${clientId}_${timestamp}`, clientSecret);
  return Buffer.from(hashed, 'utf8').toString('base64');
}

async function issueToken(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.accessToken;
  const { clientId, clientSecret, dispatcher } = config();
  const timestamp = Date.now();
  const body = new URLSearchParams({
    client_id: clientId,
    timestamp: String(timestamp),
    client_secret_sign: createSignature(clientId, timestamp, clientSecret),
    grant_type: 'client_credentials',
    type: 'SELF',
  });
  const response = await undiciFetch(`${API_BASE}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    ...(dispatcher ? { dispatcher } : {}),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new NaverCommerceError('네이버 커머스 인증 토큰 발급에 실패했습니다.', response.status, String(payload.code || ''), payload);
  }
  const expiresIn = Number(payload.expires_in || 10_800);
  tokenCache = { accessToken: payload.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return payload.access_token;
}

async function parseResponse(response: Awaited<ReturnType<typeof undiciFetch>>) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

export async function naverRequest<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
  attempt = 0,
): Promise<T> {
  const { dispatcher } = config();
  const token = await issueToken(attempt > 0);
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(init.query || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await undiciFetch(url, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    ...(dispatcher ? { dispatcher } : {}),
  });
  const payload = await parseResponse(response);
  if (response.status === 401 && attempt === 0) {
    tokenCache = null;
    return naverRequest<T>(path, init, 1);
  }
  if (response.status === 429 && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    return naverRequest<T>(path, init, attempt + 1);
  }
  if (!response.ok) {
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    throw new NaverCommerceError(
      String(record.message || `네이버 커머스 API 호출에 실패했습니다. (${response.status})`),
      response.status,
      typeof record.code === 'string' ? record.code : undefined,
      payload,
    );
  }
  return payload as T;
}

export async function uploadNaverImages(imageUrls: string[]): Promise<string[]> {
  if (imageUrls.length === 0) return [];
  const { dispatcher } = config();
  const token = await issueToken();
  const form = new FormData();
  for (const [index, imageUrl] of imageUrls.entries()) {
    const imageResponse = await undiciFetch(imageUrl);
    if (!imageResponse.ok) throw new Error(`상품 이미지를 가져오지 못했습니다. (${imageResponse.status})`);
    const sourceContentType = (imageResponse.headers.get('content-type') || 'image/jpeg').split(';')[0].toLowerCase();
    let contentType = sourceContentType === 'image/jpg' ? 'image/jpeg' : sourceContentType;
    let bytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (contentType === 'image/avif' || contentType === 'image/webp') {
      const sharp = (await import('sharp')).default;
      bytes = new Uint8Array(await sharp(bytes).jpeg({ quality: 92 }).toBuffer());
      contentType = 'image/jpeg';
    }
    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
    };
    const extension = extensionByType[contentType];
    if (!extension) throw new Error(`네이버가 지원하지 않는 상품 이미지 형식입니다. (${sourceContentType})`);
    form.append('imageFiles', new Blob([bytes], { type: contentType }), `product-${index + 1}.${extension}`);
  }
  const response = await undiciFetch(`${API_BASE}/v1/product-images/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    ...(dispatcher ? { dispatcher } : {}),
  });
  const payload = await parseResponse(response);
  if (!response.ok) throw new NaverCommerceError('네이버 상품 이미지 업로드에 실패했습니다.', response.status, undefined, payload);
  const record = (payload || {}) as Record<string, unknown>;
  const images = Array.isArray(record.images) ? record.images : [];
  return images.map((image) => String((image as Record<string, unknown>).url || '')).filter(Boolean);
}
