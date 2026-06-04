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

const HERO_BANNER_SELECT_FIELDS =
  'id, title, subtitle, image_link, redirect_link, sort_order, is_active, image_focal_x, image_focal_y, image_zoom, created_at, updated_at';

// 위치(0~100) / 줌(1.0~4.0) 값을 안전 범위로 정규화
const clampFocal = (value: unknown, fallback: number) => {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.min(100, Math.max(0, num));
};

const clampZoom = (value: unknown, fallback: number) => {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.min(4, Math.max(1, num));
};

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('hero_banners')
      .select(HERO_BANNER_SELECT_FIELDS)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '히어로 배너 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const title = payload?.title;
    const subtitle = payload?.subtitle;
    const imageLink = payload?.image_link;
    const redirectLink = payload?.redirect_link ?? null;
    const sortOrder = Number(payload?.sort_order ?? 0);
    const isActive = payload?.is_active ?? true;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: '제목이 필요합니다.' }, { status: 400 });
    }

    if (!subtitle || typeof subtitle !== 'string') {
      return NextResponse.json({ error: '부제목이 필요합니다.' }, { status: 400 });
    }

    if (!imageLink || typeof imageLink !== 'string') {
      return NextResponse.json({ error: '이미지 URL이 필요합니다.' }, { status: 400 });
    }

    if (redirectLink !== null && typeof redirectLink !== 'string') {
      return NextResponse.json({ error: '링크 URL 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('hero_banners')
      .insert({
        title,
        subtitle,
        image_link: imageLink,
        redirect_link: redirectLink,
        sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
        is_active: Boolean(isActive),
        image_focal_x: clampFocal(payload?.image_focal_x, 50),
        image_focal_y: clampFocal(payload?.image_focal_y, 50),
        image_zoom: clampZoom(payload?.image_zoom, 1),
      })
      .select(HERO_BANNER_SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '히어로 배너 생성에 실패했습니다.';
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
      return NextResponse.json({ error: '히어로 배너 ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof payload?.title === 'string') {
      updateData.title = payload.title;
    }

    if (typeof payload?.subtitle === 'string') {
      updateData.subtitle = payload.subtitle;
    }

    if (typeof payload?.image_link === 'string') {
      updateData.image_link = payload.image_link;
    }

    if (payload?.redirect_link !== undefined) {
      if (payload.redirect_link === null || typeof payload.redirect_link === 'string') {
        updateData.redirect_link = payload.redirect_link;
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

    if (payload?.image_focal_x !== undefined) {
      updateData.image_focal_x = clampFocal(payload.image_focal_x, 50);
    }

    if (payload?.image_focal_y !== undefined) {
      updateData.image_focal_y = clampFocal(payload.image_focal_y, 50);
    }

    if (payload?.image_zoom !== undefined) {
      updateData.image_zoom = clampZoom(payload.image_zoom, 1);
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('hero_banners')
      .update(updateData)
      .eq('id', bannerId)
      .select(HERO_BANNER_SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '히어로 배너 업데이트에 실패했습니다.';
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
      return NextResponse.json({ error: '히어로 배너 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient.from('hero_banners').delete().eq('id', bannerId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: bannerId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '히어로 배너 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
