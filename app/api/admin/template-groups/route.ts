import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
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

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const withInstances = url.searchParams.get('withInstances') === '1';

    const adminClient = createAdminClient();

    if (id) {
      const { data: group, error } = await adminClient
        .from('template_groups')
        .select('*')
        .eq('id', id)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      if (withInstances) {
        const { data: templates, error: tErr } = await adminClient
          .from('design_templates')
          .select('id, product_id, title, preview_url, is_active, sort_order, products:product_id (id, title, thumbnail_image_link, base_price)')
          .eq('template_group_id', id)
          .order('sort_order', { ascending: true });
        if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
        return NextResponse.json({ data: { ...group, templates: templates ?? [] } });
      }
      return NextResponse.json({ data: group });
    }

    const { data, error } = await adminClient
      .from('template_groups')
      .select('*, design_templates:design_templates!design_templates_template_group_id_fkey (id)')
      .order('sort_order', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // attach simple instance_count for list views
    const enriched = (data ?? []).map((g: { design_templates?: { id: string }[] } & Record<string, unknown>) => {
      const { design_templates, ...rest } = g;
      return { ...rest, instance_count: design_templates?.length ?? 0 };
    });
    return NextResponse.json({ data: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : '그룹을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const payload = await request.json().catch(() => null);
    const title = payload?.title;
    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: '제목이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('template_groups')
      .insert({
        title,
        description: payload?.description ?? null,
        category: typeof payload?.category === 'string' ? payload.category : null,
        tags: Array.isArray(payload?.tags) ? payload.tags : [],
        preview_url: payload?.preview_url ?? null,
        is_active: payload?.is_active ?? true,
        is_featured: payload?.is_featured === true,
        sort_order: payload?.sort_order ?? 0,
        artwork_state:
          payload?.artwork_state && typeof payload.artwork_state === 'object'
            ? payload.artwork_state
            : {},
        artwork_canvas_size:
          payload?.artwork_canvas_size && typeof payload.artwork_canvas_size === 'object'
            ? payload.artwork_canvas_size
            : { width: 800, height: 800 },
        slot_manifest: Array.isArray(payload?.slot_manifest) ? payload.slot_manifest : [],
      })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '그룹 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const payload = await request.json().catch(() => null);
    const id = payload?.id;
    if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof payload.title === 'string') update.title = payload.title;
    if (payload.description !== undefined) update.description = payload.description ?? null;
    if (payload.category !== undefined) update.category = typeof payload.category === 'string' ? payload.category : null;
    if (payload.tags !== undefined) update.tags = Array.isArray(payload.tags) ? payload.tags : [];
    if (payload.preview_url !== undefined) update.preview_url = payload.preview_url ?? null;
    if (payload.is_active !== undefined) update.is_active = payload.is_active === true;
    if (payload.is_featured !== undefined) update.is_featured = payload.is_featured === true;
    if (payload.sort_order !== undefined) update.sort_order = payload.sort_order;
    if (payload.artwork_state !== undefined) {
      update.artwork_state =
        payload.artwork_state && typeof payload.artwork_state === 'object' ? payload.artwork_state : {};
    }
    if (payload.artwork_canvas_size !== undefined) {
      update.artwork_canvas_size =
        payload.artwork_canvas_size && typeof payload.artwork_canvas_size === 'object'
          ? payload.artwork_canvas_size
          : { width: 800, height: 800 };
    }
    if (payload.slot_manifest !== undefined) {
      update.slot_manifest = Array.isArray(payload.slot_manifest) ? payload.slot_manifest : [];
    }

    if (Object.keys(update).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('template_groups')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '그룹 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const adminClient = createAdminClient();
    // FK is on delete set null — instances become single templates after group removal.
    const { error } = await adminClient.from('template_groups').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '그룹 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
