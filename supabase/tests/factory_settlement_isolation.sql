-- Run in a transaction after the migration; all test writes roll back.
DO $$
DECLARE p record; expected bigint; actual bigint; target uuid;
BEGIN
  IF has_table_privilege('anon','public.order_item_factory_settlements','SELECT') OR
     has_table_privilege('anon','public.order_factory_legacy_settlements','SELECT') THEN
    RAISE EXCEPTION 'Anonymous settlement grant present';
  END IF;
  IF EXISTS(SELECT 1 FROM public.order_items WHERE factory_amount IS NOT NULL OR factory_unit_price IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.orders WHERE factory_amount IS NOT NULL) THEN
    RAISE EXCEPTION 'Shared settlement copy still exposed';
  END IF;
  FOR p IN SELECT DISTINCT ON(role,manufacturer_id) id,role,manufacturer_id FROM public.profiles WHERE role IN ('super_admin','admin','factory','marketing_manager','marketing_analyst','customer') LOOP
    SELECT count(*) INTO expected FROM public.order_item_factory_settlements s JOIN public.order_items i ON i.id=s.order_item_id
      WHERE p.role='super_admin' OR (p.role='factory' AND i.assigned_manufacturer_id=p.manufacturer_id);
    PERFORM set_config('request.jwt.claim.sub',p.id::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO actual FROM public.order_item_factory_settlements;
    IF actual<>expected THEN RAISE EXCEPTION 'Incorrect settlement scope for role %',p.role; END IF;
    IF p.role NOT IN ('super_admin','factory') THEN
      IF EXISTS(SELECT 1 FROM public.product_costs) OR EXISTS(SELECT 1 FROM public.order_shipping_legs)
        OR EXISTS(SELECT 1 FROM public.order_item_costs) OR EXISTS(SELECT 1 FROM public.order_item_print_costs)
        OR EXISTS(SELECT 1 FROM public.order_profit_summary) THEN RAISE EXCEPTION 'Internal cost visible to role %',p.role; END IF;
    END IF;
    IF p.role='admin' THEN
      SELECT id INTO target FROM public.order_items LIMIT 1;
      BEGIN
        UPDATE public.order_items SET factory_amount=123 WHERE id=target;
        RAISE EXCEPTION 'Admin settlement write was allowed';
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
    END IF;
    EXECUTE 'RESET ROLE';
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','',true);
  SELECT order_item_id INTO target FROM public.order_item_factory_settlements LIMIT 1;
  IF target IS NOT NULL THEN
    BEGIN
      UPDATE public.order_items SET factory_amount=1234,factory_unit_price=56 WHERE id=target;
      IF NOT EXISTS(SELECT 1 FROM public.order_item_factory_settlements WHERE order_item_id=target AND factory_amount=1234 AND factory_unit_price=56) THEN RAISE EXCEPTION 'Legacy writer did not preserve both fields'; END IF;
      UPDATE public.order_items SET factory_amount=NULL WHERE id=target;
      IF NOT EXISTS(SELECT 1 FROM public.order_item_factory_settlements WHERE order_item_id=target AND factory_amount IS NULL AND factory_unit_price=56) THEN RAISE EXCEPTION 'Single-field clear changed sibling price'; END IF;
      RAISE EXCEPTION 'rollback_test_write' USING ERRCODE='P1234';
    EXCEPTION WHEN SQLSTATE 'P1234' THEN NULL;
    END;
  END IF;
END $$;
