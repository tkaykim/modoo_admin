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

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const productId = url.searchParams.get('product_id');
    const productIds = url.searchParams.get('product_ids');

    if (!productId && !productIds) {
      return NextResponse.json({ error: '제품 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    let query = adminClient.from('partner_mall_presets').select('*');

    if (productIds) {
      const ids = productIds.split(',').filter(Boolean);
      query = query.in('product_id', ids);
    } else if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data, error } = await query.order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '프리셋 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const productId = payload?.product_id;
    const name = payload?.name;
    const placement = payload?.placement;

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: '제품 ID가 필요합니다.' }, { status: 400 });
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: '프리셋 이름이 필요합니다.' }, { status: 400 });
    }

    if (!placement || typeof placement !== 'object' ||
        typeof placement.x !== 'number' || typeof placement.y !== 'number' ||
        typeof placement.width !== 'number' || typeof placement.height !== 'number') {
      return NextResponse.json({ error: '배치 형식이 올바르지 않습니다. (x, y, width, height 필요)' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await adminClient
      .from('partner_mall_presets')
      .insert({
        product_id: productId,
        name,
        placement: { x: placement.x, y: placement.y, width: placement.width, height: placement.height },
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '같은 이름의 프리셋이 이미 존재합니다.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '프리셋 생성에 실패했습니다.';
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
      return NextResponse.json({ error: '프리셋 ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload?.name !== undefined) {
      if (typeof payload.name !== 'string' || !payload.name) {
        return NextResponse.json({ error: '프리셋 이름이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.name = payload.name;
    }

    if (payload?.placement !== undefined) {
      const p = payload.placement;
      if (!p || typeof p !== 'object' ||
          typeof p.x !== 'number' || typeof p.y !== 'number' ||
          typeof p.width !== 'number' || typeof p.height !== 'number') {
        return NextResponse.json({ error: '배치 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.placement = { x: p.x, y: p.y, width: p.width, height: p.height };
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('partner_mall_presets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '같은 이름의 프리셋이 이미 존재합니다.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '프리셋 업데이트에 실패했습니다.';
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
      return NextResponse.json({ error: '프리셋 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('partner_mall_presets')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '프리셋 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
