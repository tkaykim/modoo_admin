-- Read-only role impersonation; no production row mutations.
BEGIN;
DO $$
DECLARE tab text; p record; expected bigint; actual bigint;
BEGIN
 FOREACH tab IN ARRAY ARRAY['cost_bank_source_documents','cost_bank_transactions','cost_erp_source_records','cost_evidence_links','cost_evidence_adjustments','legacy_order_cases','legacy_order_cash_allocations'] LOOP
  IF has_table_privilege('anon','public.'||tab,'SELECT') OR has_table_privilege('authenticated','public.'||tab,'INSERT') OR has_table_privilege('authenticated','public.'||tab,'UPDATE') OR has_table_privilege('authenticated','public.'||tab,'DELETE') THEN
   RAISE EXCEPTION 'Unsafe table grant: %',tab;
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',tab) INTO expected;
  FOR p IN SELECT DISTINCT ON (role,manufacturer_id) id,role FROM public.profiles ORDER BY role,manufacturer_id LOOP
   PERFORM set_config('request.jwt.claim.sub',p.id::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   EXECUTE format('SELECT count(*) FROM public.%I',tab) INTO actual;
   IF (p.role='super_admin' AND actual<>expected) OR (p.role<>'super_admin' AND actual<>0) THEN
    RAISE EXCEPTION 'RLS failure table %, role %',tab,p.role;
   END IF;
   EXECUTE 'RESET ROLE';
  END LOOP;
 END LOOP;
END $$;
ROLLBACK;
