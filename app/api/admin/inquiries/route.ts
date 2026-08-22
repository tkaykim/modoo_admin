import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const allowedStatuses = new Set(['pending', 'ongoing', 'completed']);

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

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// 문의는 654건까지 쌓였다. 전건을 한 번에 내려주면 답변·상품까지 중첩된 큰 페이로드를 매번
// 실어 나르고, 화면은 그 id 전부를 메일추적·주문조회 API 의 쿼리스트링에 이어 붙여
// URL 길이 한계를 넘겨 500 을 냈다. 목록은 페이지 단위로만 내려준다.
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    );
    // real=실제 고객 문의(is_admin=false) / admin=자동 생성 더미 / all=전체
    const filter = url.searchParams.get('filter') || 'real';
    // 챗봇 문의에서 '게시판 문의 보기'로 넘어온 경우, 그 문의가 현재 페이지 밖이어도 보여야 한다.
    const focusId = url.searchParams.get('focus');

    const adminClient = createAdminClient();
    const selectColumns = `
        id,
        user_id,
        title,
        content,
        status,
        is_admin,
        group_name,
        manager_name,
        phone,
        email,
        kakao_id,
        desired_date,
        expected_qty,
        fabric_color,
        file_urls,
        created_at,
        updated_at,
        inquiry_products (
          id,
          product_id,
          product:products (
            id,
            title
          )
        ),
        inquiry_replies (
          id,
          content,
          admin_id,
          file_urls,
          is_admin,
          created_at
        )
      `;

    let query = adminClient
      .from('inquiries')
      .select(selectColumns, { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('created_at', { ascending: true, foreignTable: 'inquiry_replies' });

    if (filter === 'real') query = query.eq('is_admin', false);
    else if (filter === 'admin') query = query.eq('is_admin', true);

    const from = (page - 1) * limit;
    const { data, error, count } = await query.range(from, from + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = data || [];

    // focus 대상이 이 페이지에 없으면 따로 붙여 준다(링크로 진입한 문의가 사라지지 않게).
    if (focusId && !items.some((row: { id: string }) => row.id === focusId)) {
      const { data: focused } = await adminClient
        .from('inquiries')
        .select(selectColumns)
        .eq('id', focusId)
        .maybeSingle();
      if (focused) items.unshift(focused as typeof items[number]);
    }

    return NextResponse.json({
      data: { items, total: count ?? items.length, page, limit },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '문의 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const inquiryId = payload?.inquiryId || payload?.id;
    const status = payload?.status;

    if (!inquiryId || typeof inquiryId !== 'string') {
      return NextResponse.json({ error: '문의 ID가 필요합니다.' }, { status: 400 });
    }

    if (!status || typeof status !== 'string' || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: '유효한 상태 값이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('inquiries')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inquiryId)
      .select(
        `
        id,
        status,
        updated_at
      `
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '문의 상태 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(request.url);
    const inquiryId = searchParams.get('id');

    if (!inquiryId) {
      return NextResponse.json({ error: '문의 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Delete related inquiry_products first
    await adminClient.from('inquiry_products').delete().eq('inquiry_id', inquiryId);

    // Delete related inquiry_replies
    await adminClient.from('inquiry_replies').delete().eq('inquiry_id', inquiryId);

    // Delete the inquiry
    const { error } = await adminClient.from('inquiries').delete().eq('id', inquiryId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '문의 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
