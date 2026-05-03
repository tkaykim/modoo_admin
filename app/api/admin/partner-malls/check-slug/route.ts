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

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    const excludeId = url.searchParams.get('exclude_id');

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json({ error: 'slug 파라미터가 필요합니다.' }, { status: 400 });
    }

    const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
    if (!slugRegex.test(slug)) {
      return NextResponse.json({
        available: false,
        reason: 'invalid_format',
        message: '슬러그는 영문 소문자, 숫자, 하이픈(-)만 사용할 수 있으며 하이픈으로 시작하거나 끝날 수 없습니다.',
      });
    }

    if (slug.length < 2 || slug.length > 50) {
      return NextResponse.json({
        available: false,
        reason: 'invalid_length',
        message: '슬러그는 2~50자여야 합니다.',
      });
    }

    const adminClient = createAdminClient();
    let query = adminClient
      .from('partner_malls')
      .select('id')
      .eq('slug', slug);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const available = !data || data.length === 0;

    return NextResponse.json({
      available,
      reason: available ? null : 'already_taken',
      message: available ? '사용 가능한 슬러그입니다.' : '이미 사용 중인 슬러그입니다.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '슬러그 확인에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
