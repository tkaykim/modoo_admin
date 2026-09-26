-- 인쇄비 원장과 공장 작업비 원본이 함께 있는 품목은 같은 인쇄 공임을 가리킨다.
-- 원본 정산액은 보존하고 손익에서는 인쇄비를 우선하여 한 번만 반영한다.
CREATE OR REPLACE VIEW public.order_profit_summary
WITH (security_invoker=true, security_barrier=true) AS
SELECT
  o.id AS order_id,
  o.created_at,
  o.order_status,
  o.total_amount AS gross_revenue,
  COALESCE(o.coupon_discount, 0::numeric) AS coupon_discount,
  COALESCE(o.admin_discount, 0::numeric) AS admin_discount,
  COALESCE(o.admin_surcharge, 0::numeric) AS admin_surcharge,
  o.total_amount::numeric AS net_revenue,
  c.item_cost AS total_item_cost,
  c.adjustments AS total_cost_adjustments,
  c.print_cost AS total_print_cost,
  c.factory_cost AS total_factory_amount,
  COALESCE(o.delivery_fee, 0::numeric) AS customer_delivery_fee,
  c.shipping_cost AS internal_shipping_cost,
  o.total_amount::numeric - c.item_cost - c.adjustments - c.print_cost - c.factory_cost - c.shipping_cost AS gross_profit,
  c.factory_overlap_excluded AS total_factory_overlap_excluded
FROM public.orders o
CROSS JOIN LATERAL (
  SELECT
    COALESCE((
      SELECT sum(x.total_cost)
      FROM public.order_item_costs x
      JOIN public.order_items i ON i.id=x.order_item_id
      WHERE i.order_id=o.id
    ), 0::numeric) AS item_cost,
    COALESCE((
      SELECT sum(x.amount)
      FROM public.order_item_cost_adjustments x
      JOIN public.order_items i ON i.id=x.order_item_id
      WHERE i.order_id=o.id
    ), 0::numeric) AS adjustments,
    COALESCE((
      SELECT sum(x.total_cost)
      FROM public.order_item_print_costs x
      JOIN public.order_items i ON i.id=x.order_item_id
      WHERE i.order_id=o.id
    ), 0::numeric) AS print_cost,
    COALESCE((
      SELECT sum(x.factory_amount)
      FROM public.order_item_factory_settlements x
      JOIN public.order_items i ON i.id=x.order_item_id
      WHERE i.order_id=o.id
        AND NOT EXISTS (
          SELECT 1 FROM public.order_item_print_costs p WHERE p.order_item_id=x.order_item_id
        )
    ), 0::numeric) AS factory_cost,
    COALESCE((
      SELECT sum(x.factory_amount)
      FROM public.order_item_factory_settlements x
      JOIN public.order_items i ON i.id=x.order_item_id
      WHERE i.order_id=o.id
        AND EXISTS (
          SELECT 1 FROM public.order_item_print_costs p WHERE p.order_item_id=x.order_item_id
        )
    ), 0::numeric) AS factory_overlap_excluded,
    COALESCE((
      SELECT sum(x.amount)
      FROM public.order_shipping_legs x
      WHERE x.order_id=o.id
    ), 0::numeric) AS shipping_cost
) c
WHERE current_user='service_role'
   OR EXISTS (
     SELECT 1 FROM public.profiles p
     WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'
   );

REVOKE ALL ON public.order_profit_summary FROM anon;
GRANT SELECT ON public.order_profit_summary TO authenticated, service_role;

COMMENT ON COLUMN public.order_profit_summary.total_factory_amount IS
  '인쇄비 원장이 없는 품목의 추가 공장 가공비만 합산한 손익 반영액';
COMMENT ON COLUMN public.order_profit_summary.total_factory_overlap_excluded IS
  '인쇄비 원장과 겹쳐 손익에서 제외한 공장 작업비 원본 합계';

-- 고객에게 돌려준 돈은 해당 작업의 비용으로 분류한다.
UPDATE public.legacy_order_cash_allocations
SET direction='cost',
    cost_class='customer_refund',
    reason=reason || ' · 고객 환불 지출로 재분류'
WHERE direction='refund';

-- 은행 메모로 이화여대 학잠 수선 환불임이 특정되는 누락 지출을 연결한다.
INSERT INTO public.legacy_order_cash_allocations(
  allocation_key, case_key, transaction_key, direction, amount_gross,
  cost_class, is_estimate, reason
)
SELECT
  encode(digest('EWHA-2025-COMMON:57976006c5712c9b3cde27a33785d4c2f80c84b0246c9cad72188ff74869eb30', 'sha256'), 'hex'),
  'EWHA-2025-COMMON',
  t.transaction_key,
  'cost',
  t.withdrawal,
  'customer_refund',
  false,
  '은행 적요 이대 학잠 수선 환불 일치'
FROM public.cost_bank_transactions t
WHERE t.transaction_key='57976006c5712c9b3cde27a33785d4c2f80c84b0246c9cad72188ff74869eb30'
  AND t.withdrawal=49000
ON CONFLICT (case_key, transaction_key) DO UPDATE
SET direction=EXCLUDED.direction,
    amount_gross=EXCLUDED.amount_gross,
    cost_class=EXCLUDED.cost_class,
    is_estimate=EXCLUDED.is_estimate,
    reason=EXCLUDED.reason;

NOTIFY pgrst, 'reload schema';
