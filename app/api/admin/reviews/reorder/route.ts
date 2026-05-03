import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (!isAdminLike(profile.role))) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { orderedIds } = body as { orderedIds: string[] };

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: '순서 데이터가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Update best_order for each review
    const updates = orderedIds.map((id, index) =>
      adminClient
        .from('reviews')
        .update({ best_order: index + 1 })
        .eq('id', id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);

    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '순서 변경에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
