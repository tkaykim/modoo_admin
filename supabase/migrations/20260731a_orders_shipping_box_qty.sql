-- 택배 접수 박스 수량 (2026-07-31, 버그리포트 '택배접수 수량조절 안건')
-- 로젠 registerOrderData의 qty = 박스 수. 지금까지 코드에 1로 하드코딩돼 있어
-- 실제 포장이 2박스 이상이어도 1박스로만 접수됐다.
-- 관리자가 접수 시 입력한 박스 수를 주문에 남겨 발주·정산·재접수 때 참조한다.
-- 상품 수량(order_items.quantity)과는 완전히 별개의 값이다.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_box_qty integer NOT NULL DEFAULT 1;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_shipping_box_qty_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_shipping_box_qty_check
  CHECK (shipping_box_qty >= 1 AND shipping_box_qty <= 99);

COMMENT ON COLUMN orders.shipping_box_qty IS
  '택배 접수 시 실제 발송 박스 수(기본 1). 상품 수량과 별개이며 로젠 qty·운임 산정에 사용.';
