-- 은행의 개별 이체 행은 찾지 못했지만 카톡·합의 증빙으로 확인되는 고객 보상 비용을
-- 가짜 은행 거래 없이 과거 작업에 귀속한다.
CREATE TABLE public.legacy_order_cost_adjustments (
  adjustment_key text PRIMARY KEY,
  case_key text NOT NULL REFERENCES public.legacy_order_cases(case_key),
  amount_gross numeric NOT NULL CHECK (amount_gross > 0),
  cost_class text NOT NULL CHECK (cost_class IN ('customer_compensation','customer_refund','other')),
  is_estimate boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX legacy_order_cost_adjustments_case_idx
  ON public.legacy_order_cost_adjustments(case_key);

ALTER TABLE public.legacy_order_cost_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_order_cost_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.legacy_order_cost_adjustments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.legacy_order_cost_adjustments TO service_role;

CREATE POLICY legacy_order_cost_adjustments_superadmin
  ON public.legacy_order_cost_adjustments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'
    )
  );

INSERT INTO public.legacy_order_cost_adjustments(
  adjustment_key, case_key, amount_gross, cost_class, is_estimate, reason, evidence
)
VALUES (
  'myongji-2025-delay-customer-compensation',
  'MYONGJI-2025-VARSITY',
  700000,
  'customer_compensation',
  true,
  '납기 지연으로 전 인원에게 지급한 고객 보상금 약 70만원',
  jsonb_build_object(
    'source_type','kakao_chat',
    'message_id','f148ab83599f81d3d98886642164a0aea3406be7663a0433da24d7c1d0ff9a1f',
    'source_sha256','eb9aea6c106a4d116d6b236641ba303aa55a097fe24f0b634ba80c1c11f2cf2f',
    'line',733,
    'date','2025-06-17',
    'quote','명지대건 사실 지연보상금으로 전인원에게 총합 70만원정도 지출 발생했습니다 ㅠ',
    'supplier_recovery_separate',350000,
    'individual_bank_rows_unresolved',true
  )
)
ON CONFLICT (adjustment_key) DO UPDATE
SET amount_gross=EXCLUDED.amount_gross,
    cost_class=EXCLUDED.cost_class,
    is_estimate=EXCLUDED.is_estimate,
    reason=EXCLUDED.reason,
    evidence=EXCLUDED.evidence;

NOTIFY pgrst, 'reload schema';
