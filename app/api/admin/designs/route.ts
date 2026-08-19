import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const DESIGN_SELECT = `
        *,
        user:profiles!saved_designs_user_id_fkey(id, email, name),
        product:products!saved_designs_product_id_fkey(id, title, thumbnail_image_link)
      `;

const toInt = (raw: string | null, fallback: number, min: number, max: number) => {
  const parsed = parseInt(raw || '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 403 });
    }

    if (!profile || (!isAdminLike(profile.role))) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const page = toInt(url.searchParams.get('page'), 1, 1, 100000);
    const limit = toInt(url.searchParams.get('limit'), 10, 1, 100);
    const searchQuery = (url.searchParams.get('search') || '').trim();
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const adminClient = createAdminClient();

    // 검색: saved_designs.title 만 훑으면 못 찾는 건이 많다.
    // (주문에서 디자인 이름을 바꿔도 order_items.design_title 만 바뀌고 saved_designs.title 은 그대로다)
    // → 제목 + 소유자 + 제품명 + 주문(주문번호/주문자/수령인/주문상 디자인명) 까지 DB 함수로 한 번에 검색한다.
    if (searchQuery) {
      const { data: searchResult, error: searchError } = await adminClient.rpc(
        'admin_search_saved_design_ids',
        { p_search: searchQuery, p_limit: limit, p_offset: from },
      );

      if (searchError) {
        return NextResponse.json({ error: searchError.message }, { status: 500 });
      }

      const total: number = Number(searchResult?.total ?? 0);
      const ids: string[] = Array.isArray(searchResult?.ids) ? searchResult.ids : [];

      if (ids.length === 0) {
        return NextResponse.json({
          data: [],
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        });
      }

      const { data, error } = await adminClient
        .from('saved_designs')
        .select(DESIGN_SELECT)
        .in('id', ids);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // RPC 가 돌려준 순서(최신순)를 유지한다
      const byId = new Map((data || []).map((row: { id: string }) => [row.id, row]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

      return NextResponse.json({
        data: ordered,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    }

    // Get total count
    const { count, error: countError } = await adminClient
      .from('saved_designs')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    // Get paginated data
    const { data, error } = await adminClient
      .from('saved_designs')
      .select(DESIGN_SELECT)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '디자인 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
