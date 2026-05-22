import { NextResponse } from 'next/server';
import { isFactoryRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  calculateFactoryAmount,
  findMatchingPricingByDimensions,
} from '@/lib/factoryPricing';

interface ParamsContext {
  params: Promise<{ id: string }>;
}

const requireFactoryAssigned = async (orderItemId: string) => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };

  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('role, manufacturer_id').eq('id', user.id).single();
  if (profileError) return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  if (!profile || !isFactoryRole(profile.role)) {
    return { error: NextResponse.json({ error: '공장 계정만 접근 가능합니다.' }, { status: 403 }) };
  }
  if (!profile.manufacturer_id) {
    return {
      error: NextResponse.json({ error: '소속 공장이 지정되지 않았습니다.' }, { status: 403 }),
    };
  }

  const adminClient = createAdminClient();
  const { data: orderItem, error: oiErr } = await adminClient
    .from('order_items')
    .select('id, assigned_manufacturer_id')
    .eq('id', orderItemId)
    .maybeSingle();
  if (oiErr) return { error: NextResponse.json({ error: oiErr.message }, { status: 500 }) };
  if (!orderItem) return { error: NextResponse.json({ error: '주문 품목 없음' }, { status: 404 }) };
  if (orderItem.assigned_manufacturer_id !== profile.manufacturer_id) {
    return { error: NextResponse.json({ error: '권한 없음' }, { status: 403 }) };
  }

  return { manufacturer_id: profile.manufacturer_id as string };
};

/**
 * Factory-side auto-match: only returns factory pricing for THIS factory.
 * Customer pricing is NOT returned (factory user has no business with that).
 */
export async function POST(request: Request, context: ParamsContext) {
  try {
    const { id: orderItemId } = await context.params;
    const authResult = await requireFactoryAssigned(orderItemId);
    if ('error' in authResult) return authResult.error;

    const body = await request.json().catch(() => null);
    const printMethodId = body?.print_method_id;
    const widthCm = Number(body?.width_cm);
    const heightCm = Number(body?.height_cm);
    const appliedQuantity = Number(body?.applied_quantity);

    if (typeof printMethodId !== 'string' || !printMethodId) {
      return NextResponse.json({ error: 'print_method_id가 필요합니다.' }, { status: 400 });
    }
    if (!Number.isFinite(widthCm) || widthCm <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) {
      return NextResponse.json({ error: 'width_cm, height_cm는 양수여야 합니다.' }, { status: 400 });
    }
    if (!Number.isFinite(appliedQuantity) || appliedQuantity <= 0) {
      return NextResponse.json({ error: 'applied_quantity는 양수여야 합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: factoryRows, error: factoryErr } = await adminClient
      .from('factory_print_method_pricing')
      .select('id, max_width_cm, max_height_cm, pricing_model, unit_price, base_price, base_quantity, additional_price_per_piece, is_active, size')
      .eq('factory_id', authResult.manufacturer_id)
      .eq('print_method_id', printMethodId)
      .eq('is_active', true);
    if (factoryErr) return NextResponse.json({ error: factoryErr.message }, { status: 500 });

    const match = findMatchingPricingByDimensions(factoryRows || [], widthCm, heightCm);
    let unitPrice: number | null = null;
    let total: number | null = null;
    if (match) {
      total = calculateFactoryAmount(match as Parameters<typeof calculateFactoryAmount>[0], appliedQuantity);
      if (total !== null && appliedQuantity > 0) {
        unitPrice = Math.round((total / appliedQuantity) * 100) / 100;
      }
    }

    return NextResponse.json({
      data: {
        // Factory side — customer pricing intentionally omitted
        factory: {
          unit_price: unitPrice,
          total,
          matched_row: match,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '자동 매칭 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
