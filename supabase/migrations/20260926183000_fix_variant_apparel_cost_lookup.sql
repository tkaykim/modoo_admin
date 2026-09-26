-- New orders must price the variants actually purchased, not variants[0].
-- Preserve the separate current-price historical backfill and every existing ledger row.
CREATE OR REPLACE FUNCTION public.auto_populate_order_item_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_at timestamptz;
  v_variant jsonb;
  v_quantity integer;
  v_seen integer := 0;
  v_size text;
  v_color_id uuid;
  v_unit_cost numeric;
  v_total numeric := 0;
BEGIN
  IF NEW.product_id IS NULL OR NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RETURN NEW;
  END IF;
  v_at := COALESCE(NEW.purchase_ordered_at, NEW.created_at, now());
  BEGIN
    IF jsonb_typeof(NEW.item_options -> 'variants') = 'array' THEN
      FOR v_variant IN SELECT value FROM jsonb_array_elements(NEW.item_options -> 'variants') LOOP
        v_quantity := COALESCE(NULLIF(v_variant ->> 'quantity', '')::integer, 0);
        IF v_quantity <= 0 THEN CONTINUE; END IF;
        v_seen := v_seen + v_quantity;
        v_size := COALESCE(NULLIF(v_variant ->> 'size_name', ''), NULLIF(v_variant ->> 'size_id', ''));
        v_color_id := NULL;
        SELECT mc.id INTO v_color_id
        FROM public.product_colors pcl
        JOIN public.manufacturer_colors mc ON mc.id = pcl.manufacturer_color_id
        WHERE pcl.product_id = NEW.product_id
          AND pcl.is_active IS DISTINCT FROM false
          AND (
            (NULLIF(v_variant ->> 'color_code', '') IS NOT NULL AND lower(mc.color_code) = lower(v_variant ->> 'color_code')) OR
            (NULLIF(v_variant ->> 'color_name', '') IS NOT NULL AND lower(mc.name) = lower(v_variant ->> 'color_name')) OR
            (NULLIF(v_variant ->> 'color_hex', '') IS NOT NULL AND lower(mc.hex) = lower(v_variant ->> 'color_hex'))
          )
        ORDER BY CASE
          WHEN lower(mc.color_code) = lower(v_variant ->> 'color_code') THEN 0
          WHEN lower(mc.name) = lower(v_variant ->> 'color_name') THEN 1
          ELSE 2 END
        LIMIT 1;
        SELECT public.get_product_unit_cost(NEW.product_id, v_color_id, v_size, v_at) INTO v_unit_cost;
        IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN RETURN NEW; END IF;
        v_total := v_total + v_quantity * v_unit_cost;
      END LOOP;
    END IF;
    IF v_seen > 0 AND v_seen <> NEW.quantity THEN RETURN NEW; END IF;
    IF v_seen = 0 THEN
      SELECT public.get_product_unit_cost(NEW.product_id, NULL::uuid, NULL::text, v_at) INTO v_unit_cost;
      IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN RETURN NEW; END IF;
      v_total := NEW.quantity * v_unit_cost;
    END IF;
    INSERT INTO public.order_item_costs (order_item_id, unit_cost, quantity, cost_source, recorded_by)
    VALUES (NEW.id, v_total / NEW.quantity, NEW.quantity, 'lookup', NULL)
    ON CONFLICT (order_item_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_populate_order_item_cost failed for item %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
