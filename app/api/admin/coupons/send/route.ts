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

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth && auth.error) return auth.error;

  try {
    const payload = await request.json().catch(() => null);
    const couponId = payload?.couponId;
    const userIds: unknown = payload?.userIds;

    if (!couponId || typeof couponId !== 'string') {
      return NextResponse.json({ error: '쿠폰 ID가 필요합니다.' }, { status: 400 });
    }

    if (!Array.isArray(userIds) || userIds.length === 0 || !userIds.every((id) => typeof id === 'string')) {
      return NextResponse.json({ error: '사용자 목록이 필요합니다.' }, { status: 400 });
    }

    if (userIds.length > 500) {
      return NextResponse.json({ error: '한 번에 최대 500명까지 발급할 수 있습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Fetch coupon
    const { data: coupon, error: couponError } = await adminClient
      .from('coupons')
      .select('*')
      .eq('id', couponId)
      .single();

    if (couponError || !coupon) {
      return NextResponse.json({ error: '존재하지 않는 쿠폰입니다.' }, { status: 404 });
    }

    // Validate coupon is issuable
    if (!coupon.is_active) {
      return NextResponse.json({ error: '비활성화된 쿠폰은 발급할 수 없습니다.' }, { status: 400 });
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json({ error: '만료된 쿠폰은 발급할 수 없습니다.' }, { status: 400 });
    }

    // Check for existing issuances (duplicates)
    const { data: existingUsages } = await adminClient
      .from('coupon_usages')
      .select('user_id')
      .eq('coupon_id', couponId)
      .in('user_id', userIds);

    const alreadyIssuedSet = new Set((existingUsages || []).map((u) => u.user_id));
    const newUserIds = (userIds as string[]).filter((id) => !alreadyIssuedSet.has(id));

    if (newUserIds.length === 0) {
      return NextResponse.json({
        data: { issued: 0, skipped: userIds.length },
        message: '선택한 모든 사용자에게 이미 해당 쿠폰이 발급되어 있습니다.',
      });
    }

    // Check max_uses capacity based on actual coupon_usages count (not current_uses which tracks redemptions)
    if (coupon.max_uses !== null) {
      const { count: totalIssuedCount } = await adminClient
        .from('coupon_usages')
        .select('id', { count: 'exact', head: true })
        .eq('coupon_id', couponId);

      if ((totalIssuedCount || 0) + newUserIds.length > coupon.max_uses) {
        const remaining = coupon.max_uses - (totalIssuedCount || 0);
        return NextResponse.json(
          { error: `쿠폰 최대 발급 수를 초과합니다. (남은 발급 가능: ${Math.max(0, remaining)}건)` },
          { status: 400 }
        );
      }
    }

    // Calculate expires_at
    let expiresAt: string | null = null;
    if (coupon.valid_days_after_registration) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + coupon.valid_days_after_registration);
      expiresAt = expDate.toISOString();
    } else if (coupon.expires_at) {
      expiresAt = coupon.expires_at;
    }

    // Bulk insert coupon_usages
    const now = new Date().toISOString();
    const records = newUserIds.map((userId) => ({
      coupon_id: couponId,
      user_id: userId,
      registered_at: now,
      expires_at: expiresAt,
    }));

    const { error: insertError } = await adminClient
      .from('coupon_usages')
      .insert(records);

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: '일부 사용자에게 이미 쿠폰이 발급되어 있습니다. 다시 시도해 주세요.' },
          { status: 409 }
        );
      }
      throw new Error(insertError.message);
    }

    return NextResponse.json({
      data: {
        issued: newUserIds.length,
        skipped: userIds.length - newUserIds.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '쿠폰 발급에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
