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

const ANNOUNCEMENT_FIELDS =
  'id, title, content, category, is_published, image_links, created_at, updated_at';

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('announcements')
      .select(ANNOUNCEMENT_FIELDS)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '공지 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const title = payload?.title;
    const content = payload?.content;
    const isPublished = payload?.is_published ?? true;
    const imageLinks = Array.isArray(payload?.image_links)
      ? payload.image_links.filter((item: unknown) => typeof item === 'string')
      : [];

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: '제목이 필요합니다.' }, { status: 400 });
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: '내용이 필요합니다.' }, { status: 400 });
    }

    const category = payload?.category ?? 'notice';
    const validCategories = ['notice', 'fabric', 'printing', 'order_guide'];
    const finalCategory = validCategories.includes(category) ? category : 'notice';

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('announcements')
      .insert({
        title,
        content,
        category: finalCategory,
        is_published: Boolean(isPublished),
        image_links: imageLinks,
      })
      .select(ANNOUNCEMENT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공지 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const announcementId = payload?.id;

    if (!announcementId || typeof announcementId !== 'string') {
      return NextResponse.json({ error: '공지 ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof payload?.title === 'string') {
      updateData.title = payload.title;
    }

    if (typeof payload?.content === 'string') {
      updateData.content = payload.content;
    }

    if (typeof payload?.is_published === 'boolean') {
      updateData.is_published = payload.is_published;
    }

    if (Array.isArray(payload?.image_links)) {
      updateData.image_links = payload.image_links.filter((item: unknown) => typeof item === 'string');
    }

    if (typeof payload?.category === 'string') {
      const validCategories = ['notice', 'fabric', 'printing', 'order_guide'];
      if (validCategories.includes(payload.category)) {
        updateData.category = payload.category;
      }
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('announcements')
      .update(updateData)
      .eq('id', announcementId)
      .select(ANNOUNCEMENT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공지 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const announcementId = url.searchParams.get('announcementId') || url.searchParams.get('id');

    if (!announcementId) {
      return NextResponse.json({ error: '공지 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient.from('announcements').delete().eq('id', announcementId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: announcementId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공지 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
