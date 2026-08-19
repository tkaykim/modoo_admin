import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { trackCargoLast, inquirySlipNo, logenFixTakeNo, logenBaseOrderId } from '@/lib/logen';
import { automationPing } from '@/lib/automation-ping';

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

    // ── STEP 0: 송장번호 자동 동기화 ──
    // 로젠 접수는 됐는데(logen_registered_at) 송장번호가 아직 없는 주문 →
    // 출력(발번) 후 시점차로 비어 있을 수 있으므로 매일 자동 조회해 채운다.
    // (어드민 '송장번호 가져오기' 버튼을 사람이 안 눌러도 자동 반영)
    let syncedSlips = 0;
    try {
      const { data: pending } = await adminClient
        .from('orders')
        .select('id, logen_reg_seq')
        .eq('order_status', 'shipping')
        .eq('tracking_carrier', 'logen')
        .not('logen_registered_at', 'is', null)
        .is('tracking_number', null)
        .limit(200);

      // 접수 취소 후 재접수된 주문은 로젠에 -R<seq> 접미사 번호로 접수돼 있다
      const pendingIds = (pending || []).map((o: any) => logenFixTakeNo(o.id, o.logen_reg_seq));
      for (let i = 0; i < pendingIds.length; i += BATCH_SIZE) {
        const batch = pendingIds.slice(i, i + BATCH_SIZE);
        try {
          const inq = await inquirySlipNo(batch);
          if (inq.sttsCd === 'FAIL' || !Array.isArray(inq.data)) continue;
          for (const item of inq.data) {
            if (item.resultCd !== 'TRUE' || !Array.isArray(item.data1)) continue;
            // 다박스(qty≥2) 접수는 박스마다 송장이 발번된다 — 첫 번째는 tracking_number, 나머지는 extra에
            const actives = item.data1.filter((s: any) => s.delYn !== 'Y' && s.slipNo);
            const active = actives[0];
            if (active?.slipNo) {
              await adminClient
                .from('orders')
                .update({
                  tracking_number: active.slipNo,
                  logen_slip_printed: true,
                  extra_tracking_numbers: actives.length > 1 ? actives.slice(1).map((s: any) => s.slipNo) : null,
                })
                .eq('id', logenBaseOrderId(item.fixTakeNo))
                .is('tracking_number', null);
              syncedSlips++;
            }
          }
        } catch (e) {
          console.error(`Cron: slip sync batch ${i} error:`, e);
        }
      }
    } catch (e) {
      console.error('Cron: slip sync step error:', e);
    }

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
      await automationPing({ key: 'modoo:shipping-status', title: '배송 추적 → delivered 전환', triggerDesc: '매일 18:00 KST', source: 'modoo_admin /api/cron/shipping-status', detail: { checked: 0, delivered: 0, syncedSlips } });
      return NextResponse.json({ data: { message: '배송 중인 주문이 없습니다.', checked: 0, delivered: 0, syncedSlips } });
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

    console.log(`Cron shipping-status: syncedSlips=${syncedSlips}, checked=${slipNos.length}, delivered=${totalDelivered}`);

    await automationPing({ key: 'modoo:shipping-status', title: '배송 추적 → delivered 전환', triggerDesc: '매일 18:00 KST', source: 'modoo_admin /api/cron/shipping-status', detail: { checked: slipNos.length, delivered: totalDelivered, syncedSlips } });

    return NextResponse.json({
      data: {
        syncedSlips,
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
