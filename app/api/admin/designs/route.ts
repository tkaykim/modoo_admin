import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

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
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const searchQuery = url.searchParams.get('search') || '';
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const adminClient = createAdminClient();

    // Get total count
    let countQuery = adminClient
      .from('saved_designs')
      .select('*', { count: 'exact', head: true });

    if (searchQuery) {
      countQuery = countQuery.ilike('title', `%${searchQuery}%`);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    // Get paginated data
    let dataQuery = adminClient
      .from('saved_designs')
      .select(`
        *,
        user:profiles!saved_designs_user_id_fkey(id, email, name),
        product:products!saved_designs_product_id_fkey(id, title, thumbnail_image_link)
      `)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (searchQuery) {
      dataQuery = dataQuery.ilike('title', `%${searchQuery}%`);
    }

    const { data, error } = await dataQuery;

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
