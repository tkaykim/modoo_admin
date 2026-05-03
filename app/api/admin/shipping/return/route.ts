import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { inquiryReturnState, inquiryReserveState, getReturnBranchFare } from '@/lib/logen';

export async function POST(request: Request) {
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

    const { action, slipNos, takeNos } = await request.json();

    switch (action) {
      case 'returnState': {
        if (!Array.isArray(slipNos) || slipNos.length === 0) {
          return NextResponse.json({ error: '원운송장번호가 필요합니다.' }, { status: 400 });
        }
        const result = await inquiryReturnState(slipNos);
        return NextResponse.json({ data: result });
      }

      case 'reserveState': {
        if (!Array.isArray(takeNos) || takeNos.length === 0) {
          return NextResponse.json({ error: '접수번호가 필요합니다.' }, { status: 400 });
        }
        const result = await inquiryReserveState(takeNos);
        return NextResponse.json({ data: result });
      }

      case 'branchFare': {
        if (!Array.isArray(slipNos) || slipNos.length === 0) {
          return NextResponse.json({ error: '원운송장번호가 필요합니다.' }, { status: 400 });
        }
        const result = await getReturnBranchFare(slipNos);
        return NextResponse.json({ data: result });
      }

      default:
        return NextResponse.json(
          { error: 'action은 returnState, reserveState, branchFare 중 하나여야 합니다.' },
          { status: 400 },
        );
    }
  } catch (err: any) {
    console.error('Logen return error:', err);
    return NextResponse.json({ error: err.message || '반품 조회 중 오류 발생' }, { status: 500 });
  }
}
