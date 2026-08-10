-- 주문 처리 담당자 배정 (계획서 docs/PLAN_ORDER_STAFF_ACCOUNTS_AND_ASSIGNMENT.md §26 v3.1)
--
-- 원칙
--   * 추가형만 수행한다. 기존 컬럼의 의미와 값, 정책, 트리거를 바꾸지 않는다.
--   * 기존 주문에 대한 백필을 하지 않는다. 배정 행이 없으면 미배정으로 해석한다.
--   * orders.id 는 uuid 가 아니라 text 다.
--   * 신규 테이블은 RLS 를 켜고 정책을 만들지 않는다. 서버의 service_role 만 접근한다.
--
-- 되돌리기
--   DROP FUNCTION public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean);
--   DROP TABLE public.order_staff_assignment_events;
--   DROP TABLE public.order_staff_assignments;
--   ALTER TABLE public.profiles DROP COLUMN can_receive_orders;

-- ─────────────────────────────────────────────────────────────
-- 1. 배정 대상 직원 표시 (테이블 대신 컬럼 하나 — §26.3)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_receive_orders boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_receive_orders IS
  '주문 처리 담당자로 배정될 수 있는 계정인지. 기본 false. super_admin 의 배정 후보 목록 필터.';

-- ─────────────────────────────────────────────────────────────
-- 2. 주문별 현재 담당자 (주문당 1행)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_staff_assignments (
  order_id                text        PRIMARY KEY
                                      REFERENCES public.orders(id) ON DELETE CASCADE,
  assignee_profile_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_by_profile_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at             timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 bigint      NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.order_staff_assignments IS
  '주문 처리 담당자 현재 상태. 행이 없거나 assignee_profile_id 가 null 이면 미배정. service-role only.';

CREATE INDEX IF NOT EXISTS order_staff_assignments_assignee_idx
  ON public.order_staff_assignments (assignee_profile_id);
CREATE INDEX IF NOT EXISTS order_staff_assignments_updated_idx
  ON public.order_staff_assignments (updated_at DESC);

ALTER TABLE public.order_staff_assignments ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 3. 배정 변경 감사 이력
--    주문·계정이 삭제돼도 이력은 남아야 하므로 외래키를 두지 않고
--    ID 와 이름 스냅샷을 함께 보존한다 (§8.3, §26).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_staff_assignment_events (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                        text        NOT NULL,
  previous_assignee_profile_id    uuid,
  next_assignee_profile_id        uuid,
  actor_profile_id                uuid        NOT NULL,
  previous_assignee_name_snapshot text,
  next_assignee_name_snapshot     text,
  actor_name_snapshot             text        NOT NULL,
  action                          text        NOT NULL
    CHECK (action IN ('assign', 'reassign', 'unassign', 'claim')),
  created_at                      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_staff_assignment_events IS
  '주문 담당자 변경 감사 이력. 외래키 없음 — 주문·계정 삭제 후에도 보존한다. service-role only.';

CREATE INDEX IF NOT EXISTS order_staff_assignment_events_order_idx
  ON public.order_staff_assignment_events (order_id, created_at DESC);

ALTER TABLE public.order_staff_assignment_events ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 4. 원자적 배정 함수
--    배정 변경과 이력 기록을 한 트랜잭션에서 처리한다.
--    p_expect_unassigned = true  → claim. 현재 미배정일 때만 성공.
--    p_expect_unassigned = false → assign / reassign / unassign.
--                                  p_expected_version 이 주어지면 일치할 때만 성공.
--    실패는 예외가 아니라 ok=false 와 현재 상태를 담은 jsonb 로 돌려준다(서버가 409 로 변환).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_order_staff_assignment(
  p_order_id          text,
  p_actor             uuid,
  p_next_assignee     uuid,
  p_expected_version  bigint  DEFAULT NULL,
  p_expect_unassigned boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row        public.order_staff_assignments%ROWTYPE;
  v_found      boolean := false;
  v_prev       uuid;
  v_curver     bigint := 0;
  v_newver     bigint;
  v_action     text;
  v_actor_name text;
  v_prev_name  text;
  v_next_name  text;
BEGIN
  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'actor_required');
  END IF;

  SELECT name INTO v_actor_name FROM public.profiles WHERE id = p_actor;
  IF v_actor_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'actor_not_found');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found');
  END IF;

  -- 배정 대상은 배정 가능 직원이어야 한다 (해제는 예외).
  IF p_next_assignee IS NOT NULL THEN
    SELECT name INTO v_next_name
      FROM public.profiles
     WHERE id = p_next_assignee AND can_receive_orders = true;
    IF v_next_name IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'assignee_not_allowed');
    END IF;
  END IF;

  -- 현재 행 잠금. 행이 없으면 아래 INSERT 가 유일성으로 경합을 정리한다.
  SELECT * INTO v_row
    FROM public.order_staff_assignments
   WHERE order_id = p_order_id
     FOR UPDATE;
  v_found := FOUND;

  IF v_found THEN
    v_prev   := v_row.assignee_profile_id;
    v_curver := v_row.version;
  END IF;

  -- 전제조건 검사
  IF p_expect_unassigned AND v_prev IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'already_assigned',
      'current_assignee', v_prev, 'version', v_curver);
  END IF;

  IF NOT p_expect_unassigned
     AND p_expected_version IS NOT NULL
     AND p_expected_version <> v_curver THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'version_conflict',
      'current_assignee', v_prev, 'version', v_curver);
  END IF;

  -- 변화 없음
  IF v_prev IS NOT DISTINCT FROM p_next_assignee THEN
    RETURN jsonb_build_object(
      'ok', true, 'action', 'noop',
      'current_assignee', v_prev, 'version', v_curver);
  END IF;

  IF p_next_assignee IS NULL THEN
    v_action := 'unassign';
  ELSIF v_prev IS NULL THEN
    v_action := CASE WHEN p_next_assignee = p_actor THEN 'claim' ELSE 'assign' END;
  ELSE
    v_action := 'reassign';
  END IF;

  IF v_prev IS NOT NULL THEN
    SELECT name INTO v_prev_name FROM public.profiles WHERE id = v_prev;
  END IF;

  IF v_found THEN
    v_newver := v_curver + 1;
    UPDATE public.order_staff_assignments
       SET assignee_profile_id    = p_next_assignee,
           assigned_by_profile_id = p_actor,
           assigned_at            = CASE WHEN p_next_assignee IS NULL THEN NULL ELSE now() END,
           updated_at             = now(),
           version                = v_newver
     WHERE order_id = p_order_id;
  ELSE
    v_newver := 1;
    BEGIN
      INSERT INTO public.order_staff_assignments
        (order_id, assignee_profile_id, assigned_by_profile_id, assigned_at, updated_at, version)
      VALUES
        (p_order_id, p_next_assignee, p_actor,
         CASE WHEN p_next_assignee IS NULL THEN NULL ELSE now() END, now(), v_newver);
    EXCEPTION WHEN unique_violation THEN
      -- 같은 순간 다른 트랜잭션이 먼저 만들었다. 경합에서 진 것으로 처리한다.
      SELECT assignee_profile_id, version INTO v_prev, v_curver
        FROM public.order_staff_assignments WHERE order_id = p_order_id;
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'already_assigned',
        'current_assignee', v_prev, 'version', v_curver);
    END;
  END IF;

  INSERT INTO public.order_staff_assignment_events
    (order_id, previous_assignee_profile_id, next_assignee_profile_id, actor_profile_id,
     previous_assignee_name_snapshot, next_assignee_name_snapshot, actor_name_snapshot, action)
  VALUES
    (p_order_id, v_prev, p_next_assignee, p_actor,
     v_prev_name, v_next_name, v_actor_name, v_action);

  RETURN jsonb_build_object(
    'ok', true, 'action', v_action,
    'current_assignee', p_next_assignee, 'version', v_newver);
END;
$$;

COMMENT ON FUNCTION public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean) IS
  '주문 담당자 배정·해제를 이력과 함께 원자적으로 처리한다. 서버 API 의 service_role 전용.';

-- 실행 권한은 service_role 에만 준다 (§11.3).
REVOKE ALL ON FUNCTION public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean) TO service_role;
