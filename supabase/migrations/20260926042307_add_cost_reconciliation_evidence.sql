-- Evidence records are private and do not change historical order/payment/cost ledgers.
CREATE TABLE public.cost_bank_source_documents (
 source_sha256 text PRIMARY KEY CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
 source_filename text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL CHECK(period_end >= period_start),
 row_count integer NOT NULL CHECK(row_count >= 0),
 deposit_total numeric(16,2) NOT NULL,
 withdrawal_total numeric(16,2) NOT NULL,
 source_locator jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cost_bank_transactions (
 transaction_key text PRIMARY KEY CHECK(transaction_key ~ '^[0-9a-f]{64}$'),
 source_sha256 text NOT NULL REFERENCES public.cost_bank_source_documents(source_sha256),
 source_row integer NOT NULL CHECK(source_row > 0),
 transacted_at timestamptz NOT NULL,
 description text NOT NULL,
 counterparty_text text NOT NULL,
 memo text,
 deposit numeric(16,2) NOT NULL CHECK(deposit >= 0),
 withdrawal numeric(16,2) NOT NULL CHECK(withdrawal >= 0),
 balance numeric(16,2) NOT NULL,
 category_hint text NOT NULL,
 account_fingerprint text NOT NULL,
 account_last4 text NOT NULL CHECK(length(account_last4)=4),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_sha256,source_row),
 CHECK(deposit=0 OR withdrawal=0)
);
CREATE TABLE public.cost_erp_source_records (
 record_key text PRIMARY KEY,
 source_table text NOT NULL CHECK(source_table IN ('projects','financial_entries','project_tasks')),
 source_id bigint NOT NULL,
 bu_code text NOT NULL CHECK(bu_code='MODOO'),
 data jsonb NOT NULL,
 fetched_at timestamptz NOT NULL,
 UNIQUE(source_table,source_id)
);
ALTER TABLE public.cost_erp_source_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cost_erp_source_records FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cost_erp_source_records TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cost_erp_source_records TO service_role;
CREATE POLICY cost_erp_sources_superadmin ON public.cost_erp_source_records FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'));
CREATE TABLE public.cost_evidence_links (
 link_key text PRIMARY KEY CHECK(link_key ~ '^[0-9a-f]{64}$'),
 link_type text NOT NULL CHECK(link_type IN ('bank_order','invoice_payment','invoice_order','chat_order','erp_order','erp_bank')),
 source_erp_key text REFERENCES public.cost_erp_source_records(record_key),
 bank_transaction_key text REFERENCES public.cost_bank_transactions(transaction_key),
 source_document_id bigint REFERENCES public.print_cost_source_documents(id),
 source_line_id bigint REFERENCES public.print_cost_source_lines(id),
 order_id text REFERENCES public.orders(id),
 order_item_id uuid REFERENCES public.order_items(id),
 status text NOT NULL CHECK(status IN ('candidate','confirmed')),
 allocated_quantity numeric(12,3),
 amount_net numeric(16,2),
 amount_gross numeric(16,2),
 settlement_difference numeric(16,2),
 method text NOT NULL,
 evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(allocated_quantity IS NULL OR allocated_quantity >= 0),
 CHECK(link_type <> 'bank_order' OR (bank_transaction_key IS NOT NULL AND order_id IS NOT NULL)),
 CHECK(link_type <> 'invoice_payment' OR (bank_transaction_key IS NOT NULL AND source_document_id IS NOT NULL)),
 CHECK(link_type <> 'invoice_order' OR (source_line_id IS NOT NULL AND order_id IS NOT NULL)),
 CHECK(link_type <> 'chat_order' OR order_id IS NOT NULL),
 CHECK(link_type <> 'erp_order' OR (source_erp_key IS NOT NULL AND order_id IS NOT NULL)),
 CHECK(link_type <> 'erp_bank' OR (source_erp_key IS NOT NULL AND bank_transaction_key IS NOT NULL))
);
CREATE INDEX cost_bank_transactions_date_idx ON public.cost_bank_transactions(transacted_at);
CREATE INDEX cost_evidence_links_bank_idx ON public.cost_evidence_links(bank_transaction_key);
CREATE INDEX cost_evidence_links_document_idx ON public.cost_evidence_links(source_document_id);
CREATE INDEX cost_evidence_links_line_idx ON public.cost_evidence_links(source_line_id);
CREATE INDEX cost_evidence_links_order_idx ON public.cost_evidence_links(order_id);
CREATE INDEX cost_evidence_links_item_idx ON public.cost_evidence_links(order_item_id);
CREATE INDEX cost_evidence_links_erp_idx ON public.cost_evidence_links(source_erp_key);

