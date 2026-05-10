-- AFTER INSERT trigger on order_items: lookup product_costs and auto-insert order_item_costs
-- Mirrors the manual lookup flow in components/orders/OrderProfitSection.tsx (uses first variant's size_id, color=NULL)
-- Match miss => skip silently (cost stays NULL in UI); recorded_by stays NULL for trigger-originated rows.

CREATE OR REPLACE FUNCTION public.auto_populate_order_item_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_size text;
  v_at timestamptz;
  v_unit_cost numeric;
BEGIN
  IF NEW.product_id IS NULL OR NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RETURN NEW;
  END IF;

  v_size := NULLIF(NEW.item_options #>> '{variants,0,size_id}', '');
  v_at := COALESCE(NEW.purchase_ordered_at, NEW.created_at, now());

  BEGIN
    SELECT public.get_product_unit_cost(NEW.product_id, NULL::uuid, v_size, v_at)
      INTO v_unit_cost;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_populate_order_item_cost lookup failed for order_item %: %', NEW.id, SQLERRM;
    RETURN NEW;
  END;

  IF v_unit_cost IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.order_item_costs (order_item_id, unit_cost, quantity, cost_source, recorded_by)
    VALUES (NEW.id, v_unit_cost, NEW.quantity, 'lookup', NULL)
    ON CONFLICT (order_item_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_populate_order_item_cost insert failed for order_item %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_populate_order_item_cost ON public.order_items;

CREATE TRIGGER trg_auto_populate_order_item_cost
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.auto_populate_order_item_cost();
