-- =====================================================================
-- 영업사원 등급/정산 정책 보강 (기존 스키마에 additive)
-- =====================================================================
-- 사전 상태(이미 존재):
--   - salesman_profiles (LV0..LV10 CHECK, status active/dormant/churned)
--   - salesman_grade_levels (LV0..LV10 시드 완료)
--   - salesman_monthly_settlements (status pending/calculated/paid)
--   - salesman_grade_changes (prev_level, new_level, reason, changed_at)
--   - 트리거: trg_log_salesman_grade_change (grade UPDATE 시 자동 INSERT)
-- 본 마이그레이션 추가/변경:
--   1) salesman_grade_policy 신설 (싱글톤 정책)
--   2) salesman_grade_levels: maintain_threshold, description 추가
--   3) salesman_profiles: grade_locked_*, last_grade_evaluated_at, consecutive_below_threshold
--   4) salesman_grade_changes: 평가 컨텍스트 컬럼(evaluation_window_months, evaluated_avg_revenue,
--      evaluated_periods, changed_by, note) 추가
--   5) orders(salesman_id, created_at) 인덱스
--   6) RLS: 신규 테이블 정책
-- 휴면/이탈 자동 전환은 하지 않음. 정책의 dormant/churned 임계는 admin UI 경고용.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) 정책 싱글톤
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS salesman_grade_policy (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  evaluation_window_months INT NOT NULL DEFAULT 3
    CHECK (evaluation_window_months BETWEEN 1 AND 12),
  manual_lock_months INT NOT NULL DEFAULT 3
    CHECK (manual_lock_months BETWEEN 0 AND 24),
  demotion_grace_periods INT NOT NULL DEFAULT 1
    CHECK (demotion_grace_periods BETWEEN 0 AND 6),
  demotion_max_steps INT NOT NULL DEFAULT 1
    CHECK (demotion_max_steps BETWEEN 0 AND 10),
  -- 휴면/이탈 자동 전환은 비활성. 임계는 UI 경고용으로만 사용.
  dormant_inactive_months INT NOT NULL DEFAULT 3
    CHECK (dormant_inactive_months BETWEEN 1 AND 24),
  churned_inactive_months INT NOT NULL DEFAULT 6
    CHECK (churned_inactive_months BETWEEN 1 AND 36),
  default_maintain_ratio NUMERIC(4,3) NOT NULL DEFAULT 0.700
    CHECK (default_maintain_ratio BETWEEN 0 AND 1),
  auto_reevaluation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

INSERT INTO salesman_grade_policy (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE salesman_grade_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All read grade policy" ON salesman_grade_policy;
CREATE POLICY "All read grade policy"
  ON salesman_grade_policy FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin manages grade policy" ON salesman_grade_policy;
CREATE POLICY "Admin manages grade policy"
  ON salesman_grade_policy FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------
-- 2) salesman_grade_levels 보강
-- ---------------------------------------------------------------------
ALTER TABLE salesman_grade_levels
  ADD COLUMN IF NOT EXISTS maintain_threshold BIGINT,
  ADD COLUMN IF NOT EXISTS description TEXT;

UPDATE salesman_grade_levels
   SET maintain_threshold = FLOOR(monthly_revenue_threshold * 0.7)
 WHERE maintain_threshold IS NULL;

COMMENT ON COLUMN salesman_grade_levels.maintain_threshold IS
  '해당 등급 유지를 위한 평가 윈도우 평균 매출 최소치. 미달 시 grace 카운트 증가.';

-- ---------------------------------------------------------------------
-- 3) salesman_profiles 운영 컬럼 보강
-- ---------------------------------------------------------------------
ALTER TABLE salesman_profiles
  ADD COLUMN IF NOT EXISTS grade_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grade_locked_by UUID,
  ADD COLUMN IF NOT EXISTS grade_locked_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_grade_evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_below_threshold INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN salesman_profiles.grade_locked_until IS
  '관리자 수동 등급 변경 시 자동 재평가 면제 만료 시각. NULL=비잠금.';
COMMENT ON COLUMN salesman_profiles.consecutive_below_threshold IS
  '현재 등급 maintain_threshold 미달 연속 횟수. grace 초과 시 강등.';

-- ---------------------------------------------------------------------
-- 4) salesman_grade_changes 평가 컨텍스트 컬럼 추가
--    (기존: salesman_id, prev_level, new_level, changed_at, reason, created_at)
-- ---------------------------------------------------------------------
ALTER TABLE salesman_grade_changes
  ADD COLUMN IF NOT EXISTS evaluation_window_months INT,
  ADD COLUMN IF NOT EXISTS evaluated_avg_revenue BIGINT,
  ADD COLUMN IF NOT EXISTS evaluated_periods TEXT[],
  ADD COLUMN IF NOT EXISTS changed_by UUID,
  ADD COLUMN IF NOT EXISTS note TEXT;

CREATE INDEX IF NOT EXISTS idx_grade_changes_salesman_changed
  ON salesman_grade_changes (salesman_id, changed_at DESC);

-- ---------------------------------------------------------------------
-- 5) orders 인덱스 (월별 매출 집계 성능)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_salesman_created_at
  ON orders (salesman_id, created_at DESC)
  WHERE salesman_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
