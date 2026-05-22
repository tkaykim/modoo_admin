import { NextResponse } from 'next/server';
import { isFactoryRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { validatePricingRow } from '@/lib/factoryPricing';

const SELECT_COLUMNS =
  'id, factory_id, print_method_id, size, max_width_cm, max_height_cm, pricing_model, unit_price, base_price, base_quantity, additional_price_per_piece, is_active, note, created_at, updated_at, print_methods:print_method_id ( id, key, name )';

/**
 * Resolves the logged-in factory user's manufacturer_id.
 * - Returns the canonical manufacturer_id on success.
 * - Returns a NextResponse error if the user is not a factory user
 *   or has no manufacturer assigned. The factory_id is NEVER taken from the
 *   client payload — it's always derived from the authenticated user's profile.
 */
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
  return { manufacturer_id: profile.manufacturer_id as string, userId: user.id };
};

export async function GET() {
  try {
    const authResult = await requireFactoryUser();
    if ('error' in authResult) return authResult.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('factory_print_method_pricing')
      .select(SELECT_COLUMNS)
      .eq('factory_id', authResult.manufacturer_id)
      .order('size', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [], factory_id: authResult.manufacturer_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : '단가 조회에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireFactoryUser();
    if ('error' in authResult) return authResult.error;

    const payload = await request.json().catch(() => null);
    const validated = validatePricingRow(payload);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('factory_print_method_pricing')
      .insert({ factory_id: authResult.manufacturer_id, ...validated })
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      const status = error.code === '23505' ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '단가 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireFactoryUser();
    if ('error' in authResult) return authResult.error;

    const payload = await request.json().catch(() => null);
    const id = payload?.id;
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }
    const validated = validatePricingRow(payload);
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const adminClient = createAdminClient();
    // Guard: ensure the target row belongs to this factory before updating
    const { data: existing, error: existingErr } = await adminClient
      .from('factory_print_method_pricing')
      .select('id, factory_id')
      .eq('id', id)
      .maybeSingle();
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: '대상 행을 찾을 수 없습니다.' }, { status: 404 });
    if (existing.factory_id !== authResult.manufacturer_id) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { data, error } = await adminClient
      .from('factory_print_method_pricing')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '단가 수정에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireFactoryUser();
    if ('error' in authResult) return authResult.error;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    // Scope the delete by id AND factory_id — defense in depth even though RLS would also block.
    const { error } = await adminClient
      .from('factory_print_method_pricing')
      .delete()
      .eq('id', id)
      .eq('factory_id', authResult.manufacturer_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '단가 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
