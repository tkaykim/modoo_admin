import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendGmailEmail } from '@/lib/gmail';

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;

export const maxDuration = 30;

type OrderRow = {
  id: string;
  payment_key: string | null;
  payment_method: string | null;
  payment_status: string | null;
  total_amount: number | null;
  customer_name: string | null;
  customer_email: string | null;
  guest_email: string | null;
};

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !isAdminLike(profile.role)) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
}

async function fetchTossReceipt(order: OrderRow) {
  if (order.payment_method !== 'toss') {
    return { error: '토스 결제 주문이 아닙니다.', status: 400 as const };
  }
  if (order.payment_status !== 'completed') {
    return { error: '결제 완료 상태의 주문만 영수증을 조회할 수 있습니다.', status: 400 as const };
  }
  if (!order.payment_key) {
    return { error: '결제 키가 없어 영수증을 조회할 수 없습니다.', status: 400 as const };
  }
  if (!TOSS_SECRET_KEY) {
    return { error: '토스 시크릿 키가 설정되지 않았습니다.', status: 500 as const };
  }

  const res = await fetch(`https://api.tosspayments.com/v1/payments/${order.payment_key}`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64')}`,
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    console.error('Toss payment lookup error:', data);
    return { error: data?.message || '토스 결제 조회에 실패했습니다.', status: 502 as const };
  }

  const receiptUrl: string | null = data?.receipt?.url ?? null;
  if (!receiptUrl) {
    return { error: '토스에서 영수증(매출전표) URL을 찾을 수 없습니다.', status: 404 as const };
  }

  return {
    receiptUrl,
    method: data?.method as string | undefined,
    approvedAt: data?.approvedAt as string | undefined,
    totalAmount: data?.totalAmount as number | undefined,
  };
}

// 영수증 URL 조회
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const orderId = new URL(request.url).searchParams.get('orderId');
    if (!orderId) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, payment_key, payment_method, payment_status, total_amount, customer_name, customer_email, guest_email')
      .eq('id', orderId)
      .single<OrderRow>();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    const result = await fetchTossReceipt(order);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : '영수증 조회 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 고객에게 영수증(매출전표) 링크 메일 발송
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const orderId: string | undefined = payload?.orderId;
    const overrideEmail: string | undefined = payload?.email;

    if (!orderId) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, payment_key, payment_method, payment_status, total_amount, customer_name, customer_email, guest_email')
      .eq('id', orderId)
      .single<OrderRow>();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    const result = await fetchTossReceipt(order);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const recipient = (overrideEmail || order.customer_email || order.guest_email || '').trim();
    if (!recipient) {
      return NextResponse.json({ error: '고객 이메일이 없어 발송할 수 없습니다.' }, { status: 400 });
    }

    const name = order.customer_name?.trim() || null;
    const greeting = name ? `${name}님, 안녕하세요.` : '안녕하세요.';
    const amountStr = (result.totalAmount ?? order.total_amount ?? 0).toLocaleString('ko-KR');

    const html = `
<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#1e3a5f;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;font-size:18px;">모두의 유니폼</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
    <p style="margin:0 0 16px;color:#374151;font-size:15px;">${greeting}</p>
    <p style="margin:0 0 12px;color:#374151;">요청하신 결제 영수증(매출전표)을 안내드립니다.</p>
    <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">결제 금액: <strong style="color:#111;">${amountStr}원</strong></p>
    <div style="margin:20px 0;text-align:center;">
      <a href="${result.receiptUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">영수증 확인하기</a>
    </div>
    <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">버튼이 동작하지 않으면 아래 주소를 복사해 주소창에 붙여넣어 주세요.</p>
    <p style="margin:0 0 16px;word-break:break-all;font-size:12px;"><a href="${result.receiptUrl}" style="color:#2563eb;">${result.receiptUrl}</a></p>
    <p style="margin:0;color:#374151;font-size:13px;">감사합니다.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">본 메일은 모두의 유니폼에서 발송되었습니다.</p>
  </div>
</div>`;

    const text = [
      greeting,
      '',
      '요청하신 결제 영수증(매출전표)을 안내드립니다.',
      `결제 금액: ${amountStr}원`,
      '',
      `영수증 확인: ${result.receiptUrl}`,
      '',
      '감사합니다.',
      '',
      '---',
      '본 메일은 모두의 유니폼에서 발송되었습니다.',
    ].join('\n');

    const emailSent = await sendGmailEmail({
      to: [{ email: recipient, name: name || undefined }],
      subject: '[모두의 유니폼] 결제 영수증 안내',
      html,
      text,
    });

    if (!emailSent) {
      return NextResponse.json({ error: '이메일 발송에 실패했습니다.' }, { status: 502 });
    }

    return NextResponse.json({ data: { sent: true, email: recipient, receiptUrl: result.receiptUrl } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '영수증 발송 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
