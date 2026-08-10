import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { isAdminLike, isSuperAdmin, normalizeProfileRole, type ProfileRole } from '@/lib/auth-helpers';

/**
 * 주문 담당자 기능 전역 스위치.
 *
 * 명시적으로 'false' 일 때만 끈다(fail-open). 값을 안 넣으면 켜진 상태다.
 * Vercel 환경변수 관리 권한 없이도 기능이 동작해야 하므로 이 방향을 택했다.
 * 끄려면 ORDER_ASSIGNMENT_ENABLED=false 로 두고 재배포한다.
 */
export function isOrderAssignmentEnabled(): boolean {
  return (process.env.ORDER_ASSIGNMENT_ENABLED ?? '').trim().toLowerCase() !== 'false';
}

export const featureDisabledResponse = () =>
  NextResponse.json({ error: '주문 담당자 기능이 비활성화되어 있습니다.' }, { status: 503 });

export interface AssignmentActor {
  id: string;
  role: ProfileRole;
  name: string | null;
  canReceiveOrders: boolean;
  isSuper: boolean;
}

type ActorResult = { error: NextResponse; actor?: undefined } | { error?: undefined; actor: AssignmentActor };

/**
 * 담당자 API 공통 게이트.
 *
 * 세션에서만 실행자를 파생한다 — 요청 본문의 어떤 ID 도 실행자로 쓰지 않는다.
 * factory 역할은 여기서 403 으로 막는다. 주문 API 와 달리 백오피스 전체가 아니라
 * admin·super_admin 만 허용한다 (계획서 §26.4).
 */
export async function requireAssignmentActor(): Promise<ActorResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, name, can_receive_orders')
    .eq('id', user.id)
    .single();

  if (profileError) return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  if (!profile || !isAdminLike(profile.role)) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return {
    actor: {
      id: user.id,
      role: normalizeProfileRole(profile.role) as ProfileRole,
      name: profile.name ?? null,
      canReceiveOrders: profile.can_receive_orders === true,
      isSuper: isSuperAdmin(profile.role),
    },
  };
}

export interface AssignmentRow {
  order_id: string;
  assignee_profile_id: string | null;
  assignee_name: string | null;
  version: number;
  updated_at: string;
}

/** 전체 배정 행 조회. 담당자 이름은 profiles 에서 한 번에 채운다. */
export async function fetchAllAssignments(): Promise<AssignmentRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('order_staff_assignments')
    .select('order_id, assignee_profile_id, version, updated_at');
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.assignee_profile_id).filter(Boolean))] as string[];

  const nameById = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: people, error: peopleError } = await admin.from('profiles').select('id, name').in('id', ids);
    if (peopleError) throw new Error(peopleError.message);
    (people ?? []).forEach((p) => nameById.set(p.id, p.name ?? null));
  }

  return rows.map((r) => ({
    order_id: r.order_id,
    assignee_profile_id: r.assignee_profile_id,
    assignee_name: r.assignee_profile_id ? nameById.get(r.assignee_profile_id) ?? null : null,
    version: Number(r.version),
    updated_at: r.updated_at,
  }));
}

/** RPC 의 실패 사유를 HTTP 상태로 옮긴다. */
export function assignmentFailureStatus(reason: string | undefined): number {
  switch (reason) {
    case 'order_not_found':
      return 404;
    case 'assignee_not_allowed':
    case 'actor_required':
    case 'actor_not_found':
      return 400;
    case 'not_owner':
      return 403;
    case 'already_assigned':
    case 'version_conflict':
      return 409;
    default:
      return 400;
  }
}

export const ASSIGNMENT_FAILURE_MESSAGE: Record<string, string> = {
  order_not_found: '주문을 찾을 수 없습니다.',
  assignee_not_allowed: '주문 배정 대상이 아닌 계정입니다.',
  already_assigned: '다른 담당자가 먼저 가져갔습니다.',
  version_conflict: '다른 곳에서 먼저 변경했습니다. 새로고침 후 다시 시도하세요.',
  not_owner: '본인이 담당한 주문만 해제할 수 있습니다.',
  actor_required: '실행자 정보가 없습니다.',
  actor_not_found: '실행자 프로필을 찾을 수 없습니다.',
};
