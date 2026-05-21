import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { validatePricingRow } from '@/lib/factoryPricing';

const SELECT_COLUMNS =
  'id, factory_id, print_method_id, size, pricing_model, unit_price, base_price, base_quantity, additional_price_per_piece, is_active, note, created_at, updated_at, print_methods:print_method_id ( id, key, name )';

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
 * Bulk replace pricing rows for a factory.
 * Body: { factory_id: string, rows: PricingRowInput[] }
 * - Validates all rows up front (no partial writes).
 * - Deletes any existing rows for this factory that are not in the new set.
 * - Upserts the provided rows on (factory_id, print_method_id, size).
 */
export async function PUT(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const factoryId = payload?.factory_id;
    const rowsInput = payload?.rows;

    if (typeof factoryId !== 'string' || !factoryId) {
      return NextResponse.json({ error: 'factory_id가 필요합니다.' }, { status: 400 });
    }
    if (!Array.isArray(rowsInput)) {
      return NextResponse.json({ error: 'rows 배열이 필요합니다.' }, { status: 400 });
    }

    const validated: Array<ReturnType<typeof validatePricingRow>> = rowsInput.map((row) =>
      validatePricingRow(row)
    );

    for (let i = 0; i < validated.length; i += 1) {
      const r = validated[i];
      if ('error' in r) {
        return NextResponse.json({ error: `행 ${i + 1}: ${r.error}` }, { status: 400 });
      }
    }

    // Detect duplicates within payload
    const seen = new Set<string>();
    for (const r of validated) {
      if ('error' in r) continue;
      const key = `${r.print_method_id}|${r.size}`;
      if (seen.has(key)) {
        return NextResponse.json(
          { error: `중복된 (인쇄기법, 사이즈) 항목이 있습니다: ${r.size}` },
          { status: 400 }
        );
      }
      seen.add(key);
    }

    const rowsToWrite = validated
      .filter((r): r is Exclude<typeof r, { error: string }> => !('error' in r))
      .map((r) => ({ factory_id: factoryId, ...r }));

    const adminClient = createAdminClient();

    // Fetch existing rows for this factory to compute deletes
    const { data: existing, error: fetchError } = await adminClient
      .from('factory_print_method_pricing')
      .select('id, print_method_id, size')
      .eq('factory_id', factoryId);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const newKeys = new Set(rowsToWrite.map((r) => `${r.print_method_id}|${r.size}`));
    const idsToDelete = (existing || [])
      .filter((e) => !newKeys.has(`${e.print_method_id}|${e.size}`))
      .map((e) => e.id);

    if (idsToDelete.length > 0) {
      const { error: delError } = await adminClient
        .from('factory_print_method_pricing')
        .delete()
        .in('id', idsToDelete);
      if (delError) {
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }
    }

    if (rowsToWrite.length > 0) {
      const { error: upsertError } = await adminClient
        .from('factory_print_method_pricing')
        .upsert(
          rowsToWrite.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
          { onConflict: 'factory_id,print_method_id,size' }
        );
      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    const { data, error: reloadError } = await adminClient
      .from('factory_print_method_pricing')
      .select(SELECT_COLUMNS)
      .eq('factory_id', factoryId)
      .order('size', { ascending: true });

    if (reloadError) {
      return NextResponse.json({ error: reloadError.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공장 단가 일괄 저장에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
