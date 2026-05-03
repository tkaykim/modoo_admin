import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
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

  if (!profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
};

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
};

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const productId = url.searchParams.get('productId') || url.searchParams.get('product_id');

    if (!productId) {
      return NextResponse.json({ error: 'productId가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('product_colors')
      .select(`
        id,
        product_id,
        manufacturer_color_id,
        is_active,
        sort_order,
        created_at,
        updated_at,
        manufacturer_colors (
          id,
          name,
          hex,
          color_code,
          label
        )
      `)
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const productId = payload?.product_id ?? payload?.productId;
    const manufacturerColorId = payload?.manufacturer_color_id ?? payload?.manufacturerColorId;

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'product_id가 필요합니다.' }, { status: 400 });
    }

    if (!manufacturerColorId || typeof manufacturerColorId !== 'string') {
      return NextResponse.json({ error: 'manufacturer_color_id가 필요합니다.' }, { status: 400 });
    }

    const isActive = payload?.is_active ?? payload?.isActive ?? true;
    const sortOrder = payload?.sort_order ?? payload?.sortOrder ?? 0;

    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'is_active 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const sortOrderNumber = parseNumber(sortOrder);
    if (!Number.isFinite(sortOrderNumber) || sortOrderNumber < 0) {
      return NextResponse.json({ error: 'sort_order 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check if already exists
    const { data: existing } = await adminClient
      .from('product_colors')
      .select('id')
      .eq('product_id', productId)
      .eq('manufacturer_color_id', manufacturerColorId)
      .single();

    if (existing) {
      return NextResponse.json({ error: '이미 등록된 색상입니다.' }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from('product_colors')
      .insert({
        product_id: productId,
        manufacturer_color_id: manufacturerColorId,
        is_active: isActive,
        sort_order: sortOrderNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(`
        id,
        product_id,
        manufacturer_color_id,
        is_active,
        sort_order,
        created_at,
        updated_at,
        manufacturer_colors (
          id,
          name,
          hex,
          color_code,
          label
        )
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 추가에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const id = payload?.id;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload?.is_active !== undefined) {
      if (typeof payload.is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.is_active = payload.is_active;
    }

    if (payload?.sort_order !== undefined) {
      const sortOrderNumber = parseNumber(payload.sort_order);
      if (!Number.isFinite(sortOrderNumber) || sortOrderNumber < 0) {
        return NextResponse.json({ error: 'sort_order 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.sort_order = sortOrderNumber;
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('product_colors')
      .update(updateData)
      .eq('id', id)
      .select(`
        id,
        product_id,
        manufacturer_color_id,
        is_active,
        sort_order,
        created_at,
        updated_at,
        manufacturer_colors (
          id,
          name,
          hex,
          color_code,
          label
        )
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('product_colors')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

