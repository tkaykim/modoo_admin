import { NextRequest, NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendDesignProofEmail } from '@/lib/notifications/design-proof';
import { createHmac } from 'crypto';

function generateDesignToken(orderId: string, orderItemId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret';
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = `design|${orderItemId}|${orderId}|${expiry}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(JSON.stringify({ oi: orderItemId, o: orderId, exp: expiry, sig })).toString('base64url');
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
      .select('id, customer_name, customer_email, user_id')
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

    if (!sent) {
      return NextResponse.json({ error: '이메일 발송에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, design_status: 'design_shared' });
  } catch (error) {
    console.error('Error sending design proof:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
