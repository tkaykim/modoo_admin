-- 공장별 정산 주기 설정 (지급 관리 효율화)
-- manufacturers에 정산 주기/지급일/메모 추가. 전부 nullable·기본값(비파괴). 고객 결제와 무관.

ALTER TABLE public.manufacturers
  ADD COLUMN IF NOT EXISTS payment_cycle text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS payment_day integer,
  ADD COLUMN IF NOT EXISTS payment_memo text;

COMMENT ON COLUMN public.manufacturers.payment_cycle IS '공장 정산 주기: monthly(월)|weekly(주)|per_order(건별)|manual(수동).';
COMMENT ON COLUMN public.manufacturers.payment_day IS '지급일. monthly=익월 지급일(1-31), weekly=요일(0일~6토).';
COMMENT ON COLUMN public.manufacturers.payment_memo IS '정산 관련 자유 메모(예: 말마감 익월10일).';
