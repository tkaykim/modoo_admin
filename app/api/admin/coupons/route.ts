import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  }

  if (!user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  }

  if (!profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
};

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
};

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const couponId = url.searchParams.get('id');

    const adminClient = createAdminClient();

    // If specific coupon ID is requested, get it with usage details
    if (couponId) {
      const { data: coupon, error: couponError } = await adminClient
        .from('coupons')
        .select('*')
        .eq('id', couponId)
        .single();

      if (couponError) {
        return NextResponse.json({ error: couponError.message }, { status: 500 });
      }

      // Get usage details for this coupon
      const { data: usages, error: usagesError } = await adminClient
        .from('coupon_usages')
        .select(`
          *,
          user:profiles(id, email, name)
        `)
        .eq('coupon_id', couponId)
        .order('registered_at', { ascending: false });

      if (usagesError) {
        return NextResponse.json({ error: usagesError.message }, { status: 500 });
      }

      return NextResponse.json({ data: { ...coupon, usages: usages || [] } });
    }

    // Get all coupons
    const { data, error } = await adminClient
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '쿠폰 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);

    const code = payload?.code?.toUpperCase()?.trim();
    const displayName = payload?.display_name ?? null;
    const description = payload?.description ?? null;
    const discountType = payload?.discount_type;
    const discountValue = parseNumber(payload?.discount_value);
    const minOrderAmount = parseNumber(payload?.min_order_amount) || 0;
    const maxDiscountAmount = payload?.max_discount_amount !== null && payload?.max_discount_amount !== undefined
      ? parseNumber(payload.max_discount_amount)
      : null;
    const maxUses = payload?.max_uses !== null && payload?.max_uses !== undefined
      ? parseNumber(payload.max_uses)
      : null;
    const isActive = payload?.is_active ?? true;
    const expiresAt = payload?.expires_at ?? null;
    const validDaysAfterRegistration = payload?.valid_days_after_registration !== null && payload?.valid_days_after_registration !== undefined
      ? parseNumber(payload.valid_days_after_registration)
      : null;

    // Validation
    if (!code || typeof code !== 'string' || code.length < 3) {
      return NextResponse.json({ error: '쿠폰 코드는 3자 이상이어야 합니다.' }, { status: 400 });
    }

    if (!discountType || !['percentage', 'fixed_amount'].includes(discountType)) {
      return NextResponse.json({ error: '할인 유형이 유효하지 않습니다.' }, { status: 400 });
    }

    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return NextResponse.json({ error: '할인 값이 유효하지 않습니다.' }, { status: 400 });
    }

    if (discountType === 'percentage' && discountValue > 100) {
      return NextResponse.json({ error: '퍼센트 할인은 100을 초과할 수 없습니다.' }, { status: 400 });
    }

    if (maxDiscountAmount !== null && !Number.isFinite(maxDiscountAmount)) {
      return NextResponse.json({ error: '최대 할인 금액이 유효하지 않습니다.' }, { status: 400 });
    }

    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses <= 0)) {
      return NextResponse.json({ error: '최대 사용 횟수가 유효하지 않습니다.' }, { status: 400 });
    }

    if (validDaysAfterRegistration !== null && (!Number.isFinite(validDaysAfterRegistration) || validDaysAfterRegistration <= 0)) {
      return NextResponse.json({ error: '등록 후 유효 일수가 유효하지 않습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check if code already exists
    const { data: existingCoupon } = await adminClient
      .from('coupons')
      .select('id')
      .eq('code', code)
      .single();

    if (existingCoupon) {
      return NextResponse.json({ error: '이미 존재하는 쿠폰 코드입니다.' }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from('coupons')
      .insert({
        code,
        display_name: displayName,
        description,
        discount_type: discountType,
        discount_value: discountValue,
        min_order_amount: minOrderAmount,
        max_discount_amount: maxDiscountAmount,
        max_uses: maxUses,
        current_uses: 0,
        is_active: isActive,
        expires_at: expiresAt,
        valid_days_after_registration: validDaysAfterRegistration,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '쿠폰 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const couponId = payload?.id;

    if (!couponId || typeof couponId !== 'string') {
      return NextResponse.json({ error: '쿠폰 ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload?.code !== undefined) {
      const code = payload.code?.toUpperCase()?.trim();
      if (!code || typeof code !== 'string' || code.length < 3) {
        return NextResponse.json({ error: '쿠폰 코드는 3자 이상이어야 합니다.' }, { status: 400 });
      }
      updateData.code = code;
    }

    if (payload?.display_name !== undefined) {
      updateData.display_name = payload.display_name ?? null;
    }

    if (payload?.description !== undefined) {
      updateData.description = payload.description ?? null;
    }

    if (payload?.discount_type !== undefined) {
      if (!['percentage', 'fixed_amount'].includes(payload.discount_type)) {
        return NextResponse.json({ error: '할인 유형이 유효하지 않습니다.' }, { status: 400 });
      }
      updateData.discount_type = payload.discount_type;
    }

    if (payload?.discount_value !== undefined) {
      const discountValue = parseNumber(payload.discount_value);
      if (!Number.isFinite(discountValue) || discountValue <= 0) {
        return NextResponse.json({ error: '할인 값이 유효하지 않습니다.' }, { status: 400 });
      }
      updateData.discount_value = discountValue;
    }

    if (payload?.min_order_amount !== undefined) {
      const minOrderAmount = parseNumber(payload.min_order_amount);
      if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
        return NextResponse.json({ error: '최소 주문 금액이 유효하지 않습니다.' }, { status: 400 });
      }
      updateData.min_order_amount = minOrderAmount;
    }

    if (payload?.max_discount_amount !== undefined) {
      if (payload.max_discount_amount === null) {
        updateData.max_discount_amount = null;
      } else {
        const maxDiscountAmount = parseNumber(payload.max_discount_amount);
        if (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount <= 0) {
          return NextResponse.json({ error: '최대 할인 금액이 유효하지 않습니다.' }, { status: 400 });
        }
        updateData.max_discount_amount = maxDiscountAmount;
      }
    }

    if (payload?.max_uses !== undefined) {
      if (payload.max_uses === null) {
        updateData.max_uses = null;
      } else {
        const maxUses = parseNumber(payload.max_uses);
        if (!Number.isFinite(maxUses) || maxUses <= 0) {
          return NextResponse.json({ error: '최대 사용 횟수가 유효하지 않습니다.' }, { status: 400 });
        }
        updateData.max_uses = maxUses;
      }
    }

    if (payload?.is_active !== undefined) {
      if (typeof payload.is_active !== 'boolean') {
        return NextResponse.json({ error: '활성 상태 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.is_active = payload.is_active;
    }

    if (payload?.expires_at !== undefined) {
      updateData.expires_at = payload.expires_at ?? null;
    }

    if (payload?.valid_days_after_registration !== undefined) {
      if (payload.valid_days_after_registration === null) {
        updateData.valid_days_after_registration = null;
      } else {
        const validDays = parseNumber(payload.valid_days_after_registration);
        if (!Number.isFinite(validDays) || validDays <= 0) {
          return NextResponse.json({ error: '등록 후 유효 일수가 유효하지 않습니다.' }, { status: 400 });
        }
        updateData.valid_days_after_registration = validDays;
      }
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // If updating code, check for duplicates
    if (updateData.code) {
      const { data: existingCoupon } = await adminClient
        .from('coupons')
        .select('id')
        .eq('code', updateData.code)
        .neq('id', couponId)
        .single();

      if (existingCoupon) {
        return NextResponse.json({ error: '이미 존재하는 쿠폰 코드입니다.' }, { status: 400 });
      }
    }

    const { data, error } = await adminClient
      .from('coupons')
      .update(updateData)
      .eq('id', couponId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '쿠폰 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const couponId = url.searchParams.get('id');

    if (!couponId) {
      return NextResponse.json({ error: '쿠폰 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check if coupon has any usages
    const { count } = await adminClient
      .from('coupon_usages')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', couponId);

    if (count && count > 0) {
      // Soft delete - just deactivate
      const { data, error } = await adminClient
        .from('coupons')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', couponId)
        .select('*')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        data: { id: couponId, deactivated: true },
        message: '사용 이력이 있어 비활성화되었습니다.'
      });
    }

    // Hard delete if no usages
    const { error } = await adminClient
      .from('coupons')
      .delete()
      .eq('id', couponId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: couponId, deleted: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '쿠폰 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
