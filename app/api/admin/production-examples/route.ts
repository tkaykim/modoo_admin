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

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('production_examples')
      .select(
        'id, product_id, title, description, image_url, sort_order, is_active, created_at, updated_at, product:products(id, title)'
      )
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '제작 사례 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const productId = payload?.product_id;
    const title = payload?.title;
    const description = payload?.description ?? '';
    const imageUrl = payload?.image_url;
    const sortOrder = Number(payload?.sort_order ?? 0);
    const isActive = payload?.is_active ?? true;

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: '제품 ID가 필요합니다.' }, { status: 400 });
    }

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: '제목이 필요합니다.' }, { status: 400 });
    }

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ error: '이미지 URL이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('production_examples')
      .insert({
        product_id: productId,
        title,
        description,
        image_url: imageUrl,
        sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
        is_active: Boolean(isActive),
      })
      .select(
        'id, product_id, title, description, image_url, sort_order, is_active, created_at, updated_at, product:products(id, title)'
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '제작 사례 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const exampleId = payload?.id;

    if (!exampleId || typeof exampleId !== 'string') {
      return NextResponse.json({ error: '제작 사례 ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof payload?.product_id === 'string') {
      updateData.product_id = payload.product_id;
    }

    if (typeof payload?.title === 'string') {
      updateData.title = payload.title;
    }

    if (typeof payload?.description === 'string') {
      updateData.description = payload.description;
    }

    if (typeof payload?.image_url === 'string') {
      updateData.image_url = payload.image_url;
    }

    if (payload?.sort_order !== undefined) {
      const sortOrder = Number(payload.sort_order);
      if (!Number.isNaN(sortOrder)) {
        updateData.sort_order = sortOrder;
      }
    }

    if (typeof payload?.is_active === 'boolean') {
      updateData.is_active = payload.is_active;
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('production_examples')
      .update(updateData)
      .eq('id', exampleId)
      .select(
        'id, product_id, title, description, image_url, sort_order, is_active, created_at, updated_at, product:products(id, title)'
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '제작 사례 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const exampleId = url.searchParams.get('exampleId') || url.searchParams.get('id');

    if (!exampleId) {
      return NextResponse.json({ error: '제작 사례 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('production_examples')
      .delete()
      .eq('id', exampleId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: exampleId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '제작 사례 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
