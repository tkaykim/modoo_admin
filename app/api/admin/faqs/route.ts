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

const FAQ_SELECT_FIELDS =
  'id, question, answer, category, tags, sort_order, is_published, created_by, updated_by, created_at, updated_at';

const sanitizeTags = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.filter((item: unknown) => typeof item === 'string' && item.trim().length > 0);
};

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('faqs')
      .select(FAQ_SELECT_FIELDS)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FAQ 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const question = payload?.question;
    const answer = payload?.answer;
    const category = payload?.category;
    const tags = sanitizeTags(payload?.tags);
    const sortOrder = Number(payload?.sort_order ?? 0);
    const isPublished = payload?.is_published ?? true;

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: '질문이 필요합니다.' }, { status: 400 });
    }

    if (!answer || typeof answer !== 'string') {
      return NextResponse.json({ error: '답변이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('faqs')
      .insert({
        question: question.trim(),
        answer: answer.trim(),
        category: typeof category === 'string' && category.trim().length > 0 ? category.trim() : null,
        tags,
        sort_order: Number.isNaN(sortOrder) ? 0 : sortOrder,
        is_published: Boolean(isPublished),
        created_by: authResult.user.id,
        updated_by: authResult.user.id,
      })
      .select(FAQ_SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FAQ 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const faqId = payload?.id;

    if (!faqId || typeof faqId !== 'string') {
      return NextResponse.json({ error: 'FAQ ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: authResult.user.id,
    };

    if (typeof payload?.question === 'string') {
      updateData.question = payload.question.trim();
    }

    if (typeof payload?.answer === 'string') {
      updateData.answer = payload.answer.trim();
    }

    if (payload?.category !== undefined) {
      if (payload.category === null) {
        updateData.category = null;
      } else if (typeof payload.category === 'string') {
        updateData.category = payload.category.trim() || null;
      }
    }

    if (Array.isArray(payload?.tags)) {
      updateData.tags = sanitizeTags(payload.tags);
    }

    if (payload?.sort_order !== undefined) {
      const sortOrder = Number(payload.sort_order);
      if (!Number.isNaN(sortOrder)) {
        updateData.sort_order = sortOrder;
      }
    }

    if (typeof payload?.is_published === 'boolean') {
      updateData.is_published = payload.is_published;
    }

    if (Object.keys(updateData).length === 2) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('faqs')
      .update(updateData)
      .eq('id', faqId)
      .select(FAQ_SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FAQ 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const faqId = url.searchParams.get('faqId') || url.searchParams.get('id');

    if (!faqId) {
      return NextResponse.json({ error: 'FAQ ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient.from('faqs').delete().eq('id', faqId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: faqId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FAQ 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

