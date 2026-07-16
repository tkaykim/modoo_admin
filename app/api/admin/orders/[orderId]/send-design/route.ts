import { NextRequest, NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendDesignProofEmailBulk } from '@/lib/notifications/design-proof';
import { buildManualProofMessage, resolveProofRecipient } from '@/lib/notifications/proof-alimtalk';
import { createHmac } from 'crypto';

function generateDesignToken(orderId: string, orderItemId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret';
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = `design|${orderItemId}|${orderId}|${expiry}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(JSON.stringify({ oi: orderItemId, o: orderId, exp: expiry, sig })).toString('base64url');
}

// canvas_state 에 사용자 오브젝트(텍스트/이미지)가 있는지 — 시안 준비 여부 판단용
function hasDesignContent(canvasState: unknown): boolean {
  if (!canvasState || typeof canvasState !== 'object') return false;
  const cs = canvasState as Record<string, unknown>;
  if (Array.isArray(cs.objects)) return cs.objects.length > 0;
  // side 별 구조 { front: { objects: [...] }, ... }
  for (const v of Object.values(cs)) {
    if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).objects)) {
      if (((v as Record<string, unknown>).objects as unknown[]).length > 0) return true;
    }
  }
  return false;
}

/**
 * 주문 단위 일괄 시안 확인요청.
 * 한 주문 내 여러 디자인(상품)을 한 번에 시안확인 요청하고, 고객에게는 한 통의 메일로 전체 시안 링크를 보낸다.
 * 시안이 준비되지 않은(빈 디자인) 상품은 건너뛰고, 어떤 상품이 제외됐는지 명시적으로 반환한다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || (!isAdminLike(profile.role))) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, customer_name, customer_email, user_id, guest_name, customer_phone, guest_phone')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 고객 이메일 1회 해석 (per-item 발송에서 일부만 성공하던 원인 제거)
    let customerEmail = order.customer_email;
    if (!customerEmail && order.user_id) {
      const { data: userProfile } = await adminClient
        .from('profiles')
        .select('email')
        .eq('id', order.user_id)
        .single();
      customerEmail = userProfile?.email;
    }
    if (!customerEmail) {
      return NextResponse.json({ error: '고객 이메일이 없습니다.' }, { status: 400 });
    }

    const { data: items, error: itemsError } = await adminClient
      .from('order_items')
      .select('id, product_title, design_title, thumbnail_url, design_status, design_id, canvas_state')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (itemsError || !items) {
      return NextResponse.json({ error: '주문 상품을 불러오지 못했습니다.' }, { status: 500 });
    }

    const ready: typeof items = [];
    const skipped: Array<{ id: string; label: string; reason: string }> = [];

    for (const it of items) {
      const label = it.design_title || it.product_title || '상품';
      if (it.design_status === 'confirmed') {
        skipped.push({ id: it.id, label, reason: '이미 시안 확정됨' });
        continue;
      }
      const hasPreview = !!it.thumbnail_url && !it.thumbnail_url.startsWith('data:');
      const isReady = !!it.design_id || hasPreview || hasDesignContent(it.canvas_state);
      if (!isReady) {
        skipped.push({ id: it.id, label, reason: '시안 미준비' });
        continue;
      }
      ready.push(it);
    }

    if (ready.length === 0) {
      return NextResponse.json(
        { error: '시안 확인요청을 보낼 준비된 상품이 없습니다.', shared: [], skipped },
        { status: 400 }
      );
    }

    const sharedIds = ready.map((it) => it.id);

    // 모든 준비된 상품을 같은 시각에 design_shared 로 일괄 전환 (알림톡 워커가 한 폴에 모두 픽업)
    const now = new Date().toISOString();
    const { error: updateError } = await adminClient
      .from('order_items')
      .update({
        design_status: 'design_shared',
        design_shared_at: now,
        design_revision_note: null,
        updated_at: now,
      })
      .in('id', sharedIds);

    if (updateError) {
      return NextResponse.json({ error: '상태 업데이트에 실패했습니다.' }, { status: 500 });
    }

    // 주문 단위 토큰(검증은 o=orderId 기준) — 첫 상품 id 로 생성
    const token = generateDesignToken(orderId, sharedIds[0]);

    const sent = await sendDesignProofEmailBulk({
      orderId,
      customerName: order.customer_name || '고객',
      customerEmail,
      items: ready.map((it) => ({
        label: it.design_title || it.product_title || '상품',
        previewUrl: it.thumbnail_url && !it.thumbnail_url.startsWith('data:') ? it.thumbnail_url : null,
      })),
      confirmToken: token,
    });

    // 링크 하나로 이 주문의 전 시안을 함께 보여주므로 문구도 주문 단위로 1건만 만든다.
    const { customerName, phone } = resolveProofRecipient(order);
    const manualMessage = {
      customerName,
      phone,
      label: `${ready.length}개 상품 (주문 전체)`,
      text: buildManualProofMessage({ customerName, orderId, token }),
    };

    if (!sent) {
      // 상태는 design_shared 로 전환됨(고객 페이지에서 확인 가능) — 메일만 실패
      return NextResponse.json(
        { error: '시안 상태는 전환했으나 안내 메일 발송에 실패했습니다.', shared: sharedIds, skipped, manualMessage },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, shared: sharedIds, skipped, manualMessage });
  } catch (error) {
    console.error('Error sending bulk design proof:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
