import { NextResponse } from 'next/server';
import { isFactoryRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const SELECT_COLUMNS =
  'id, factory_id, print_method_id, size, max_width_cm, max_height_cm, pricing_model, unit_price, base_price, base_quantity, additional_price_per_piece, is_active, note, created_at, updated_at, print_methods:print_method_id ( id, key, name )';

/**
 * Read-only access for factory users to their OWN factory's pricing table.
 * Same shape as /api/admin/factory-print-pricing but scoped automatically
 * to session.manufacturer_id.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) return NextResponse.json({ error: authError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, manufacturer_id')
      .eq('id', user.id)
      .single();
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 403 });
    if (!profile || !isFactoryRole(profile.role)) {
      return NextResponse.json({ error: '공장 계정만 접근 가능합니다.' }, { status: 403 });
    }
    if (!profile.manufacturer_id) {
      return NextResponse.json({ error: '소속 공장이 없습니다.' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('factory_print_method_pricing')
      .select(SELECT_COLUMNS)
      .eq('factory_id', profile.manufacturer_id)
      .order('print_method_id', { ascending: true })
      .order('max_width_cm', { ascending: true, nullsFirst: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공장 단가표 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
