CREATE TABLE public.print_cost_source_documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  manufacturer_id uuid REFERENCES public.manufacturers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  statement_date date,
  source_kind text NOT NULL DEFAULT 'naverworks_attachment'
    CHECK (source_kind IN ('naverworks_attachment', 'manual_upload', 'supplier_portal')),
  source_filename text NOT NULL,
  source_sha256 text NOT NULL UNIQUE
    CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_locator jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_supply_amount numeric(14, 2) NOT NULL,
  total_vat_amount numeric(14, 2) NOT NULL,
  total_gross_amount numeric(14, 2) NOT NULL,
  line_count integer NOT NULL CHECK (line_count >= 0),
  received_at timestamptz,
  extracted_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_gross_amount = total_supply_amount + total_vat_amount)
);

CREATE TABLE public.print_cost_source_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES public.print_cost_source_documents(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  page_number integer NOT NULL CHECK (page_number > 0),
  line_number integer NOT NULL CHECK (line_number > 0),
  item_name text NOT NULL,
  spec text,
  quantity numeric(12, 3) NOT NULL,
  unit_price_net numeric(14, 2) NOT NULL,
  supply_amount numeric(14, 2) NOT NULL,
  vat_amount numeric(14, 2) NOT NULL,
  gross_amount numeric(14, 2) NOT NULL,
  cost_class text NOT NULL
    CHECK (cost_class IN ('printing', 'shipping', 'packing', 'adjustment', 'other')),
  size_or_dimension_note text,
  match_status text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'candidate', 'matched', 'excluded')),
  match_confidence numeric(5, 4)
    CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),
  match_method text,
  match_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, line_number),
  CHECK (gross_amount = supply_amount + vat_amount)
);

CREATE INDEX print_cost_source_documents_manufacturer_id_idx
  ON public.print_cost_source_documents (manufacturer_id);
CREATE INDEX print_cost_source_documents_statement_date_idx
  ON public.print_cost_source_documents (statement_date);
CREATE INDEX print_cost_source_lines_document_id_idx
  ON public.print_cost_source_lines (document_id);
CREATE INDEX print_cost_source_lines_order_item_id_idx
  ON public.print_cost_source_lines (order_item_id)
  WHERE order_item_id IS NOT NULL;
CREATE INDEX print_cost_source_lines_match_status_idx
  ON public.print_cost_source_lines (match_status);

ALTER TABLE public.print_cost_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_cost_source_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.print_cost_source_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.print_cost_source_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.print_cost_source_documents_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.print_cost_source_lines_id_seq FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.print_cost_source_documents TO authenticated;
GRANT SELECT ON TABLE public.print_cost_source_lines TO authenticated;
GRANT ALL ON TABLE public.print_cost_source_documents TO service_role;
GRANT ALL ON TABLE public.print_cost_source_lines TO service_role;
GRANT ALL ON SEQUENCE public.print_cost_source_documents_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.print_cost_source_lines_id_seq TO service_role;

CREATE POLICY "Superadmins can read print cost source documents"
ON public.print_cost_source_documents
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'super_admin'
  )
);

CREATE POLICY "Superadmins can read print cost source lines"
ON public.print_cost_source_lines
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'super_admin'
  )
);

COMMENT ON TABLE public.print_cost_source_documents IS
  'Private supplier invoice evidence. Readable only by superadmins; writes use the service role.';
COMMENT ON TABLE public.print_cost_source_lines IS
  'Normalized private supplier invoice lines. Matching does not affect operating profit until explicitly reconciled.';
COMMENT ON COLUMN public.print_cost_source_lines.size_or_dimension_note IS
  'Raw size or print-dimension evidence retained because print pricing varies by garment size and print dimensions.';

NOTIFY pgrst, 'reload schema';
