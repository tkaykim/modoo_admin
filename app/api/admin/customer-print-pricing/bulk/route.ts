import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { validatePricingRow } from '@/lib/factoryPricing';

const SELECT_COLUMNS =
  'id, print_method_id, size, max_width_cm, max_height_cm, pricing_model, unit_price, base_price, base_quantity, additional_price_per_piece, is_active, note, created_at, updated_at, print_methods:print_method_id ( id, key, name )';

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

/**
 * Bulk replace customer pricing rows for ONE print_method.
 * Body: { print_method_id: string, rows: PricingRowInput[] }
 * - Deletes existing rows for this method that aren't in the new set
 * - Upserts provided rows on (print_method_id, size)
 */
export async function PUT(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const printMethodId = payload?.print_method_id;
    const rowsInput = payload?.rows;
    if (typeof printMethodId !== 'string' || !printMethodId) {
      return NextResponse.json({ error: 'print_method_id가 필요합니다.' }, { status: 400 });
    }
    if (!Array.isArray(rowsInput)) {
      return NextResponse.json({ error: 'rows 배열이 필요합니다.' }, { status: 400 });
    }

    const validated = rowsInput.map((row) =>
      validatePricingRow({ ...row, print_method_id: printMethodId })
    );
    for (let i = 0; i < validated.length; i += 1) {
      const r = validated[i];
      if ('error' in r) return NextResponse.json({ error: `행 ${i + 1}: ${r.error}` }, { status: 400 });
    }

    const seen = new Set<string>();
    for (const r of validated) {
      if ('error' in r) continue;
      const key = r.size;
      if (seen.has(key)) {
        return NextResponse.json({ error: `중복된 사이즈: ${r.size}` }, { status: 400 });
      }
      seen.add(key);
    }

    const rowsToWrite = validated
      .filter((r): r is Exclude<typeof r, { error: string }> => !('error' in r))
      .map((r) => ({
        print_method_id: printMethodId,
        size: r.size,
        max_width_cm: r.max_width_cm,
        max_height_cm: r.max_height_cm,
        pricing_model: r.pricing_model,
        unit_price: r.unit_price,
        base_price: r.base_price,
        base_quantity: r.base_quantity,
        additional_price_per_piece: r.additional_price_per_piece,
        is_active: r.is_active,
        note: r.note,
      }));

    const adminClient = createAdminClient();
    const { data: existing, error: fetchError } = await adminClient
      .from('customer_print_method_pricing')
      .select('id, size')
      .eq('print_method_id', printMethodId);
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

    const newKeys = new Set(rowsToWrite.map((r) => r.size));
    const idsToDelete = (existing || []).filter((e) => !newKeys.has(e.size)).map((e) => e.id);

    if (idsToDelete.length > 0) {
      const { error: delError } = await adminClient
        .from('customer_print_method_pricing')
        .delete()
        .in('id', idsToDelete)
        .eq('print_method_id', printMethodId);
      if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    if (rowsToWrite.length > 0) {
      const { error: upsertError } = await adminClient
        .from('customer_print_method_pricing')
        .upsert(
          rowsToWrite.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
          { onConflict: 'print_method_id,size' }
        );
      if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    const { data, error: reloadError } = await adminClient
      .from('customer_print_method_pricing')
      .select(SELECT_COLUMNS)
      .eq('print_method_id', printMethodId)
      .order('max_width_cm', { ascending: true, nullsFirst: false });
    if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 });

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '고객가 단가 일괄 저장에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
