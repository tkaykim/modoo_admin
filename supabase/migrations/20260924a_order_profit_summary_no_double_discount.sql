-- order_profit_summary: 할인·추가금 이중 반영 수정 (2026-09-24)
--
-- orders.total_amount 는 이미 쿠폰·관리자 할인·추가금이 반영된 최종 결제금액이다
-- (할인/추가금이 있는 주문 202건 중 198건이 items + 배송비 - 쿠폰 - 할인 + 추가금 = total_amount).
-- 기존 뷰는 total_amount 에서 다시 coupon_discount·admin_discount 를 빼고 admin_surcharge 를 더해
-- 할인은 두 번 빠지고 추가금은 두 번 더해졌다.
-- 실사례: ORDER-20260923-YUOLTR (전액 할인 0원 주문) net_revenue = -1,749,000 → 9/23 일매출 -673,500.
--
-- 수정: net_revenue = total_amount (기존 컬럼 타입 numeric 유지를 위해 캐스트). 할인·추가금 컬럼은 참고용으로 유지.
-- 컬럼 순서·이름·타입 동일, security_invoker 옵션·권한은 CREATE OR REPLACE 로 유지된다.

CREATE OR REPLACE VIEW public.order_profit_summary AS
SELECT
  o.id AS order_id,
  o.created_at,
  o.order_status,
  o.total_amount AS gross_revenue,
  COALESCE(o.coupon_discount, 0::numeric) AS coupon_discount,
  COALESCE(o.admin_discount, 0::numeric) AS admin_discount,
  COALESCE(o.admin_surcharge, 0::numeric) AS admin_surcharge,
  o.total_amount::numeric AS net_revenue,
  COALESCE((SELECT sum(oic.total_cost) FROM order_item_costs oic JOIN order_items oi ON oi.id = oic.order_item_id WHERE oi.order_id = o.id), 0::numeric) AS total_item_cost,
  COALESCE((SELECT sum(adj.amount) FROM order_item_cost_adjustments adj JOIN order_items oi ON oi.id = adj.order_item_id WHERE oi.order_id = o.id), 0::numeric) AS total_cost_adjustments,
  COALESCE((SELECT sum(oipc.total_cost) FROM order_item_print_costs oipc JOIN order_items oi ON oi.id = oipc.order_item_id WHERE oi.order_id = o.id), 0::numeric) AS total_print_cost,
  COALESCE((SELECT sum(oi.factory_amount) FROM order_items oi WHERE oi.order_id = o.id), 0::numeric) AS total_factory_amount,
  COALESCE(o.delivery_fee, 0::numeric) AS customer_delivery_fee,
  COALESCE((SELECT sum(osl.amount) FROM order_shipping_legs osl WHERE osl.order_id = o.id), 0::numeric) AS internal_shipping_cost,
  o.total_amount::numeric
    - COALESCE((SELECT sum(oic.total_cost) FROM order_item_costs oic JOIN order_items oi ON oi.id = oic.order_item_id WHERE oi.order_id = o.id), 0::numeric)
    - COALESCE((SELECT sum(adj.amount) FROM order_item_cost_adjustments adj JOIN order_items oi ON oi.id = adj.order_item_id WHERE oi.order_id = o.id), 0::numeric)
    - COALESCE((SELECT sum(oipc.total_cost) FROM order_item_print_costs oipc JOIN order_items oi ON oi.id = oipc.order_item_id WHERE oi.order_id = o.id), 0::numeric)
    - COALESCE((SELECT sum(oi.factory_amount) FROM order_items oi WHERE oi.order_id = o.id), 0::numeric)
    - COALESCE((SELECT sum(osl.amount) FROM order_shipping_legs osl WHERE osl.order_id = o.id), 0::numeric)
    AS gross_profit
FROM orders o;
