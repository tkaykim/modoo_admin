-- 공장 단가 정산 확정(잠금) — 2단계 모델
-- 공장은 잠금 전까지 단가 자유 수정, 관리자가 '정산 확정'하면 잠금되어 공장 수정 불가(관리자만 해제/수정).
-- 전부 nullable·기본값 부여(비파괴). 고객 구매여정 무관.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS factory_price_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS factory_price_locked_by uuid,
  ADD COLUMN IF NOT EXISTS factory_price_locked_at timestamptz;

COMMENT ON COLUMN public.order_items.factory_price_locked IS '관리자 정산 확정(잠금) 여부. true면 공장이 단가 수정 불가, 관리자만 해제/수정.';
COMMENT ON COLUMN public.order_items.factory_price_locked_by IS '정산 확정한 관리자 user id.';
COMMENT ON COLUMN public.order_items.factory_price_locked_at IS '정산 확정 시각.';
