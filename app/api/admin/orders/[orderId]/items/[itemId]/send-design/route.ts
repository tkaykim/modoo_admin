import { NextRequest, NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendDesignProofEmail } from '@/lib/notifications/design-proof';
import { buildManualProofMessage, resolveProofRecipient } from '@/lib/notifications/proof-alimtalk';
import { createHmac } from 'crypto';

function generateDesignToken(orderId: string, orderItemId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret';
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = `design|${orderItemId}|${orderId}|${expiry}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(JSON.stringify({ oi: orderItemId, o: orderId, exp: expiry, sig })).toString('base64url');
}

/**
 * 수동발송용 문구 재조회 (부수효과 없음).
 * 카카오 채널 장애로 자동 알림톡이 막혔을 때, 이미 시안확인요청을 보낸 품목의 문구·링크를 다시 복사하기 위한 경로.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string; itemId: string }> }
) {
  try {
    const { orderId, itemId } = await params;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !isAdminLike(profile.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    const { data: orderItem, error: itemError } = await adminClient
      .from('order_items')
      .select('id, order_id, product_title, design_title')
      .eq('id', itemId)
      .eq('order_id', orderId)
      .single();

    if (itemError || !orderItem) {
      return NextResponse.json({ error: '주문 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, customer_name, guest_name, customer_phone, guest_phone')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { customerName, phone } = resolveProofRecipient(order);

    return NextResponse.json({
      manualMessage: {
        customerName,
        phone,
        label: orderItem.design_title || orderItem.product_title || '상품',
        text: buildManualProofMessage({
          customerName,
          orderId,
          token: generateDesignToken(orderId, itemId),
        }),
      },
    });
  } catch (error) {
    console.error('Error building manual design proof message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string; itemId: string }> }
) {
  try {
    const { orderId, itemId } = await params;

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

    const { data: orderItem, error: itemError } = await adminClient
      .from('order_items')
      .select('id, order_id, product_title, design_title, thumbnail_url, design_status')
      .eq('id', itemId)
      .eq('order_id', orderId)
      .single();

    if (itemError || !orderItem) {
      return NextResponse.json({ error: '주문 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, customer_name, customer_email, user_id, guest_name, customer_phone, guest_phone')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

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

    const token = generateDesignToken(orderId, itemId);

    const { error: updateError } = await adminClient
      .from('order_items')
      .update({
        design_status: 'design_shared',
        design_shared_at: new Date().toISOString(),
        design_revision_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (updateError) {
      return NextResponse.json({ error: '상태 업데이트에 실패했습니다.' }, { status: 500 });
    }

    // Get a usable preview URL (not data: URI)
    let previewUrl = orderItem.thumbnail_url;
    if (previewUrl && previewUrl.startsWith('data:')) {
      previewUrl = null;
    }

    const sent = await sendDesignProofEmail({
      orderId,
      orderItemId: itemId,
      customerName: order.customer_name || '고객',
      customerEmail,
      productTitle: orderItem.product_title,
      designTitle: orderItem.design_title,
      previewUrl,
      confirmToken: token,
    });

    // 알림톡(워커)·이메일과 동일한 링크를 담은 복붙용 문구 — 채널 장애 시 운영자가 카톡으로 직접 보낸다.
    const { customerName, phone } = resolveProofRecipient(order);
    const manualMessage = {
      customerName,
      phone,
      label: orderItem.design_title || orderItem.product_title || '상품',
      text: buildManualProofMessage({ customerName, orderId, token }),
    };

    if (!sent) {
      // 상태는 이미 design_shared 로 전환됨 — 메일만 실패했으므로 수동발송 문구는 그대로 내준다.
      return NextResponse.json({ error: '이메일 발송에 실패했습니다.', manualMessage }, { status: 500 });
    }

    return NextResponse.json({ success: true, design_status: 'design_shared', manualMessage });
  } catch (error) {
    console.error('Error sending design proof:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
