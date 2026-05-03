import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { trackCargo } from '@/lib/logen';

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

    const { slipNos, orderIds } = await request.json();

    let trackingSlipNos: string[] = slipNos || [];

    const adminClient = createAdminClient();

    if ((!trackingSlipNos || trackingSlipNos.length === 0) && orderIds && Array.isArray(orderIds)) {
      const { data: orders } = await adminClient
        .from('orders')
        .select('id, tracking_number')
        .in('id', orderIds)
        .not('tracking_number', 'is', null);

      trackingSlipNos = (orders || [])
        .map((o: any) => o.tracking_number)
        .filter(Boolean);
    }

    if (trackingSlipNos.length === 0) {
      return NextResponse.json({ error: '운송장번호가 필요합니다.' }, { status: 400 });
    }

    const result = await trackCargo(trackingSlipNos);

    if (result.sttsCd === 'FAIL') {
      return NextResponse.json({ error: result.sttsMsg, logenResponse: result }, { status: 500 });
    }

    const deliveredSlipNos: string[] = [];
    if (result.data && Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item.resultCd === 'TRUE' && item.data1 && Array.isArray(item.data1)) {
          const lastScan = item.data1[item.data1.length - 1];
          if (lastScan?.statNm?.includes('배송완료')) {
            deliveredSlipNos.push(item.slipNo);
          }
        }
      }
    }

    if (deliveredSlipNos.length > 0) {
      await adminClient
        .from('orders')
        .update({ order_status: 'delivered' })
        .in('tracking_number', deliveredSlipNos)
        .eq('order_status', 'shipping');
    }

    return NextResponse.json({
      data: {
        tracking: result.data,
        deliveredCount: deliveredSlipNos.length,
      },
    });
  } catch (err: any) {
    console.error('Logen tracking error:', err);
    return NextResponse.json({ error: err.message || '배송 추적 중 오류 발생' }, { status: 500 });
  }
}
