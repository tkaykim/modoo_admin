import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const IS_PAYPAL_SANDBOX = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX === 'true';
const PAYPAL_API_URL = IS_PAYPAL_SANDBOX
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

async function getPayPalAccessToken(): Promise<string> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal 인증 정보가 설정되지 않았습니다.');
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('PayPal auth error:', error);
    throw new Error('PayPal 인증에 실패했습니다.');
  }

  const data = await response.json();
  return data.access_token;
}

async function refundToss(paymentKey: string, reason: string, amount?: number) {
  if (!TOSS_SECRET_KEY) {
    throw new Error('토스 시크릿 키가 설정되지 않았습니다.');
  }

  const body: Record<string, unknown> = { cancelReason: reason };
  if (amount !== undefined) {
    body.cancelAmount = amount;
  }

  const response = await fetch(
    `https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('Toss refund error:', data);
    throw new Error(data.message || '토스 환불 처리에 실패했습니다.');
  }

  return data;
}

async function refundPayPal(captureId: string, amount?: number) {
  const accessToken = await getPayPalAccessToken();

  // For full refund: empty body. For partial: include amount.
  const body: Record<string, unknown> = {};
  if (amount !== undefined) {
    body.amount = {
      value: (amount * 0.00075).toFixed(2), // KRW to USD
      currency_code: 'USD',
    };
  }

  const response = await fetch(
    `${PAYPAL_API_URL}/v2/payments/captures/${captureId}/refund`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : '{}',
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('PayPal refund error:', data);
    const message =
      data.details?.[0]?.description || data.message || 'PayPal 환불 처리에 실패했습니다.';
    throw new Error(message);
  }

  return data;
}

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (!isAdminLike(profile.role))) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    // Parse request body
    const payload = await request.json().catch(() => null);
    const orderId = payload?.orderId;
    const refundAmount = payload?.amount; // undefined = full refund
    const reason = payload?.reason;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: '환불 사유를 입력해주세요.' }, { status: 400 });
    }

    if (refundAmount !== undefined && (typeof refundAmount !== 'number' || refundAmount <= 0)) {
      return NextResponse.json({ error: '환불 금액이 올바르지 않습니다.' }, { status: 400 });
    }

    // Fetch order
    const adminClient = createAdminClient();
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, payment_key, payment_method, payment_status, total_amount, order_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (order.payment_status !== 'completed') {
      return NextResponse.json(
        { error: '결제 완료 상태의 주문만 환불할 수 있습니다.' },
        { status: 400 }
      );
    }

    if (!order.payment_key) {
      return NextResponse.json(
        { error: '결제 키가 없어 환불을 처리할 수 없습니다.' },
        { status: 400 }
      );
    }

    if (refundAmount !== undefined && refundAmount > order.total_amount) {
      return NextResponse.json(
        { error: '환불 금액이 주문 금액을 초과할 수 없습니다.' },
        { status: 400 }
      );
    }

    const isFullRefund = refundAmount === undefined || refundAmount === order.total_amount;

    // Process refund based on payment method
    let refundResult;
    if (order.payment_method === 'toss') {
      refundResult = await refundToss(
        order.payment_key,
        reason,
        isFullRefund ? undefined : refundAmount
      );
    } else if (order.payment_method === 'paypal') {
      refundResult = await refundPayPal(
        order.payment_key,
        isFullRefund ? undefined : refundAmount
      );
    } else {
      return NextResponse.json(
        { error: `지원하지 않는 결제 수단입니다: ${order.payment_method}` },
        { status: 400 }
      );
    }

    // Update order status in DB
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      refund_reason: reason.trim(),
      order_status: 'cancelled',
      factory_status: 'cancelled',
    };

    if (isFullRefund) {
      updateData.payment_status = 'refunded';
    }

    const { data: updatedOrder, error: updateError } = await adminClient
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      console.error('Order update error after refund:', updateError);
      // Refund was processed but DB update failed - log for reconciliation
      return NextResponse.json({
        data: updatedOrder,
        warning: '환불은 처리되었으나 주문 상태 업데이트에 실패했습니다.',
        refundResult,
      });
    }

    return NextResponse.json({
      data: updatedOrder,
      refundResult,
      isFullRefund,
    });
  } catch (error) {
    console.error('Refund error:', error);
    const message = error instanceof Error ? error.message : '환불 처리 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
