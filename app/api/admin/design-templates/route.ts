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
    const productId = url.searchParams.get('productId');
    const type = url.searchParams.get('type');

    const adminClient = createAdminClient();
    let query = adminClient
      .from('design_templates')
      .select('*')
      .order('sort_order', { ascending: true });

    if (productId) {
      query = query.eq('product_id', productId);
    }
    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '템플릿 데이터를 불러오지 못했습니다.';
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
    const description = payload?.description ?? null;
    const canvasState = payload?.canvas_state ?? {};
    const previewUrl = payload?.preview_url ?? null;
    const layerColors = payload?.layer_colors ?? {};
    const sortOrder = payload?.sort_order ?? 0;
    const isActive = payload?.is_active ?? true;
    const type = payload?.type ?? 'template';

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: '제품 ID가 필요합니다.' }, { status: 400 });
    }

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: '템플릿 제목이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('design_templates')
      .insert({
        product_id: productId,
        title,
        description,
        canvas_state: canvasState,
        preview_url: previewUrl,
        layer_colors: layerColors,
        sort_order: sortOrder,
        is_active: isActive,
        type,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '템플릿 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const templateId = payload?.id;

    if (!templateId || typeof templateId !== 'string') {
      return NextResponse.json({ error: '템플릿 ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof payload?.title === 'string') {
      updateData.title = payload.title;
    }

    if (payload?.description !== undefined) {
      updateData.description = payload.description ?? null;
    }

    if (payload?.canvas_state !== undefined) {
      updateData.canvas_state = payload.canvas_state;
    }

    if (payload?.preview_url !== undefined) {
      updateData.preview_url = payload.preview_url ?? null;
    }

    if (payload?.layer_colors !== undefined) {
      updateData.layer_colors = payload.layer_colors ?? {};
    }

    if (payload?.sort_order !== undefined) {
      updateData.sort_order = payload.sort_order;
    }

    if (payload?.is_active !== undefined) {
      updateData.is_active = payload.is_active;
    }

    if (typeof payload?.type === 'string') {
      updateData.type = payload.type;
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('design_templates')
      .update(updateData)
      .eq('id', templateId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '템플릿 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const templateId = url.searchParams.get('id');

    if (!templateId) {
      return NextResponse.json({ error: '템플릿 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('design_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: templateId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '템플릿 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
