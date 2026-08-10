-- 주문 담당자 배정 RPC 보강 — release 소유권 검사를 잠금 안으로 이동 (TOCTOU 차단).
--
-- 배경
--   서버가 "현재 담당자가 본인인가"를 사전 SELECT 로 확인하면, 확인과 갱신 사이에
--   담당자가 바뀔 수 있다. 소유권 불변식을 RPC 안(FOR UPDATE 잠금 이후)으로 옮긴다.
--
-- 변경
--   p_require_current_assignee uuid 인자 추가.
--     admin 의 release → 세션 사용자 ID 를 넘긴다. 현재 담당자가 다르면 not_owner.
--     super_admin      → null 을 넘겨 검사를 건너뛴다.
--   응답에 assignee_name / previous_assignee_name 추가 (충돌 표시용 재조회 제거).
--
-- 되돌리기
--   DROP FUNCTION public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean, uuid);
--   그 후 20260810_order_staff_assignment.sql 의 함수 정의를 다시 적용한다.

DROP FUNCTION IF EXISTS public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean);

CREATE OR REPLACE FUNCTION public.set_order_staff_assignment(
  p_order_id                 text,
  p_actor                    uuid,
  p_next_assignee            uuid,
  p_expected_version         bigint  DEFAULT NULL,
  p_expect_unassigned        boolean DEFAULT false,
  p_require_current_assignee uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
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

  IF p_next_assignee IS NOT NULL THEN
    SELECT name INTO v_next_name
      FROM public.profiles
     WHERE id = p_next_assignee AND can_receive_orders = true;
    IF v_next_name IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'assignee_not_allowed');
    END IF;
  END IF;

  SELECT * INTO v_row
    FROM public.order_staff_assignments
   WHERE order_id = p_order_id
     FOR UPDATE;
  v_found := FOUND;

  IF v_found THEN
    v_prev   := v_row.assignee_profile_id;
    v_curver := v_row.version;
  END IF;

  -- 소유권 검사는 잠금 안에서 수행한다. admin 의 release 에 쓰인다.
  IF p_require_current_assignee IS NOT NULL
     AND v_prev IS DISTINCT FROM p_require_current_assignee THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'not_owner',
      'current_assignee', v_prev, 'version', v_curver);
  END IF;

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
    'current_assignee', p_next_assignee, 'version', v_newver,
    'assignee_name', v_next_name, 'previous_assignee_name', v_prev_name);
END;
$fn$;

COMMENT ON FUNCTION public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean, uuid) IS
  '주문 담당자 배정·해제를 이력과 함께 원자적으로 처리한다. p_require_current_assignee 로 잠금 내 소유권 검사. service_role 전용.';

REVOKE ALL ON FUNCTION public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_staff_assignment(text, uuid, uuid, bigint, boolean, uuid) TO service_role;
