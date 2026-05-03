import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

async function getAuthenticatedProfile(requiredRole?: 'admin' | 'admin_or_factory') {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: authError?.message ?? '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, manufacturer_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { error: NextResponse.json({ error: profileError?.message ?? '프로필을 찾을 수 없습니다.' }, { status: 403 }) };
  }

  if (requiredRole === 'admin' && (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  if (requiredRole === 'admin_or_factory' && !isBackofficeOperatorRole(profile.role)) {
    return { error: NextResponse.json({ error: '권한이 필요합니다.' }, { status: 403 }) };
  }

  return { profile };
}

export async function DELETE(request: Request) {
  try {
    const { error, profile } = await getAuthenticatedProfile('admin');
    if (error || !profile) return error;

    const payload = await request.json().catch(() => null);
    const orderId = payload?.orderId;
    const urlToDelete = payload?.url;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    if (!urlToDelete || typeof urlToDelete !== 'string') {
      return NextResponse.json({ error: '삭제할 파일 URL이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: existing, error: fetchError } = await adminClient
      .from('orders')
      .select('attachment_urls')
      .eq('id', orderId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    const currentUrls: string[] = existing.attachment_urls || [];
    const updatedUrls = currentUrls.filter((u) => u !== urlToDelete);

    if (updatedUrls.length === currentUrls.length) {
      return NextResponse.json({ error: '해당 첨부파일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data, error: updateError } = await adminClient
      .from('orders')
      .update({
        attachment_urls: updatedUrls,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('attachment_urls')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    try {
      const bucketName = 'order-attachments';
      const bucketUrl = `/storage/v1/object/public/${bucketName}/`;
      const bucketIndex = urlToDelete.indexOf(bucketUrl);
      if (bucketIndex !== -1) {
        const storagePath = urlToDelete.substring(bucketIndex + bucketUrl.length);
        await adminClient.storage.from(bucketName).remove([decodeURIComponent(storagePath)]);
      }
    } catch {
      // Storage 삭제 실패해도 DB 업데이트는 유지
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '첨부파일 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { error, profile } = await getAuthenticatedProfile('admin_or_factory');
    if (error || !profile) return error;

    const payload = await request.json().catch(() => null);
    const orderId = payload?.orderId;
    const newUrls = payload?.newUrls;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    if (!Array.isArray(newUrls) || newUrls.length === 0 || !newUrls.every((u: unknown) => typeof u === 'string')) {
      return NextResponse.json({ error: '유효한 파일 URL 배열이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: existing, error: fetchError } = await adminClient
      .from('orders')
      .select('attachment_urls')
      .eq('id', orderId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (profile.role === 'factory') {
      if (!profile.manufacturer_id) {
        return NextResponse.json({ error: '공장 정보가 필요합니다.' }, { status: 403 });
      }
      const { data: factoryItems, error: factoryItemsError } = await adminClient
        .from('order_items')
        .select('id')
        .eq('order_id', orderId)
        .eq('assigned_manufacturer_id', profile.manufacturer_id)
        .limit(1);

      if (factoryItemsError || !factoryItems || factoryItems.length === 0) {
        return NextResponse.json({ error: '이 주문에 대한 권한이 없습니다.' }, { status: 403 });
      }
    }

    const currentUrls: string[] = existing.attachment_urls || [];
    const merged = [...currentUrls, ...newUrls];

    const { data, error: updateError } = await adminClient
      .from('orders')
      .update({
        attachment_urls: merged,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('attachment_urls')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '첨부파일 추가에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
