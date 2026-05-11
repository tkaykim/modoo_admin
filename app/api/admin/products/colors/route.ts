import { NextRequest, NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

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

const isStringMap = (value: unknown): value is Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string');
};

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');
  const includeInactive = searchParams.get('includeInactive') === 'true';

  if (!productId) {
    return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  }

  try {
    let query = supabase
      .from('product_colors')
      .select(`
        *,
        manufacturer_colors (
          id,
          name,
          hex,
          color_code,
          label
        )
      `)
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching product colors:', error);
    return NextResponse.json({ error: 'Failed to fetch product colors' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const productId = payload?.product_id;
    const manufacturerColorId = payload?.manufacturer_color_id;

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'product_id가 필요합니다.' }, { status: 400 });
    }
    if (!manufacturerColorId || typeof manufacturerColorId !== 'string') {
      return NextResponse.json({ error: 'manufacturer_color_id가 필요합니다.' }, { status: 400 });
    }

    const isActive = typeof payload?.is_active === 'boolean' ? payload.is_active : true;
    const sortOrder = Number.isFinite(Number(payload?.sort_order)) ? Number(payload.sort_order) : 0;
    const sideMockups = payload?.side_mockups ?? {};
    if (!isStringMap(sideMockups)) {
      return NextResponse.json({ error: 'side_mockups는 { sideId: imageUrl } 형식이어야 합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('product_colors')
      .insert({
        product_id: productId,
        manufacturer_color_id: manufacturerColorId,
        is_active: isActive,
        sort_order: sortOrder,
        side_mockups: sideMockups,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(`*, manufacturer_colors (id, name, hex, color_code, label)`)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 등록에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const id = payload?.id;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'product_color id가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (payload?.is_active !== undefined) {
      if (typeof payload.is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.is_active = payload.is_active;
    }

    if (payload?.sort_order !== undefined) {
      const sortOrder = Number(payload.sort_order);
      if (Number.isNaN(sortOrder)) {
        return NextResponse.json({ error: 'sort_order 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.sort_order = sortOrder;
    }

    if (payload?.side_mockups !== undefined) {
      if (!isStringMap(payload.side_mockups)) {
        return NextResponse.json({ error: 'side_mockups는 { sideId: imageUrl } 형식이어야 합니다.' }, { status: 400 });
      }
      updateData.side_mockups = payload.side_mockups;
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('product_colors')
      .update(updateData)
      .eq('id', id)
      .select(`*, manufacturer_colors (id, name, hex, color_code, label)`)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 수정에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient.from('product_colors').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
