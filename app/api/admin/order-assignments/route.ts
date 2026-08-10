import { NextResponse } from 'next/server';
import {
  fetchAllAssignments,
  isOrderAssignmentEnabled,
  requireAssignmentActor,
} from '@/lib/admin/orderAssignment';

/**
 * 현재 주문 담당자 전량 조회.
 *
 * 주문 목록이 페이지네이션 없이 전량을 받으므로 order_ids 파라미터를 두지 않는다.
 * 배정 행은 배정된 주문에만 존재해 응답이 주문 수보다 훨씬 작다.
 *
 * 공통 fetcher(lib/fetcher.ts)가 payload.data 만 반환하므로 반드시 data 로 감싼다.
 */
export async function GET() {
  try {
    const auth = await requireAssignmentActor();
    if (auth.error) return auth.error;

    if (!isOrderAssignmentEnabled()) {
      return NextResponse.json({ data: { enabled: false, can_claim: false, assignments: [] } });
    }

    const assignments = await fetchAllAssignments();

    return NextResponse.json({
      data: {
        enabled: true,
        // 배정 대상이 아닌 계정(대표·기존 관리자)에는 '내가 맡기'를 노출하지 않는다.
        can_claim: auth.actor.canReceiveOrders,
        can_assign_others: auth.actor.isSuper,
        viewer_id: auth.actor.id,
        assignments,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '담당자 정보를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
