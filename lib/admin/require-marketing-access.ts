import { NextResponse } from 'next/server';
import { canAccessMarketingArea, canExecuteMarketingActions } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';

export async function requireMarketingAccess() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileError) return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  if (!profile || !canAccessMarketingArea(profile.role)) {
    return { error: NextResponse.json({ error: '마케팅 또는 관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user, role: profile.role as string };
}

/** 쓰기(광고 상태·예산·소재 업로드·승인·목표 저장) 전용 가드. 열람 전용 marketing_analyst 는 403. */
export async function requireMarketingWriteAccess() {
  const auth = await requireMarketingAccess();
  if ('error' in auth && auth.error) return auth;
  if (!('role' in auth) || !canExecuteMarketingActions(auth.role)) {
    return { error: NextResponse.json({ error: '열람 전용 계정입니다. 실행 권한(마케팅관리자 이상)이 필요합니다.' }, { status: 403 }) };
  }
  return auth;
}
