-- Preserve settlement values exactly, but remove them from shared order records.
-- Legacy UPDATE writers are redirected atomically; shared SELECTs return NULL.
CREATE TABLE public.order_item_factory_settlements (
  order_item_id uuid PRIMARY KEY REFERENCES public.order_items(id) ON DELETE CASCADE,
  factory_amount numeric,
  factory_unit_price numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.order_factory_legacy_settlements (
  order_id text PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  factory_amount numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_item_factory_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_factory_legacy_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_item_factory_settlements, public.order_factory_legacy_settlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_item_factory_settlements, public.order_factory_legacy_settlements TO authenticated;
GRANT ALL ON public.order_item_factory_settlements, public.order_factory_legacy_settlements TO service_role;
CREATE POLICY settlement_super_read ON public.order_item_factory_settlements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'));
CREATE POLICY settlement_own_factory_read ON public.order_item_factory_settlements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.order_items i JOIN public.profiles p ON p.manufacturer_id=i.assigned_manufacturer_id
    WHERE i.id=order_item_id AND p.id=(SELECT auth.uid()) AND p.role='factory'));
CREATE POLICY legacy_settlement_super_read ON public.order_factory_legacy_settlements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'));

LOCK TABLE public.orders, public.order_items IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.order_item_factory_settlements(order_item_id, factory_amount, factory_unit_price)
  SELECT id, factory_amount, factory_unit_price FROM public.order_items
  WHERE factory_amount IS NOT NULL OR factory_unit_price IS NOT NULL;
INSERT INTO public.order_factory_legacy_settlements(order_id, factory_amount)
  SELECT id, factory_amount FROM public.orders WHERE factory_amount IS NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.order_items i LEFT JOIN public.order_item_factory_settlements s ON s.order_item_id=i.id
    WHERE (i.factory_amount IS NOT NULL OR i.factory_unit_price IS NOT NULL)
      AND (s.order_item_id IS NULL OR s.factory_amount IS DISTINCT FROM i.factory_amount OR s.factory_unit_price IS DISTINCT FROM i.factory_unit_price))
    OR EXISTS (SELECT 1 FROM public.orders o LEFT JOIN public.order_factory_legacy_settlements s ON s.order_id=o.id
      WHERE o.factory_amount IS NOT NULL AND (s.order_id IS NULL OR s.factory_amount IS DISTINCT FROM o.factory_amount))
  THEN RAISE EXCEPTION 'Settlement preservation check failed'; END IF;
