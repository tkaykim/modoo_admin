-- Factory-specific print method pricing
-- Customer-facing price stays in print_methods.pricing (global).
-- This table holds the cost paid TO each factory per (method, size).
-- Margin = customer price - factory cost.

CREATE TABLE IF NOT EXISTS public.factory_print_method_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES public.manufacturers(id) ON DELETE CASCADE,
  print_method_id uuid NOT NULL REFERENCES public.print_methods(id) ON DELETE CASCADE,
  size text NOT NULL,
  pricing_model text NOT NULL,
  unit_price numeric,
  base_price numeric,
  base_quantity integer,
  additional_price_per_piece numeric,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factory_print_method_pricing_size_check
    CHECK (size IN ('10x10', 'A4', 'A3')),
  CONSTRAINT factory_print_method_pricing_model_check
    CHECK (pricing_model IN ('flat', 'bulk')),
  CONSTRAINT factory_print_method_pricing_flat_unit_price
    CHECK (pricing_model <> 'flat' OR unit_price IS NOT NULL),
  CONSTRAINT factory_print_method_pricing_bulk_fields
    CHECK (pricing_model <> 'bulk' OR (base_price IS NOT NULL AND base_quantity IS NOT NULL AND additional_price_per_piece IS NOT NULL)),
  CONSTRAINT factory_print_method_pricing_unique
    UNIQUE (factory_id, print_method_id, size)
);

CREATE INDEX IF NOT EXISTS idx_factory_print_method_pricing_factory
  ON public.factory_print_method_pricing(factory_id);
CREATE INDEX IF NOT EXISTS idx_factory_print_method_pricing_print_method
  ON public.factory_print_method_pricing(print_method_id);
CREATE INDEX IF NOT EXISTS idx_factory_print_method_pricing_lookup
  ON public.factory_print_method_pricing(factory_id, print_method_id, size);

ALTER TABLE public.factory_print_method_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage factory print pricing"
  ON public.factory_print_method_pricing;
CREATE POLICY "Admins can manage factory print pricing"
  ON public.factory_print_method_pricing
  FOR ALL
  USING (public.app_is_admin_or_super_admin())
  WITH CHECK (public.app_is_admin_or_super_admin());

-- Add DTP and 승화전사 print methods if missing
INSERT INTO public.print_methods (key, name, sort_order, is_active, pricing)
VALUES
  ('dtp', 'DTP', 8, true, NULL),
  ('sublimation', '승화전사', 9, true, NULL)
ON CONFLICT (key) DO NOTHING;
