-- Follow-up to 20260521_factory_print_method_pricing.sql:
-- Drop fixed-size CHECK and add dimension columns so factory pricing can
-- be matched by artwork dimensions (cm), not just labels.

ALTER TABLE public.factory_print_method_pricing
  DROP CONSTRAINT IF EXISTS factory_print_method_pricing_size_check;

ALTER TABLE public.factory_print_method_pricing
  ADD COLUMN IF NOT EXISTS max_width_cm numeric,
  ADD COLUMN IF NOT EXISTS max_height_cm numeric;

CREATE INDEX IF NOT EXISTS idx_factory_print_method_pricing_dims
  ON public.factory_print_method_pricing(factory_id, print_method_id, max_width_cm, max_height_cm);