END $$;
UPDATE public.order_items SET factory_amount=NULL, factory_unit_price=NULL WHERE factory_amount IS NOT NULL OR factory_unit_price IS NOT NULL;
UPDATE public.orders SET factory_amount=NULL WHERE factory_amount IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS internal_costs;
REVOKE ALL ON SCHEMA internal_costs FROM PUBLIC, anon, authenticated;
CREATE FUNCTION internal_costs.redirect_factory_settlement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller_role text := current_setting('role', true); field_name text := TG_ARGV[0]; allowed boolean;
BEGIN
  -- The actual invoking database role survives SECURITY DEFINER nesting.
  allowed := caller_role IN ('none','postgres','service_role','supabase_admin');
  IF NOT allowed THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND
      (p.role='super_admin' OR (TG_TABLE_NAME='order_items' AND p.role='factory'
        AND p.manufacturer_id=(to_jsonb(NEW)->>'assigned_manufacturer_id')::uuid
        AND NOT COALESCE((to_jsonb(OLD)->>'factory_price_locked')::boolean,false)))) INTO allowed;
  END IF;
  IF NOT COALESCE(allowed,false) THEN RAISE EXCEPTION 'Factory settlement access denied' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='order_items' THEN
    EXECUTE format('INSERT INTO public.order_item_factory_settlements(order_item_id,%I) VALUES($1,$2)
      ON CONFLICT(order_item_id) DO UPDATE SET %I=EXCLUDED.%I, updated_at=now()',field_name,field_name,field_name)
      USING NEW.id, (to_jsonb(NEW)->>field_name)::numeric;
  ELSE
    INSERT INTO public.order_factory_legacy_settlements(order_id,factory_amount) VALUES(NEW.id,NEW.factory_amount)
      ON CONFLICT(order_id) DO UPDATE SET factory_amount=EXCLUDED.factory_amount,updated_at=now();
  END IF;
  NEW := jsonb_populate_record(NEW,jsonb_build_object(field_name,NULL));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION internal_costs.redirect_factory_settlement() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER redirect_item_factory_amount BEFORE UPDATE OF factory_amount ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION internal_costs.redirect_factory_settlement('factory_amount');
CREATE TRIGGER redirect_item_factory_unit_price BEFORE UPDATE OF factory_unit_price ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION internal_costs.redirect_factory_settlement('factory_unit_price');
CREATE TRIGGER redirect_order_factory_amount BEFORE UPDATE OF factory_amount ON public.orders
  FOR EACH ROW EXECUTE FUNCTION internal_costs.redirect_factory_settlement('factory_amount');
-- Prevent INSERT/RPC writers from restoring an exposed copy.
ALTER TABLE public.order_items ADD CONSTRAINT shared_item_settlement_is_empty CHECK(factory_amount IS NULL AND factory_unit_price IS NULL);
ALTER TABLE public.orders ADD CONSTRAINT shared_order_settlement_is_empty CHECK(factory_amount IS NULL);

-- Financial calculations continue reading the exact preserved amounts.
ALTER POLICY order_shipping_legs_admin_select ON public.order_shipping_legs
  USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'));
CREATE OR REPLACE VIEW public.order_profit_summary WITH (security_invoker=true, security_barrier=true) AS
SELECT o.id AS order_id, o.created_at, o.order_status, o.total_amount AS gross_revenue,
 COALESCE(o.coupon_discount,0::numeric) AS coupon_discount,
 COALESCE(o.admin_discount,0::numeric) AS admin_discount,
 COALESCE(o.admin_surcharge,0::numeric) AS admin_surcharge,
 o.total_amount::numeric AS net_revenue,
 c.item_cost AS total_item_cost, c.adjustments AS total_cost_adjustments,
 c.print_cost AS total_print_cost, c.factory_cost AS total_factory_amount,
 COALESCE(o.delivery_fee,0::numeric) AS customer_delivery_fee,
 c.shipping_cost AS internal_shipping_cost,
 o.total_amount::numeric-c.item_cost-c.adjustments-c.print_cost-c.factory_cost-c.shipping_cost AS gross_profit
FROM public.orders o CROSS JOIN LATERAL (
 SELECT COALESCE((SELECT sum(x.total_cost) FROM public.order_item_costs x JOIN public.order_items i ON i.id=x.order_item_id WHERE i.order_id=o.id),0::numeric) AS item_cost,
 COALESCE((SELECT sum(x.amount) FROM public.order_item_cost_adjustments x JOIN public.order_items i ON i.id=x.order_item_id WHERE i.order_id=o.id),0::numeric) AS adjustments,
 COALESCE((SELECT sum(x.total_cost) FROM public.order_item_print_costs x JOIN public.order_items i ON i.id=x.order_item_id WHERE i.order_id=o.id),0::numeric) AS print_cost,
 COALESCE((SELECT sum(x.factory_amount) FROM public.order_item_factory_settlements x JOIN public.order_items i ON i.id=x.order_item_id WHERE i.order_id=o.id),0::numeric) AS factory_cost,
 COALESCE((SELECT sum(x.amount) FROM public.order_shipping_legs x WHERE x.order_id=o.id),0::numeric) AS shipping_cost
) c
WHERE current_user='service_role' OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin');
REVOKE ALL ON public.order_profit_summary FROM anon;
GRANT SELECT ON public.order_profit_summary TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
