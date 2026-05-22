import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { calculateFactoryAmount, findMatchingPricingByDimensions } from '@/lib/factoryPricing';

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
  if (!profile || !isAdminLike(profile.role)) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { user };
};

/**
 * Lookup factory pricing for a (factory, print_method) and compute amount.
 * Two modes:
 *  - By label: ?factory_id=...&print_method_id=...&size=LABEL&quantity=N
 *  - By dimensions: ?factory_id=...&print_method_id=...&width_cm=X&height_cm=Y&quantity=N
 *    (picks the smallest pricing row whose max_width_cm/max_height_cm covers the artwork)
 * Returns: { data: { row, amount, quantity } | null }
 */
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const factoryId = url.searchParams.get('factory_id');
    const printMethodId = url.searchParams.get('print_method_id');
    const size = url.searchParams.get('size');
    const widthCmRaw = url.searchParams.get('width_cm');
    const heightCmRaw = url.searchParams.get('height_cm');
    const quantityRaw = url.searchParams.get('quantity');

    if (!factoryId || !printMethodId) {
      return NextResponse.json(
        { error: 'factory_id, print_method_id는 필수입니다.' },
        { status: 400 }
      );
    }
    const quantity = quantityRaw ? Number(quantityRaw) : 1;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'quantity는 양수여야 합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Mode 1: explicit size label
    if (size) {
      const { data, error } = await adminClient
        .from('factory_print_method_pricing')
        .select('*')
        .eq('factory_id', factoryId)
        .eq('print_method_id', printMethodId)
        .eq('size', size)
        .eq('is_active', true)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ data: null });
      const amount = calculateFactoryAmount(data, quantity);
      return NextResponse.json({ data: { row: data, amount, quantity } });
    }

    // Mode 2: artwork dimensions
    const widthCm = widthCmRaw ? Number(widthCmRaw) : NaN;
    const heightCm = heightCmRaw ? Number(heightCmRaw) : NaN;
    if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm)) {
      return NextResponse.json(
        { error: 'size 또는 (width_cm, height_cm) 중 하나가 필요합니다.' },
        { status: 400 }
      );
    }

    const { data: rows, error } = await adminClient
      .from('factory_print_method_pricing')
      .select('*')
      .eq('factory_id', factoryId)
      .eq('print_method_id', printMethodId)
      .eq('is_active', true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const match = findMatchingPricingByDimensions(rows || [], widthCm, heightCm);
    if (!match) return NextResponse.json({ data: null });
    const amount = calculateFactoryAmount(match, quantity);
    return NextResponse.json({ data: { row: match, amount, quantity } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공장 단가 조회에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
