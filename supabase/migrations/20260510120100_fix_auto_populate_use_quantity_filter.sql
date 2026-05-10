-- Fix: auto_populate_order_item_cost was using variants[0].size_id, but the customer-app
-- size modal saves ALL possible sizes (including quantity=0 placeholders), so variants[0]
-- is almost always "100" (the smallest size on the list), not the actually-ordered size.
-- Switch to picking the first variant where quantity > 0.

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

  SELECT NULLIF(v->>'size_id', '')
    INTO v_size
  FROM jsonb_array_elements(COALESCE(NEW.item_options->'variants', '[]'::jsonb)) WITH ORDINALITY AS t(v, ord)
  WHERE COALESCE((v->>'quantity')::int, 0) > 0
  ORDER BY ord
  LIMIT 1;

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
