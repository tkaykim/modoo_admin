import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { logenFixTakeNo } from '@/lib/logen';

// 택배 접수 취소 (사유 필수)
//
// 로젠에는 접수 취소/삭제 API가 없다(반품 취소 제외 — 2026-06-11 전체 메뉴 확인).
// 따라서 "취소"는 우리 DB의 접수 상태를 되돌리는 것이고, 로젠 측 접수행은
// 미출력 상태로 남아 무효 처리된다(출력하지 않으면 배송·과금 없음).
// - 발번 전: 자유롭게 취소 가능. 단 로젠 송장 출력 화면에서 해당 접수번호를 출력하면 안 됨.
// - 발번 후(tracking_number 있음): 실물 집화가 진행될 수 있으므로 force 플래그 필수 —
//   집화 기사/지점에 연락해 실제 배송을 중단시켰다는 확인을 받은 뒤에만 취소.
// 재접수를 위해 logen_reg_seq를 +1 한다 (다음 접수는 "<주문ID>-R<seq>" 번호로 등록되어
// 멱등 가드가 무효 행을 보고 접수를 건너뛰는 문제를 피한다).
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
    if (!profile || !isAdminLike(profile.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const orderId: string = (body?.orderId || '').toString().trim();
    const reason: string = (body?.reason || '').toString().trim();
    const force: boolean = body?.force === true;

    if (!orderId) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }
    if (reason.length < 2) {
      return NextResponse.json({ error: '취소 사유를 입력해 주세요.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, order_status, logen_registered_at, logen_reg_seq, tracking_number, shipping_box_qty')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!order.logen_registered_at) {
      return NextResponse.json({ error: '택배 접수 상태가 아닙니다.' }, { status: 400 });
    }

    const hadTracking = !!order.tracking_number;
    if (hadTracking && !force) {
      return NextResponse.json({
        error: '이미 송장이 발번된 접수입니다. 집화 기사/지점에 연락해 실제 배송을 중단시킨 뒤, 확인 체크 후 다시 시도해 주세요.',
        requiresForce: true,
      }, { status: 409 });
    }

    const currentSeq = Number(order.logen_reg_seq) || 1;
    const fixTakeNo = logenFixTakeNo(order.id, currentSeq);

    // 1) 취소 이력 기록 (사유 필수)
    const { error: cancelInsertError } = await adminClient
      .from('shipping_cancellations')
      .insert({
        order_id: order.id,
        fix_take_no: fixTakeNo,
        reason,
        box_qty: order.shipping_box_qty || 1,
        had_tracking: hadTracking,
        tracking_number: order.tracking_number,
        cancelled_by: user.id,
      });
    if (cancelInsertError) {
      return NextResponse.json({ error: `취소 이력 기록 실패: ${cancelInsertError.message}` }, { status: 500 });
    }

    // 2) 접수 시 자동 기록된 택배비 원가 leg 제거 (실제 발송이 없으니 원가에서 뺀다)
    await adminClient
      .from('order_shipping_legs')
      .delete()
      .eq('order_id', order.id)
      .eq('leg_type', 'to_customer')
      .eq('carrier', 'logen')
      .like('note', '로젠 접수 시 자동 기록%');

    // 3) 주문의 접수 상태 롤백 + 재접수 세대 증가
    const patch: Record<string, unknown> = {
      logen_registered_at: null,
      logen_slip_printed: false,
      tracking_number: null,
      tracking_carrier: null,
      extra_tracking_numbers: null,
      logen_reg_seq: currentSeq + 1,
    };
    // 송장 발번으로 '배송중'이 된 주문은 제작 단계로 되돌린다 (배송완료/취소는 애초에 여기 안 옴)
    if (order.order_status === 'shipping') {
      patch.order_status = 'in_production';
    }
    const { error: updateError } = await adminClient
      .from('orders')
      .update(patch)
      .eq('id', order.id);
    if (updateError) {
      return NextResponse.json({ error: `주문 상태 되돌리기 실패: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        orderId: order.id,
        cancelledFixTakeNo: fixTakeNo,
        hadTracking,
        orderStatus: patch.order_status ?? order.order_status,
        nextRegSeq: currentSeq + 1,
        // 로젠 측 행은 삭제할 수 없어 미출력 무효로 남는다 — 출력 화면에서 이 번호는 출력 금지
        warning: hadTracking
          ? '송장이 이미 발번된 건입니다. 집화 기사/지점에 배송 중단을 반드시 확인하세요.'
          : `로젠 송장 출력 화면에서 접수번호 ${fixTakeNo} 건은 출력하지 마세요(출력하지 않으면 자동 무효).`,
      },
    });
  } catch (err: any) {
    console.error('Logen cancel error:', err);
    return NextResponse.json({ error: err.message || '접수 취소 중 오류 발생' }, { status: 500 });
  }
}