ALTER TABLE public.cost_bank_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_evidence_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cost_bank_source_documents,public.cost_bank_transactions,public.cost_evidence_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cost_bank_source_documents,public.cost_bank_transactions,public.cost_evidence_links TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cost_bank_source_documents,public.cost_bank_transactions,public.cost_evidence_links TO service_role;
CREATE POLICY cost_bank_documents_superadmin ON public.cost_bank_source_documents FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'));
CREATE POLICY cost_bank_transactions_superadmin ON public.cost_bank_transactions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'));
CREATE POLICY cost_evidence_links_superadmin ON public.cost_evidence_links FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'));
COMMENT ON TABLE public.cost_evidence_links IS 'Evidence associations and invoice allocations; not additional costs. Never sum these on top of historical cost ledgers. Confirmed means association verified, not payment-status mutation or final margin readiness.';
COMMENT ON COLUMN public.cost_evidence_links.settlement_difference IS 'Bank withdrawal minus invoice gross. A supplier-period reconciliation difference, not an inferred per-order discount.';

CREATE TABLE public.cost_evidence_adjustments (
 adjustment_key text PRIMARY KEY,
 source_document_id bigint NOT NULL REFERENCES public.print_cost_source_documents(id),
 source_line_id bigint NOT NULL REFERENCES public.print_cost_source_lines(id),
 order_id text NOT NULL REFERENCES public.orders(id),
 bank_transaction_key text NOT NULL REFERENCES public.cost_bank_transactions(transaction_key),
 amount_net numeric(16,2) NOT NULL,
 amount_vat numeric(16,2) NOT NULL,
 amount_gross numeric(16,2) NOT NULL CHECK(amount_gross=amount_net+amount_vat),
 reason text NOT NULL,
 is_estimate boolean NOT NULL DEFAULT true,
 evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_document_id,bank_transaction_key)
);
CREATE TABLE public.legacy_order_cases (
 case_key text PRIMARY KEY,
 title text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL CHECK(period_end>=period_start),
 quantity integer CHECK(quantity>0),
 quantity_basis text,
 status text NOT NULL CHECK(status IN ('reconstructed','candidate')),
 existing_order_id text REFERENCES public.orders(id),
 evidence jsonb NOT NULL,
 notes text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.legacy_order_cash_allocations (
 allocation_key text PRIMARY KEY,
 case_key text NOT NULL REFERENCES public.legacy_order_cases(case_key),
 transaction_key text NOT NULL REFERENCES public.cost_bank_transactions(transaction_key),
 direction text NOT NULL CHECK(direction IN ('receipt','cost','refund')),
 amount_gross numeric(16,2) NOT NULL CHECK(amount_gross>0),
 cost_class text NOT NULL,
 is_estimate boolean NOT NULL,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(case_key,transaction_key)
);
CREATE INDEX cost_evidence_adjustments_order_idx ON public.cost_evidence_adjustments(order_id);
CREATE INDEX cost_evidence_adjustments_line_idx ON public.cost_evidence_adjustments(source_line_id);
CREATE INDEX cost_evidence_adjustments_bank_idx ON public.cost_evidence_adjustments(bank_transaction_key);
CREATE INDEX legacy_order_cases_order_idx ON public.legacy_order_cases(existing_order_id);
CREATE INDEX legacy_order_cash_transaction_idx ON public.legacy_order_cash_allocations(transaction_key);
ALTER TABLE public.cost_evidence_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_order_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_order_cash_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cost_evidence_adjustments,public.legacy_order_cases,public.legacy_order_cash_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cost_evidence_adjustments,public.legacy_order_cases,public.legacy_order_cash_allocations TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cost_evidence_adjustments,public.legacy_order_cases,public.legacy_order_cash_allocations TO service_role;
CREATE POLICY cost_evidence_adjustments_superadmin ON public.cost_evidence_adjustments FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'));
CREATE POLICY legacy_order_cases_superadmin ON public.legacy_order_cases FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'));
CREATE POLICY legacy_order_cash_superadmin ON public.legacy_order_cash_allocations FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='super_admin'));

