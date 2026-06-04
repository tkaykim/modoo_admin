-- 공장 단가 확정 게이트: order_items에 확정 추적 컬럼 추가
-- 작업중 전환 시 공장이 단가를 확인/확정한 시각·주체를 기록한다.
-- NULL이면 미확정(0원이어도 의도된 확정이 아님 → 손익에서 "미확정"으로 구분).

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS factory_price_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS factory_price_confirmed_by uuid;

COMMENT ON COLUMN public.order_items.factory_price_confirmed_at IS '공장이 작업중 전환 시 단가를 확정한 시각. NULL이면 미확정(0원이어도 의도 확정 안됨).';
COMMENT ON COLUMN public.order_items.factory_price_confirmed_by IS '단가 확정한 사용자(로그인 공장 profile.id). 링크 비로그인 확정 시 NULL.';
