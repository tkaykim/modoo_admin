import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { inquirySlipNo } from '@/lib/logen';

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

    const { orderIds } = await request.json();
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const result = await inquirySlipNo(orderIds);

    if (result.sttsCd === 'FAIL') {
      return NextResponse.json({ error: result.sttsMsg, logenResponse: result }, { status: 500 });
    }

    const adminClient = createAdminClient();
    const updated: Array<{ orderId: string; slipNo: string }> = [];

    if (result.data && Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item.resultCd === 'TRUE' && item.data1 && Array.isArray(item.data1)) {
          const activeSlip = item.data1.find((s: any) => s.delYn !== 'Y');
          if (activeSlip?.slipNo) {
            await adminClient
              .from('orders')
              .update({
                tracking_number: activeSlip.slipNo,
                logen_slip_printed: true,
                order_status: 'shipping',
              })
              .eq('id', item.fixTakeNo);

            updated.push({ orderId: item.fixTakeNo, slipNo: activeSlip.slipNo });
          }
        }
      }
    }

    return NextResponse.json({
      data: {
        updated,
        total: orderIds.length,
        logenResponse: result,
      },
    });
  } catch (err: any) {
    console.error('Logen slip no inquiry error:', err);
    return NextResponse.json({ error: err.message || '송장번호 조회 중 오류 발생' }, { status: 500 });
  }
}
