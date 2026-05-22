import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  calculateFactoryAmount,
  findMatchingPricingByDimensions,
} from '@/lib/factoryPricing';

const requireAdmin = async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (profileError) return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  if (!profile || !isAdminLike(profile.role)) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { user };
};

interface ParamsContext {
  params: Promise<{ id: string }>;
}

/**
 * Auto-match a single artwork's pricing.
 * Body: {
 *   print_method_id: uuid,
 *   width_cm: number,
 *   height_cm: number,
 *   applied_quantity: number,
 *   factory_id?: uuid     // if provided, also matches factory pricing
 * }
 * Returns: {
 *   customer: { unit_price, total, matched_row | null },
 *   factory:  { unit_price, total, matched_row | null }
 * }
 * Caller (UI) decides whether to apply these into the artwork row.
 * No DB write happens here — this is a pure pricing query.
 */
export async function POST(request: Request, _context: ParamsContext) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const body = await request.json().catch(() => null);
    const printMethodId = body?.print_method_id;
    const widthCm = Number(body?.width_cm);
    const heightCm = Number(body?.height_cm);
    const appliedQuantity = Number(body?.applied_quantity);
    const factoryId = typeof body?.factory_id === 'string' && body.factory_id ? body.factory_id : null;

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

    // ----- Customer pricing match -----
    const { data: customerRows, error: customerErr } = await adminClient
      .from('customer_print_method_pricing')
      .select('id, max_width_cm, max_height_cm, pricing_model, unit_price, base_price, base_quantity, additional_price_per_piece, is_active, size')
      .eq('print_method_id', printMethodId)
      .eq('is_active', true);
    if (customerErr) return NextResponse.json({ error: customerErr.message }, { status: 500 });

    const customerMatch = findMatchingPricingByDimensions(customerRows || [], widthCm, heightCm);
    let customerUnit: number | null = null;
    let customerTotal: number | null = null;
    if (customerMatch) {
      // calculateFactoryAmount works on any pricing row with this shape
      customerTotal = calculateFactoryAmount(customerMatch as Parameters<typeof calculateFactoryAmount>[0], appliedQuantity);
      if (customerTotal !== null && appliedQuantity > 0) {
        customerUnit = Math.round((customerTotal / appliedQuantity) * 100) / 100;
      }
    }

    // ----- Factory pricing match (optional) -----
    let factoryMatch: Record<string, unknown> | null = null;
    let factoryUnit: number | null = null;
    let factoryTotal: number | null = null;
    if (factoryId) {
      const { data: factoryRows, error: factoryErr } = await adminClient
        .from('factory_print_method_pricing')
        .select('id, max_width_cm, max_height_cm, pricing_model, unit_price, base_price, base_quantity, additional_price_per_piece, is_active, size')
        .eq('factory_id', factoryId)
        .eq('print_method_id', printMethodId)
        .eq('is_active', true);
      if (factoryErr) return NextResponse.json({ error: factoryErr.message }, { status: 500 });

      const m = findMatchingPricingByDimensions(factoryRows || [], widthCm, heightCm);
      if (m) {
        factoryMatch = m as unknown as Record<string, unknown>;
        factoryTotal = calculateFactoryAmount(m as Parameters<typeof calculateFactoryAmount>[0], appliedQuantity);
        if (factoryTotal !== null && appliedQuantity > 0) {
          factoryUnit = Math.round((factoryTotal / appliedQuantity) * 100) / 100;
        }
      }
    }

    return NextResponse.json({
      data: {
        customer: {
          unit_price: customerUnit,
          total: customerTotal,
          matched_row: customerMatch,
        },
        factory: {
          unit_price: factoryUnit,
          total: factoryTotal,
          matched_row: factoryMatch,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '자동 매칭 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
