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

const POPUP_BANNER_SELECT_FIELDS =
  'id, title, image_url, redirect_url, sort_order, is_active, start_date, end_date, created_at, updated_at';

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('popup_banners')
      .select(POPUP_BANNER_SELECT_FIELDS)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '팝업 배너 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const title = payload?.title;
    const imageUrl = payload?.image_url;
    const redirectUrl = payload?.redirect_url ?? null;
    const sortOrder = Number(payload?.sort_order ?? 0);
    const isActive = payload?.is_active ?? true;
    const startDate = payload?.start_date || null;
    const endDate = payload?.end_date || null;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: '제목이 필요합니다.' }, { status: 400 });
    }

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ error: '이미지 URL이 필요합니다.' }, { status: 400 });
    }

    if (redirectUrl !== null && typeof redirectUrl !== 'string') {
      return NextResponse.json({ error: '링크 URL 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('popup_banners')
      .insert({
        title,
        image_url: imageUrl,
        redirect_url: redirectUrl,
        sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
        is_active: Boolean(isActive),
        start_date: startDate,
        end_date: endDate,
      })
      .select(POPUP_BANNER_SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '팝업 배너 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const bannerId = payload?.id;

    if (!bannerId || typeof bannerId !== 'string') {
      return NextResponse.json({ error: '팝업 배너 ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof payload?.title === 'string') {
      updateData.title = payload.title;
    }

    if (typeof payload?.image_url === 'string') {
      updateData.image_url = payload.image_url;
    }

    if (payload?.redirect_url !== undefined) {
      if (payload.redirect_url === null || typeof payload.redirect_url === 'string') {
        updateData.redirect_url = payload.redirect_url;
      }
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

    if (payload?.start_date !== undefined) {
      updateData.start_date = payload.start_date || null;
    }

    if (payload?.end_date !== undefined) {
      updateData.end_date = payload.end_date || null;
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('popup_banners')
      .update(updateData)
      .eq('id', bannerId)
      .select(POPUP_BANNER_SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '팝업 배너 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const bannerId = url.searchParams.get('bannerId') || url.searchParams.get('id');

    if (!bannerId) {
      return NextResponse.json({ error: '팝업 배너 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient.from('popup_banners').delete().eq('id', bannerId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: bannerId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '팝업 배너 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