CREATE FUNCTION public.validate_cost_reconciliation_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE source_order text; source_doc bigint; bank_amount numeric; allocated numeric;
BEGIN
 IF TG_TABLE_NAME='cost_evidence_links' THEN
  IF NEW.order_item_id IS NOT NULL THEN
   SELECT order_id INTO source_order FROM public.order_items WHERE id=NEW.order_item_id;
   IF source_order IS DISTINCT FROM NEW.order_id THEN RAISE EXCEPTION 'Order/item mismatch'; END IF;
  END IF;
  IF NEW.source_line_id IS NOT NULL THEN
   SELECT document_id INTO source_doc FROM public.print_cost_source_lines WHERE id=NEW.source_line_id;
   IF source_doc IS DISTINCT FROM NEW.source_document_id THEN RAISE EXCEPTION 'Document/line mismatch'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='cost_evidence_adjustments' THEN
  IF NOT EXISTS(SELECT 1 FROM public.cost_evidence_links WHERE source_line_id=NEW.source_line_id AND source_document_id=NEW.source_document_id AND order_id=NEW.order_id AND link_type='invoice_order' AND status='confirmed') THEN
   RAISE EXCEPTION 'Adjustment requires confirmed invoice/order evidence';
  END IF;
  IF NEW.amount_gross<>(SELECT b.withdrawal-d.total_gross_amount FROM public.cost_bank_transactions b CROSS JOIN public.print_cost_source_documents d WHERE b.transaction_key=NEW.bank_transaction_key AND d.id=NEW.source_document_id) THEN
   RAISE EXCEPTION 'Adjustment does not reconcile bank/invoice difference';
  END IF;
 ELSIF TG_TABLE_NAME='legacy_order_cash_allocations' THEN
  SELECT CASE WHEN NEW.direction='receipt' THEN deposit ELSE withdrawal END INTO bank_amount
  FROM public.cost_bank_transactions WHERE transaction_key=NEW.transaction_key FOR UPDATE;
  SELECT coalesce(sum(amount_gross),0) INTO allocated FROM public.legacy_order_cash_allocations
  WHERE transaction_key=NEW.transaction_key AND allocation_key<>NEW.allocation_key;
  IF bank_amount IS NULL OR allocated+NEW.amount_gross>bank_amount THEN RAISE EXCEPTION 'Cash allocation exceeds source amount or wrong direction'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_cost_reconciliation_evidence() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_cost_reconciliation_evidence() TO service_role;
CREATE TRIGGER validate_cost_evidence_links BEFORE INSERT OR UPDATE ON public.cost_evidence_links FOR EACH ROW EXECUTE FUNCTION public.validate_cost_reconciliation_evidence();
CREATE TRIGGER validate_cost_evidence_adjustments BEFORE INSERT OR UPDATE ON public.cost_evidence_adjustments FOR EACH ROW EXECUTE FUNCTION public.validate_cost_reconciliation_evidence();
CREATE TRIGGER validate_legacy_cash_allocations BEFORE INSERT OR UPDATE ON public.legacy_order_cash_allocations FOR EACH ROW EXECUTE FUNCTION public.validate_cost_reconciliation_evidence();
COMMENT ON TABLE public.legacy_order_cases IS 'Historical manual-order reconstruction, not live fulfillment orders. Unknown quantities stay NULL. Cash evidence is not recognized revenue or final profit. Never auto-create production orders from these rows.';
COMMENT ON TABLE public.cost_evidence_adjustments IS 'Order-specific adjustment of confirmed invoice evidence. Preserve original invoice and legacy cost rows. Estimated rationale must remain marked is_estimate=true; do not add adjusted invoice totals to legacy costs.';
NOTIFY pgrst,'reload schema';
