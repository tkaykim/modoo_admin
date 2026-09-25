-- Protect the derived cost/profit view, not only its source tables.
CREATE OR REPLACE VIEW public.order_profit_summary WITH (security_invoker=true, security_barrier=true) AS
SELECT id AS order_id,
    created_at,
    order_status,
    total_amount AS gross_revenue,
    COALESCE(coupon_discount, (0)::numeric) AS coupon_discount,
    COALESCE(admin_discount, (0)::numeric) AS admin_discount,
    COALESCE(admin_surcharge, (0)::numeric) AS admin_surcharge,
    (total_amount)::numeric AS net_revenue,
    COALESCE(( SELECT sum(oic.total_cost) AS sum
           FROM (order_item_costs oic
             JOIN order_items oi ON ((oi.id = oic.order_item_id)))
          WHERE (oi.order_id = o.id)), (0)::numeric) AS total_item_cost,
    COALESCE(( SELECT sum(adj.amount) AS sum
           FROM (order_item_cost_adjustments adj
             JOIN order_items oi ON ((oi.id = adj.order_item_id)))
          WHERE (oi.order_id = o.id)), (0)::numeric) AS total_cost_adjustments,
    COALESCE(( SELECT sum(oipc.total_cost) AS sum
           FROM (order_item_print_costs oipc
             JOIN order_items oi ON ((oi.id = oipc.order_item_id)))
          WHERE (oi.order_id = o.id)), (0)::numeric) AS total_print_cost,
    COALESCE(( SELECT sum(oi.factory_amount) AS sum
           FROM order_items oi
          WHERE (oi.order_id = o.id)), (0)::numeric) AS total_factory_amount,
    COALESCE(delivery_fee, (0)::numeric) AS customer_delivery_fee,
    COALESCE(( SELECT sum(osl.amount) AS sum
           FROM order_shipping_legs osl
          WHERE (osl.order_id = o.id)), (0)::numeric) AS internal_shipping_cost,
    ((((((total_amount)::numeric - COALESCE(( SELECT sum(oic.total_cost) AS sum
           FROM (order_item_costs oic
             JOIN order_items oi ON ((oi.id = oic.order_item_id)))
          WHERE (oi.order_id = o.id)), (0)::numeric)) - COALESCE(( SELECT sum(adj.amount) AS sum
           FROM (order_item_cost_adjustments adj
             JOIN order_items oi ON ((oi.id = adj.order_item_id)))
          WHERE (oi.order_id = o.id)), (0)::numeric)) - COALESCE(( SELECT sum(oipc.total_cost) AS sum
           FROM (order_item_print_costs oipc
             JOIN order_items oi ON ((oi.id = oipc.order_item_id)))
          WHERE (oi.order_id = o.id)), (0)::numeric)) - COALESCE(( SELECT sum(oi.factory_amount) AS sum
           FROM order_items oi
          WHERE (oi.order_id = o.id)), (0)::numeric)) - COALESCE(( SELECT sum(osl.amount) AS sum
           FROM order_shipping_legs osl
          WHERE (osl.order_id = o.id)), (0)::numeric)) AS gross_profit
   FROM orders o
WHERE current_user = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(select auth.uid()) AND p.role='super_admin');
REVOKE ALL ON public.order_profit_summary FROM anon;
GRANT SELECT ON public.order_profit_summary TO authenticated, service_role;
