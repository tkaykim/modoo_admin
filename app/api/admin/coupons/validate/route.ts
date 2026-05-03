import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const payload = await request.json().catch(() => null);
    const code = payload?.code;
    const orderTotal = payload?.orderTotal;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: '쿠폰 코드를 입력해주세요.' }, { status: 400 });
    }

    if (typeof orderTotal !== 'number' || orderTotal < 0) {
      return NextResponse.json({ error: '주문 금액이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: coupon, error: couponError } = await adminClient
      .from('coupons')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .eq('is_active', true)
      .single();

    if (couponError || !coupon) {
      return NextResponse.json({ error: '유효하지 않은 쿠폰 코드입니다.' }, { status: 400 });
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json({ error: '만료된 쿠폰입니다.' }, { status: 400 });
    }

    if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
      return NextResponse.json({ error: '쿠폰 사용 한도가 초과되었습니다.' }, { status: 400 });
    }

    if (orderTotal < coupon.min_order_amount) {
      return NextResponse.json({
        error: `최소 주문금액 ${coupon.min_order_amount.toLocaleString()}원 이상 주문 시 사용 가능합니다.`,
      }, { status: 400 });
    }

    let discountAmount = 0;
    if (coupon.discount_type === 'percentage') {
      discountAmount = Math.floor(orderTotal * (coupon.discount_value / 100));
      if (coupon.max_discount_amount !== null) {
        discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
      }
    } else {
      discountAmount = coupon.discount_value;
    }
    discountAmount = Math.min(discountAmount, orderTotal);

    let discountText: string;
    if (coupon.discount_type === 'percentage') {
      discountText = `${coupon.discount_value}% 할인`;
      if (coupon.max_discount_amount) {
        discountText += ` (최대 ${coupon.max_discount_amount.toLocaleString()}원)`;
      }
    } else {
      discountText = `${coupon.discount_value.toLocaleString()}원 할인`;
    }

    return NextResponse.json({
      data: {
        couponId: coupon.id,
        code: coupon.code,
        displayName: coupon.display_name || coupon.code,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        discountAmount,
        discountText,
        finalTotal: orderTotal - discountAmount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '쿠폰 검증에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
