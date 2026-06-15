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
    const updated: Array<{ orderId: string; slipNo: string; internal?: boolean }> = [];

    // 배송 leg 조회: 이 주문이 "고객행(우리/공장→고객)"인지 "내부행(우리↔공장)"인지 판별.
    // 내부 이동(자재 출고/완성품 회수)의 송장으로 고객 주문이 '배송중'으로 오전환되는 것을 막는다.
    // 규칙: to_customer leg가 있거나 leg가 아예 없으면(레거시) 고객 배송으로 간주(기존 동작 유지).
    //       to_factory/other leg만 있으면 내부 이동 → 주문 상태는 건드리지 않고 송장은 해당 leg에 기록.
    const { data: legs } = await adminClient
      .from('order_shipping_legs')
      .select('id, order_id, leg_type, tracking_number')
      .in('order_id', orderIds);
    const legsByOrder = new Map<string, any[]>();
    for (const l of legs || []) {
      if (!legsByOrder.has(l.order_id)) legsByOrder.set(l.order_id, []);
      legsByOrder.get(l.order_id)!.push(l);
    }
    const isInternalOnly = (orderId: string): boolean => {
      const ls = legsByOrder.get(orderId) || [];
      if (ls.length === 0) return false; // 레거시(케이스 미지정) → 고객 배송으로 간주
      return ls.every((l) => l.leg_type === 'to_factory' || l.leg_type === 'other');
    };

    if (result.data && Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item.resultCd === 'TRUE' && item.data1 && Array.isArray(item.data1)) {
          // 같은 주문번호에 무효 접수행(과거 계약값 불일치 건)이 섞여 있을 수 있으므로
          // 발번된(slipNo 있는) 행을 골라야 한다
          const activeSlip = item.data1.find((s: any) => s.delYn !== 'Y' && s.slipNo);
          if (activeSlip?.slipNo) {
            if (isInternalOnly(item.fixTakeNo)) {
              // 내부 이동: 주문 상태/고객 송장 필드는 건드리지 않고 leg 행에만 송장 기록
              const internalLeg = (legsByOrder.get(item.fixTakeNo) || [])
                .find((l) => l.leg_type === 'to_factory' || l.leg_type === 'other');
              if (internalLeg) {
                await adminClient
                  .from('order_shipping_legs')
                  .update({ tracking_number: activeSlip.slipNo, shipped_at: new Date().toISOString() })
                  .eq('id', internalLeg.id);
              }
              updated.push({ orderId: item.fixTakeNo, slipNo: activeSlip.slipNo, internal: true });
            } else {
              // 고객 배송: 기존 동작 — 주문을 '배송중'으로 전환하고 고객 송장 필드 채움
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
