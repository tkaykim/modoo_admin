import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const SELECT_COLUMNS =
  'id, order_item_id, print_method_id, placement, size_label, width_cm, height_cm, applied_quantity, customer_unit_price, customer_total, customer_pricing_snapshot, factory_pricing_row_id, factory_unit_price, factory_total, factory_cost_source, additional_amount, note, created_at, updated_at, print_methods:print_method_id ( id, key, name )';

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

const VALID_COST_SOURCES = ['auto_match', 'manual', 'negotiated', 'override'] as const;

const toNumberOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const toIntOrNull = (v: unknown): number | null => {
  const n = toNumberOrNull(v);
  return n === null ? null : Math.round(n);
};
const toCostSource = (v: unknown): string | null =>
  typeof v === 'string' && (VALID_COST_SOURCES as readonly string[]).includes(v) ? v : null;

/**
 * Build the FULL artwork payload for INSERT — every column gets a value
 * (null if absent). Used by POST only.
 */
const buildFullArtworkPayload = (input: unknown): Record<string, unknown> | { error: string } => {
  if (!input || typeof input !== 'object') return { error: '유효한 아트워크 데이터가 필요합니다.' };
  const row = input as Record<string, unknown>;
  return {
    print_method_id: typeof row.print_method_id === 'string' && row.print_method_id ? row.print_method_id : null,
    placement: typeof row.placement === 'string' && row.placement ? row.placement : null,
    size_label: typeof row.size_label === 'string' && row.size_label ? row.size_label : null,
    width_cm: toNumberOrNull(row.width_cm),
    height_cm: toNumberOrNull(row.height_cm),
    applied_quantity: toIntOrNull(row.applied_quantity),
    customer_unit_price: toNumberOrNull(row.customer_unit_price),
    customer_total: toNumberOrNull(row.customer_total),
    customer_pricing_snapshot: row.customer_pricing_snapshot ?? null,
    factory_pricing_row_id: typeof row.factory_pricing_row_id === 'string' && row.factory_pricing_row_id
      ? row.factory_pricing_row_id : null,
    factory_unit_price: toNumberOrNull(row.factory_unit_price),
    factory_total: toNumberOrNull(row.factory_total),
    factory_cost_source: toCostSource(row.factory_cost_source),
    additional_amount: toNumberOrNull(row.additional_amount),
    note: typeof row.note === 'string' ? row.note : null,
  };
};

/**
 * Build a PARTIAL update payload for PATCH — only the keys present in the
 * input become part of the update. This prevents the admin modal from
 * accidentally nulling fields (e.g. customer_* values populated by
 * modoo_app in the future) just because it doesn't send them.
 *
 * Convention: a key being present in `input` means "update this column".
 * A key being absent means "leave the column untouched".
 */
const buildPartialUpdate = (input: unknown): Record<string, unknown> | { error: string } => {
  if (!input || typeof input !== 'object') return { error: '유효한 아트워크 데이터가 필요합니다.' };
  const row = input as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if ('print_method_id' in row) {
    update.print_method_id =
      typeof row.print_method_id === 'string' && row.print_method_id ? row.print_method_id : null;
  }
  if ('placement' in row) {
    update.placement = typeof row.placement === 'string' && row.placement ? row.placement : null;
  }
  if ('size_label' in row) {
    update.size_label = typeof row.size_label === 'string' && row.size_label ? row.size_label : null;
  }
  if ('width_cm' in row) update.width_cm = toNumberOrNull(row.width_cm);
  if ('height_cm' in row) update.height_cm = toNumberOrNull(row.height_cm);
  if ('applied_quantity' in row) update.applied_quantity = toIntOrNull(row.applied_quantity);
  if ('customer_unit_price' in row) update.customer_unit_price = toNumberOrNull(row.customer_unit_price);
  if ('customer_total' in row) update.customer_total = toNumberOrNull(row.customer_total);
  if ('customer_pricing_snapshot' in row) update.customer_pricing_snapshot = row.customer_pricing_snapshot ?? null;
  if ('factory_pricing_row_id' in row) {
    update.factory_pricing_row_id =
      typeof row.factory_pricing_row_id === 'string' && row.factory_pricing_row_id
        ? row.factory_pricing_row_id
        : null;
  }
  if ('factory_unit_price' in row) update.factory_unit_price = toNumberOrNull(row.factory_unit_price);
  if ('factory_total' in row) update.factory_total = toNumberOrNull(row.factory_total);
  if ('factory_cost_source' in row) update.factory_cost_source = toCostSource(row.factory_cost_source);
  if ('additional_amount' in row) update.additional_amount = toNumberOrNull(row.additional_amount);
  if ('note' in row) update.note = typeof row.note === 'string' ? row.note : null;

  return update;
};

export async function GET(_request: Request, context: ParamsContext) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const { id: orderItemId } = await context.params;
    if (!orderItemId) return NextResponse.json({ error: 'order-item id가 필요합니다.' }, { status: 400 });

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

export async function POST(request: Request, context: ParamsContext) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const { id: orderItemId } = await context.params;
    if (!orderItemId) return NextResponse.json({ error: 'order-item id가 필요합니다.' }, { status: 400 });

    const payload = await request.json().catch(() => null);
    const validated = buildFullArtworkPayload(payload);
    if ('error' in validated) return NextResponse.json({ error: validated.error }, { status: 400 });

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('order_item_artworks')
      .insert({ order_item_id: orderItemId, ...validated })
      .select(SELECT_COLUMNS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '아트워크 생성 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const { id: orderItemId } = await context.params;
    const payload = await request.json().catch(() => null);
    const artworkId = payload?.id;
    if (typeof artworkId !== 'string' || !artworkId) {
      return NextResponse.json({ error: 'artwork id가 필요합니다.' }, { status: 400 });
    }

    const validated = buildPartialUpdate(payload);
    if ('error' in validated) return NextResponse.json({ error: validated.error }, { status: 400 });

    // Strip our control field (id) from the payload — it must never go to update
    delete (validated as Record<string, unknown>).id;

    if (Object.keys(validated).length === 0) {
      return NextResponse.json({ error: '업데이트할 필드가 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('order_item_artworks')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', artworkId)
      .eq('order_item_id', orderItemId) // defense in depth
      .select(SELECT_COLUMNS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '아트워크 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: ParamsContext) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const { id: orderItemId } = await context.params;
    const url = new URL(request.url);
    const artworkId = url.searchParams.get('artwork_id');
    if (!artworkId) return NextResponse.json({ error: 'artwork_id가 필요합니다.' }, { status: 400 });

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('order_item_artworks')
      .delete()
      .eq('id', artworkId)
      .eq('order_item_id', orderItemId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { id: artworkId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '아트워크 삭제 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
