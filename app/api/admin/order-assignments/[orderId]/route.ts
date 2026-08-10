import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  ASSIGNMENT_FAILURE_MESSAGE,
  assignmentFailureStatus,
  featureDisabledResponse,
  isOrderAssignmentEnabled,
  requireAssignmentActor,
} from '@/lib/admin/orderAssignment';

const ALLOWED_FIELDS = new Set(['action', 'assignee_profile_id', 'expected_version']);
const ACTIONS = new Set(['claim', 'release', 'assign']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RpcResult {
  ok?: boolean;
  reason?: string;
  action?: string;
  current_assignee?: string | null;
  assignee_name?: string | null;
  version?: number;
}

/**
 * 주문 담당자 상태 전이.
 *
 *   claim   — 본인에게 배정. 현재 미배정일 때만 성공(원자적).
 *   release — 해제. admin 은 본인 담당만, super_admin 은 제한 없음.
 *   assign  — 타인에게 배정·재배정. super_admin 전용.
 *
 * 실행자는 세션에서만 파생한다. 본문의 어떤 ID 도 실행자로 쓰지 않는다.
 * 소유권 검사는 RPC 안(FOR UPDATE 이후)에서 수행해 TOCTOU 를 피한다.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const auth = await requireAssignmentActor();
    if (auth.error) return auth.error;
    if (!isOrderAssignmentEnabled()) return featureDisabledResponse();

    const { orderId } = await params;
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
    }

    const unknown = Object.keys(body).filter((k) => !ALLOWED_FIELDS.has(k));
    if (unknown.length > 0) {
      return NextResponse.json({ error: `허용되지 않은 필드: ${unknown.join(', ')}` }, { status: 400 });
    }

    const action = body.action;
    if (typeof action !== 'string' || !ACTIONS.has(action)) {
      return NextResponse.json({ error: 'action 은 claim · release · assign 중 하나여야 합니다.' }, { status: 400 });
    }

    // expected_version 은 claim 을 제외한 모든 전이에서 필수다.
    let expectedVersion: number | null = null;
    if (action !== 'claim') {
      const raw = body.expected_version;
      if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) {
        return NextResponse.json({ error: 'expected_version 이 필요합니다.' }, { status: 400 });
      }
      expectedVersion = raw;
    } else if (body.expected_version !== undefined) {
      return NextResponse.json({ error: 'claim 에는 expected_version 을 보내지 않습니다.' }, { status: 400 });
    }

    let nextAssignee: string | null = null;
    let expectUnassigned = false;
    let requireCurrentAssignee: string | null = null;

    if (action === 'claim') {
      if (!auth.actor.canReceiveOrders) {
        return NextResponse.json({ error: '주문 배정 대상 계정이 아닙니다.' }, { status: 403 });
      }
      if (body.assignee_profile_id !== undefined) {
        return NextResponse.json({ error: 'claim 은 본인에게만 배정합니다.' }, { status: 400 });
      }
      nextAssignee = auth.actor.id;
      expectUnassigned = true;
    } else if (action === 'release') {
      if (body.assignee_profile_id !== undefined) {
        return NextResponse.json({ error: 'release 에는 assignee_profile_id 를 보내지 않습니다.' }, { status: 400 });
      }
      nextAssignee = null;
      // super_admin 만 타인 배정을 해제할 수 있다. 검사는 RPC 잠금 안에서 이뤄진다.
      requireCurrentAssignee = auth.actor.isSuper ? null : auth.actor.id;
    } else {
      if (!auth.actor.isSuper) {
        return NextResponse.json({ error: '타인 배정은 슈퍼 관리자만 할 수 있습니다.' }, { status: 403 });
      }
      const target = body.assignee_profile_id;
      if (typeof target !== 'string' || !UUID_RE.test(target)) {
        return NextResponse.json({ error: 'assignee_profile_id 가 필요합니다.' }, { status: 400 });
      }
      nextAssignee = target;
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc('set_order_staff_assignment', {
      p_order_id: orderId,
      p_actor: auth.actor.id,
      p_next_assignee: nextAssignee,
      p_expected_version: expectedVersion,
      p_expect_unassigned: expectUnassigned,
      p_require_current_assignee: requireCurrentAssignee,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = (data ?? {}) as RpcResult;
    if (result.ok !== true) {
      const reason = result.reason ?? 'unknown';
      return NextResponse.json(
        {
          error: ASSIGNMENT_FAILURE_MESSAGE[reason] ?? '배정을 변경하지 못했습니다.',
          reason,
          current_assignee: result.current_assignee ?? null,
          version: result.version ?? null,
        },
        { status: assignmentFailureStatus(reason) },
      );
    }

    return NextResponse.json({
      data: {
        order_id: orderId,
        action: result.action,
        assignee_profile_id: result.current_assignee ?? null,
        assignee_name: result.assignee_name ?? null,
        version: result.version ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '배정을 변경하지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
