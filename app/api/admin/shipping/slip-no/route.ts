import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { inquirySlipNo, logenFixTakeNo, logenBaseOrderId } from '@/lib/logen';

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

    const adminClient = createAdminClient();
    const updated: Array<{ orderId: string; slipNo: string; internal?: boolean }> = [];

    // 현재 주문 상태 조회 — 이미 배송완료/취소된 주문을 '배송중'으로 되돌리지 않기 위함
    const { data: orderRows } = await adminClient
      .from('orders')
      .select('id, order_status, logen_reg_seq')
      .in('id', orderIds);
    const statusByOrder = new Map<string, string>(
      (orderRows || []).map((o: any) => [o.id, o.order_status])
    );
    // 접수 취소 후 재접수된 주문은 로젠에 -R<seq> 접미사 번호로 접수돼 있다.
    const queryFixNos = orderIds.map((oid: string) => {
      const row = (orderRows || []).find((o: any) => o.id === oid);
      return logenFixTakeNo(oid, row?.logen_reg_seq);
    });

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

    // 내부 이동은 로젠에 접미사번호(-U2F/-F2U)로 접수돼 있으므로, 해당 leg가 있는 주문은
    // 접미사번호도 함께 조회해 leg에 송장을 채운다. (정확매칭이라 고객행 조회와 섞이지 않음)
    const SUFFIX_BY_LEG: Record<string, string> = { to_factory: '-U2F', other: '-F2U' };
    const suffixedIds: string[] = [];
    for (const [oid, ls] of legsByOrder) {
      for (const l of ls) {
        if ((l.leg_type === 'to_factory' || l.leg_type === 'other') && !l.tracking_number) {
          suffixedIds.push(`${oid}${SUFFIX_BY_LEG[l.leg_type]}`);
        }
      }
    }

    const result = await inquirySlipNo([...queryFixNos, ...suffixedIds]);
    if (result.sttsCd === 'FAIL') {
      return NextResponse.json({ error: result.sttsMsg, logenResponse: result }, { status: 500 });
    }

    if (result.data && Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item.resultCd === 'TRUE' && item.data1 && Array.isArray(item.data1)) {
          // 같은 주문번호에 무효 접수행(과거 계약값 불일치 건)이 섞여 있을 수 있으므로
          // 발번된(slipNo 있는) 행을 골라야 한다.
          // 다박스(qty≥2) 접수는 박스마다 행이 생겨 송장이 여러 개 발번된다 — 전부 수집한다.
          const activeSlips = item.data1.filter((s: any) => s.delYn !== 'Y' && s.slipNo);
          const activeSlip = activeSlips[0];
          if (activeSlip?.slipNo) {
            const sufMatch = String(item.fixTakeNo).match(/^(.*)-(U2F|F2U)$/);
            if (sufMatch) {
              // 접미사번호 = 내부 이동: 해당 leg에만 송장 기록 (주문은 건드리지 않음)
              const baseOrderId = sufMatch[1];
              const legType = sufMatch[2] === 'U2F' ? 'to_factory' : 'other';
              const internalLeg = (legsByOrder.get(baseOrderId) || []).find((l) => l.leg_type === legType);
              if (internalLeg) {
                await adminClient
                  .from('order_shipping_legs')
                  .update({ tracking_number: activeSlip.slipNo, shipped_at: new Date().toISOString() })
                  .eq('id', internalLeg.id);
              }
              updated.push({ orderId: baseOrderId, slipNo: activeSlip.slipNo, internal: true });
            } else {
              // 재접수 접미사(-R<seq>)를 제거해 주문 ID로 되돌린다
              const baseId = logenBaseOrderId(item.fixTakeNo);
              if (isInternalOnly(baseId)) {
                // 레거시 내부 이동(접미사 없이 bare id로 접수된 건): 주문 상태 건드리지 않고 leg에 기록
                const internalLeg = (legsByOrder.get(baseId) || [])
                  .find((l) => l.leg_type === 'to_factory' || l.leg_type === 'other');
                if (internalLeg) {
                  await adminClient
                    .from('order_shipping_legs')
                    .update({ tracking_number: activeSlip.slipNo, shipped_at: new Date().toISOString() })
                    .eq('id', internalLeg.id);
                }
                updated.push({ orderId: baseId, slipNo: activeSlip.slipNo, internal: true });
              } else {
                // 고객 배송: 송장 필드 채움 + '배송중' 전환.
                // 단, 이미 배송완료/취소된 주문은 상태를 되돌리지 않는다(송장 필드만 갱신).
                const currentStatus = statusByOrder.get(baseId);
                const patch: Record<string, unknown> = {
                  tracking_number: activeSlip.slipNo,
                  logen_slip_printed: true,
                  // 다박스 접수 시 두 번째 이후 박스의 송장번호 (1박스면 null)
                  extra_tracking_numbers: activeSlips.length > 1
                    ? activeSlips.slice(1).map((s: any) => s.slipNo)
                    : null,
                };
                if (currentStatus !== 'delivered' && currentStatus !== 'cancelled') {
                  patch.order_status = 'shipping';
                }
                await adminClient
                  .from('orders')
                  .update(patch)
                  .eq('id', baseId);

                updated.push({ orderId: baseId, slipNo: activeSlip.slipNo });
              }
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
