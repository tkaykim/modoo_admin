-- 간이주문(이미지 결제링크) 기반 스키마 — 전부 가산적(additive). 기존 주문/결제 동작 불변.
-- 스펙: dev/docs/modoo_quick_order_spec.md
-- 안전성:
--  * inquiry_id: nullable FK → 기존 주문 전부 NULL, 동작 영향 없음.
--  * production_ready: NOT NULL DEFAULT true → 기존 order_items 전부 true.
--    공장배정 가드는 production_ready=false 일 때만 발동하므로 기존 주문엔 미발동.
--  * order_category 제약: 기존 값(cobuy/regular/salesman_direct/NULL) 그대로 보존 + 'quick' 추가.
--    적용 시점 실제 값은 NULL/regular 뿐 → 위반 행 없음(검증 완료 2026-05-31).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inquiry_id uuid REFERENCES public.inquiries(id) ON DELETE SET NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS production_ready boolean NOT NULL DEFAULT true;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_category_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_category_check
  CHECK (
    order_category IS NULL
    OR order_category = ANY (ARRAY['cobuy'::text, 'regular'::text, 'salesman_direct'::text, 'quick'::text])
  );

CREATE INDEX IF NOT EXISTS idx_orders_inquiry ON public.orders(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_order_items_production_ready
  ON public.order_items(production_ready) WHERE production_ready = false;
