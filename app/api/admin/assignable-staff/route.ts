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

/**
 * 영업담당자(salesman) 목록.
 * 주문/단체에 영업사원 단일 id를 연결하기 위한 후보군.
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('salesman_profiles')
      .select('id, display_name, salesman_code, status')
      .eq('status', 'active')
      .order('display_name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ salesmen: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '영업담당자 목록을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
