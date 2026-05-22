import { NextResponse } from 'next/server';
import { isFactoryRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { validatePricingRow } from '@/lib/factoryPricing';

const SELECT_COLUMNS =
  'id, factory_id, print_method_id, size, max_width_cm, max_height_cm, pricing_model, unit_price, base_price, base_quantity, additional_price_per_piece, is_active, note, created_at, updated_at, print_methods:print_method_id ( id, key, name )';

const requireFactoryUser = async () => {
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
    .select('role, manufacturer_id')
    .eq('id', user.id)
    .single();
  if (profileError) {
    return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  }
  if (!profile || !isFactoryRole(profile.role)) {
    return { error: NextResponse.json({ error: '공장 계정만 접근 가능합니다.' }, { status: 403 }) };
  }
  if (!profile.manufacturer_id || typeof profile.manufacturer_id !== 'string') {
    return {
      error: NextResponse.json(
        { error: '소속 공장이 지정되지 않은 계정입니다. 관리자에게 문의해주세요.' },
        { status: 403 }
      ),
    };
  }
  return { manufacturer_id: profile.manufacturer_id as string };
};

/**
 * Bulk replace pricing rows for the authenticated factory.
 * Body: { rows: PricingRowInput[] } — factory_id is taken from the session,
 * any client-supplied factory_id is ignored.
 */
export async function PUT(request: Request) {
  try {
    const authResult = await requireFactoryUser();
    if ('error' in authResult) return authResult.error;
    const factoryId = authResult.manufacturer_id;

    const payload = await request.json().catch(() => null);
    const rowsInput = payload?.rows;
    if (!Array.isArray(rowsInput)) {
      return NextResponse.json({ error: 'rows 배열이 필요합니다.' }, { status: 400 });
    }

    const validated = rowsInput.map((row) => validatePricingRow(row));
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

    const { data: existing, error: fetchError } = await adminClient
      .from('factory_print_method_pricing')
      .select('id, print_method_id, size')
      .eq('factory_id', factoryId);
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

    const newKeys = new Set(rowsToWrite.map((r) => `${r.print_method_id}|${r.size}`));
    const idsToDelete = (existing || [])
      .filter((e) => !newKeys.has(`${e.print_method_id}|${e.size}`))
      .map((e) => e.id);

    if (idsToDelete.length > 0) {
      const { error: delError } = await adminClient
        .from('factory_print_method_pricing')
        .delete()
        .in('id', idsToDelete)
        .eq('factory_id', factoryId); // defense in depth
      if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    if (rowsToWrite.length > 0) {
      const { error: upsertError } = await adminClient
        .from('factory_print_method_pricing')
        .upsert(
          rowsToWrite.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
          { onConflict: 'factory_id,print_method_id,size' }
        );
      if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    const { data, error: reloadError } = await adminClient
      .from('factory_print_method_pricing')
      .select(SELECT_COLUMNS)
      .eq('factory_id', factoryId)
      .order('size', { ascending: true });
    if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 500 });

    return NextResponse.json({ data: data || [], factory_id: factoryId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '단가 일괄 저장에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
