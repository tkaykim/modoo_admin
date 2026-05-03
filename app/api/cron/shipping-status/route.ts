import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { trackCargoLast } from '@/lib/logen';

/** Vercel Hobby: 하루 1회. schedule 0 9 * * * = 매일 09:00 UTC = 한국 18:00 (KST) */
const CRON_SECRET = process.env.CRON_SECRET || '';
const BATCH_SIZE = 50;

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: shippingOrders, error } = await adminClient
      .from('orders')
      .select('id, tracking_number')
      .eq('order_status', 'shipping')
      .eq('tracking_carrier', 'logen')
      .not('tracking_number', 'is', null);

    if (error) {
      console.error('Cron: DB query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!shippingOrders || shippingOrders.length === 0) {
      return NextResponse.json({ data: { message: '배송 중인 주문이 없습니다.', checked: 0, delivered: 0 } });
    }

    const slipNos = shippingOrders
      .map((o) => o.tracking_number)
      .filter(Boolean) as string[];

    let totalDelivered = 0;

    for (let i = 0; i < slipNos.length; i += BATCH_SIZE) {
      const batch = slipNos.slice(i, i + BATCH_SIZE);

      try {
        const result = await trackCargoLast(batch);

        if (result.sttsCd === 'FAIL') continue;

        const deliveredSlipNos: string[] = [];
        if (result.data && Array.isArray(result.data)) {
          for (const item of result.data) {
            if (item.resultCd === 'TRUE' && item.statNm?.includes('배송완료')) {
              deliveredSlipNos.push(item.slipNo);
            }
          }
        }

        if (deliveredSlipNos.length > 0) {
          await adminClient
            .from('orders')
            .update({ order_status: 'delivered' })
            .in('tracking_number', deliveredSlipNos)
            .eq('order_status', 'shipping');

          totalDelivered += deliveredSlipNos.length;
        }
      } catch (batchErr) {
        console.error(`Cron: batch ${i} tracking error:`, batchErr);
      }
    }

    console.log(`Cron shipping-status: checked=${slipNos.length}, delivered=${totalDelivered}`);

    return NextResponse.json({
      data: {
        checked: slipNos.length,
        delivered: totalDelivered,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('Cron shipping-status error:', err);
    return NextResponse.json({ error: err.message || 'Cron 실행 오류' }, { status: 500 });
  }
}
