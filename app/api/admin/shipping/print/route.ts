import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { getSlipPrintPopUrl } from '@/lib/logen';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
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

    const url = new URL(request.url);
    const takeDt = url.searchParams.get('takeDt');

    if (!takeDt || !/^\d{8}$/.test(takeDt)) {
      return NextResponse.json({ error: '접수일자(takeDt)가 필요합니다. (YYYYMMDD 형식)' }, { status: 400 });
    }

    const popupUrl = getSlipPrintPopUrl(takeDt);
    return NextResponse.json({ data: { url: popupUrl } });
  } catch (err: any) {
    console.error('Logen print popup error:', err);
    return NextResponse.json({ error: err.message || '송장 출력 URL 생성 중 오류 발생' }, { status: 500 });
  }
}
