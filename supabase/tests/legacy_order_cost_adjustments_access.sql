DO $$
DECLARE p record; actual bigint; expected bigint;
BEGIN
  IF has_table_privilege('anon','public.legacy_order_cost_adjustments','SELECT') THEN
    RAISE EXCEPTION 'Anonymous legacy adjustment grant present';
  END IF;
  FOR p IN SELECT DISTINCT ON(role) id,role FROM public.profiles WHERE role IN ('super_admin','admin','factory','marketing_manager','marketing_analyst','customer') LOOP
    PERFORM set_config('request.jwt.claim.sub',p.id::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO actual FROM public.legacy_order_cost_adjustments;
    SELECT CASE WHEN p.role='super_admin' THEN count(*) ELSE 0 END INTO expected FROM public.legacy_order_cost_adjustments;
    IF actual<>expected THEN RAISE EXCEPTION 'Incorrect legacy adjustment scope for role %',p.role; END IF;
    EXECUTE 'RESET ROLE';
  END LOOP;
END $$;
