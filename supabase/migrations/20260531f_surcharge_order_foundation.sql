-- 차액 추가결제(surcharge) 기반 스키마 — 전부 가산적(additive). 기존 주문/결제 로직 불변.
-- 개념: 이미 결제된 주문(parent)에서 수량/사양 증가로 차액이 발생하면,
--       기존 결제건을 건드리지 않고 "차액만큼의 작은 연결주문"을 새로 만들어 기존 결제레일
--       (payment_link_token → /order/custom/[token] → confirm)로 추가 수금한다.
-- 안전성:
--  * parent_order_id: nullable FK → 기존 주문 전부 NULL. 신규 코드 분기는 이 값이 있을 때만 진입.
--    ON DELETE SET NULL: 원주문 삭제돼도 차액주문은 고아로 남아 결제이력 보존(회계 안전).
--  * order_category 제약: 기존 값(cobuy/regular/salesman_direct/quick/NULL) 보존 + 'surcharge' 추가.
--    적용 시점 'surcharge' 행 없음 → 위반 행 없음.
--  * payment_key UNIQUE 인덱스(orders_payment_key_unique)는 절대 건드리지 않음 — 멱등성 유지.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS parent_order_id text REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_category_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_category_check
  CHECK (
    order_category IS NULL
    OR order_category = ANY (ARRAY['cobuy'::text, 'regular'::text, 'salesman_direct'::text, 'quick'::text, 'surcharge'::text])
  );

CREATE INDEX IF NOT EXISTS idx_orders_parent ON public.orders(parent_order_id)
  WHERE parent_order_id IS NOT NULL;
