-- Run in a transaction after the migration; all test writes roll back.
DO $$
DECLARE
  p record;
  visible_documents bigint;
  visible_lines bigint;
  expected_documents bigint;
  expected_lines bigint;
BEGIN
  IF has_table_privilege('anon', 'public.print_cost_source_documents', 'SELECT')
     OR has_table_privilege('anon', 'public.print_cost_source_lines', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous print-cost evidence grant present';
  END IF;

  SELECT count(*) INTO expected_documents FROM public.print_cost_source_documents;
  SELECT count(*) INTO expected_lines FROM public.print_cost_source_lines;

  FOR p IN
    SELECT DISTINCT ON (role, manufacturer_id) id, role, manufacturer_id
    FROM public.profiles
    WHERE role IN ('super_admin', 'admin', 'factory', 'marketing_manager', 'marketing_analyst', 'customer')
  LOOP
    PERFORM set_config('request.jwt.claim.sub', p.id::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    SELECT count(*) INTO visible_documents FROM public.print_cost_source_documents;
    SELECT count(*) INTO visible_lines FROM public.print_cost_source_lines;

    IF p.role = 'super_admin' THEN
      IF visible_documents <> expected_documents OR visible_lines <> expected_lines THEN
        RAISE EXCEPTION 'Superadmin cannot read all print-cost evidence';
      END IF;
    ELSIF visible_documents <> 0 OR visible_lines <> 0 THEN
      RAISE EXCEPTION 'Print-cost evidence visible to role %', p.role;
    END IF;

    BEGIN
      INSERT INTO public.print_cost_source_documents (
        supplier_name,
        source_filename,
        source_sha256,
        total_supply_amount,
        total_vat_amount,
        total_gross_amount,
        line_count
      ) VALUES (
        'RLS test',
        'rls-test.pdf',
        repeat('0', 64),
        0,
        0,
        0,
        0
      );
      RAISE EXCEPTION 'Authenticated role % could write print-cost evidence', p.role;
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
    END;

    EXECUTE 'RESET ROLE';
  END LOOP;
END $$;
