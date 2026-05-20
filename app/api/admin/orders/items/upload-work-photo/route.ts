/**
 * POST /api/admin/orders/items/upload-work-photo
 *
 * 공장·관리자가 작업사진을 해당 order_item의 Drive 폴더에 직접 업로드.
 * - 입력: multipart/form-data { orderItemId: string, files: File[] }
 * - 권한: admin-like + factory (자기 배정 건만)
 * - 폴더가 아직 없으면 그 자리에서 생성 (현장에서 사진 먼저 찍는 케이스 커버)
 *
 * 반환: { uploaded: [{ fileId, name, webViewLink }], folderUrl }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { isBackofficeOperatorRole } from '@/lib/auth-helpers';
import {
  driveCredsConfigured,
  ensureWorkFolderForOrderItem,
  uploadFileToFolder,
  setAnyoneLinkWriter,
  getFileWebViewLink,
} from '@/lib/google-drive';

export const runtime = 'nodejs';
// FormData / 파일 업로드라 nodejs 런타임 강제
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!driveCredsConfigured()) {
      return NextResponse.json(
        { error: 'Drive 자격증명이 설정되지 않았습니다. 관리자에게 문의해주세요.' },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, manufacturer_id')
      .eq('id', user.id)
      .single();
    if (profileError || !profile || !isBackofficeOperatorRole(profile.role)) {
      return NextResponse.json({ error: '권한이 필요합니다.' }, { status: 403 });
    }

    const form = await request.formData();
    const orderItemId = form.get('orderItemId');
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    if (!orderItemId || typeof orderItemId !== 'string') {
      return NextResponse.json({ error: 'orderItemId가 필요합니다.' }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // order_item 정보 + 권한 검증
    const { data: item, error: itemErr } = await adminClient
      .from('order_items')
      .select('id, order_id, design_title, created_at, assigned_manufacturer_id, work_drive_folder_id, work_drive_folder_url')
      .eq('id', orderItemId)
      .single();
    if (itemErr || !item) {
      return NextResponse.json({ error: '주문 상품을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (profile.role === 'factory') {
      if (!profile.manufacturer_id || item.assigned_manufacturer_id !== profile.manufacturer_id) {
        return NextResponse.json({ error: '이 주문 상품에 대한 권한이 없습니다.' }, { status: 403 });
      }
    }

    // 폴더가 없으면 즉석 생성 (배정은 됐지만 백필 안 된 케이스, 또는 다른 거래처 추가 케이스)
    let folderId = item.work_drive_folder_id as string | null;
    let folderUrl = item.work_drive_folder_url as string | null;

    if (!folderId) {
      if (!item.assigned_manufacturer_id) {
        return NextResponse.json(
          { error: '공장 배정 후 사용 가능합니다.' },
          { status: 400 },
        );
      }
      const { data: mfg } = await adminClient
        .from('manufacturers')
        .select('drive_folder_id, name')
        .eq('id', item.assigned_manufacturer_id)
        .single();
      if (!mfg?.drive_folder_id) {
        return NextResponse.json(
          { error: `거래처(${mfg?.name ?? '미상'})의 Drive 폴더가 설정되지 않았습니다.` },
          { status: 400 },
        );
      }
      const { data: order } = await adminClient
        .from('orders')
        .select('customer_name, guest_name')
        .eq('id', item.order_id)
        .single();
      const customerLabel = order?.customer_name || order?.guest_name || null;

      const result = await ensureWorkFolderForOrderItem({
        parentDriveFolderId: mfg.drive_folder_id,
        designTitle: item.design_title,
        customerName: customerLabel,
        orderItemId: item.id,
        createdAtIso: item.created_at,
      });
      if (!result) {
        return NextResponse.json({ error: 'Drive 폴더 생성에 실패했습니다.' }, { status: 500 });
      }
      folderId = result.folderId;
      folderUrl = result.webViewLink;
      await adminClient
        .from('order_items')
        .update({ work_drive_folder_id: folderId, work_drive_folder_url: folderUrl })
        .eq('id', item.id);
    }

    // 업로드
    const uploaded: Array<{ fileId: string; name: string; webViewLink: string }> = [];
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const uploaderTag = profile.role === 'factory' ? 'factory' : 'admin';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const safeOriginal = (file.name || `photo-${i}.jpg`).split('/').join('_').split('\\').join('_');
      const fileName = `${timestamp}_${uploaderTag}_${safeOriginal}`;
      const buf = await file.arrayBuffer();
      const blob = new Blob([buf], { type: file.type || 'image/jpeg' });
      const up = await uploadFileToFolder(folderId, fileName, blob);
      // 업로드된 파일도 링크보유자 열람 가능하도록
      try { await setAnyoneLinkWriter(up.fileId); } catch { /* ignore */ }
      uploaded.push({ fileId: up.fileId, name: fileName, webViewLink: up.webViewLink });
    }

    // 폴더의 webViewLink 갱신
    if (!folderUrl) {
      try { folderUrl = await getFileWebViewLink(folderId); } catch { /* ignore */ }
    }

    return NextResponse.json({ uploaded, folderUrl });
  } catch (err) {
    console.error('[upload-work-photo] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '업로드에 실패했습니다.' },
      { status: 500 },
    );
  }
}
