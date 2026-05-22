import { NextResponse } from 'next/server';
import { isFactoryRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const SELECT_COLUMNS =
  'id, order_item_id, print_method_id, placement, size_label, width_cm, height_cm, applied_quantity, customer_unit_price, customer_total, customer_pricing_snapshot, factory_pricing_row_id, factory_unit_price, factory_total, factory_cost_source, note, created_at, updated_at, print_methods:print_method_id ( id, key, name )';

/**
 * Factory user view of artworks for a specific order_item.
 * - GET: list artworks of an order_item assigned to this factory user.
 * - PATCH: update ONLY factory_* and note fields on a row.
 *          Other fields (print_method_id, placement, size_label, width_cm,
 *          height_cm, applied_quantity, customer_*) are IGNORED.
 * - No POST / DELETE — factory cannot add or remove artwork rows.
 *   Admin must add/remove via /api/admin/order-items.
 */

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
    .from('profiles')
    .select('role, manufacturer_id')
    .eq('id', user.id)
    .single();
  if (profileError) return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  if (!profile || !isFactoryRole(profile.role)) {
    return { error: NextResponse.json({ error: '공장 계정만 접근 가능합니다.' }, { status: 403 }) };
  }
  if (!profile.manufacturer_id) {
    return {
      error: NextResponse.json(
        { error: '소속 공장이 지정되지 않은 계정입니다.' },
        { status: 403 }
      ),
    };
  }

  // Verify the order_item is assigned to this factory
  const adminClient = createAdminClient();
  const { data: orderItem, error: oiErr } = await adminClient
    .from('order_items')
    .select('id, assigned_manufacturer_id')
    .eq('id', orderItemId)
    .maybeSingle();
  if (oiErr) return { error: NextResponse.json({ error: oiErr.message }, { status: 500 }) };
  if (!orderItem) return { error: NextResponse.json({ error: '주문 품목을 찾을 수 없습니다.' }, { status: 404 }) };
  if (orderItem.assigned_manufacturer_id !== profile.manufacturer_id) {
    return { error: NextResponse.json({ error: '이 주문 품목에 접근 권한이 없습니다.' }, { status: 403 }) };
  }

  return { manufacturer_id: profile.manufacturer_id as string, userId: user.id };
};

export async function GET(_request: Request, context: ParamsContext) {
  try {
    const { id: orderItemId } = await context.params;
    const authResult = await requireFactoryAssigned(orderItemId);
    if ('error' in authResult) return authResult.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('order_item_artworks')
      .select(SELECT_COLUMNS)
      .eq('order_item_id', orderItemId)
      .order('placement', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '아트워크 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const { id: orderItemId } = await context.params;
    const authResult = await requireFactoryAssigned(orderItemId);
    if ('error' in authResult) return authResult.error;

    const payload = await request.json().catch(() => null);
    const artworkId = payload?.id;
    if (typeof artworkId !== 'string' || !artworkId) {
      return NextResponse.json({ error: 'artwork id가 필요합니다.' }, { status: 400 });
    }

    // Whitelist: only factory_* + note are mutable by factory user.
    const validSources = ['auto_match', 'manual', 'negotiated', 'override'];
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if ('factory_unit_price' in payload) {
      updateData.factory_unit_price = toNumber(payload.factory_unit_price);
    }
    if ('factory_total' in payload) {
      updateData.factory_total = toNumber(payload.factory_total);
    }
    if ('factory_cost_source' in payload) {
      const v = payload.factory_cost_source;
      updateData.factory_cost_source =
        typeof v === 'string' && validSources.includes(v) ? v : null;
    }
    if ('note' in payload) {
      updateData.note = typeof payload.note === 'string' ? payload.note : null;
    }

    // Defense in depth: verify the artwork row belongs to this order_item
    const adminClient = createAdminClient();
    const { data: existing, error: existErr } = await adminClient
      .from('order_item_artworks')
      .select('id, order_item_id')
      .eq('id', artworkId)
      .maybeSingle();
    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: '아트워크 행을 찾을 수 없습니다.' }, { status: 404 });
    if (existing.order_item_id !== orderItemId) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { data, error } = await adminClient
      .from('order_item_artworks')
      .update(updateData)
      .eq('id', artworkId)
      .eq('order_item_id', orderItemId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '아트워크 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
