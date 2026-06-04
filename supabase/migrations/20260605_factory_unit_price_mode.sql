-- 공장 작업비 장당/총 입력 방식 기억용 컬럼
-- 장당 모드로 확정 시 factory_unit_price 저장(원/장), factory_price_mode='per_piece'.
-- 총액 모드면 factory_price_mode='total', factory_unit_price=총액/수량 역산값.
-- factory_amount(총액)는 기존 컬럼 그대로 사용한다.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS factory_unit_price numeric,
  ADD COLUMN IF NOT EXISTS factory_price_mode text;

COMMENT ON COLUMN public.order_items.factory_unit_price IS '공장 작업비 장당 단가(원/장). 장당 모드로 확정 시 저장, 총액 모드면 총액/수량 역산값.';
COMMENT ON COLUMN public.order_items.factory_price_mode IS '공장 작업비 입력 방식: per_piece(장당) | total(총). 표시·재편집 기본값 결정용.';
