import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  if (!profile || !isAdminLike(profile.role)) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { user };
};

// salesman TeamCategory 와 정렬
const CATEGORIES = ['학교', '기업', '동호회', '매장', '댄스', '기타'];
const ORG_STATUSES = ['new', 'researching', 'contacted', 'responded', 'converted', 'disqualified'];
const ORG_SELECT =
  'id, name, category, region, size, homepage, domain, source, status, tags, note, partner_mall_id, assigned_salesman_id, created_at, updated_at';

// ── PATCH: 단체 수정 (카테고리/지역/담당영업/상태 등) ────────────────────────
export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const id = payload?.id;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '단체 ID가 필요합니다.' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (typeof payload.name === 'string' && payload.name.trim()) update.name = payload.name.trim();
    if (typeof payload.region === 'string') update.region = payload.region.trim() || null;
    if (typeof payload.note === 'string') update.note = payload.note;
    if (payload.size === null || typeof payload.size === 'number') update.size = payload.size;

    if (payload.category !== undefined) {
      if (payload.category === null || payload.category === '') {
        update.category = null;
      } else if (CATEGORIES.includes(payload.category)) {
        update.category = payload.category;
      } else {
        return NextResponse.json({ error: '잘못된 카테고리입니다.' }, { status: 400 });
      }
    }

    if (typeof payload.status === 'string') {
      if (!ORG_STATUSES.includes(payload.status)) {
        return NextResponse.json({ error: '잘못된 상태값입니다.' }, { status: 400 });
      }
      update.status = payload.status;
    }

    if (payload.assigned_salesman_id !== undefined) {
      update.assigned_salesman_id =
        payload.assigned_salesman_id === null || payload.assigned_salesman_id === ''
          ? null
          : payload.assigned_salesman_id;
    }

    if (Array.isArray(payload.tags)) {
      update.tags = payload.tags.filter((t: unknown) => typeof t === 'string' && t.trim().length > 0);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: '수정할 항목이 없습니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('lead_organizations')
      .update(update)
      .eq('id', id)
      .select(ORG_SELECT)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '단체 수정에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
