-- Run after normalize_product_cost_size_labels in a transaction-safe test session.
DO $$
DECLARE
  product uuid;
  color uuid;
  plain numeric;
  annotated numeric;
BEGIN
  SELECT p.id, pc.manufacturer_color_id
  INTO product, color
  FROM public.products p
  JOIN public.product_colors pc ON pc.product_id = p.id AND pc.is_active
  WHERE p.product_code = '00148-HVT'
  LIMIT 1;

  IF product IS NULL THEN
    RAISE EXCEPTION 'Normalization fixture is missing';
  END IF;

  plain := public.get_product_unit_cost(product, color, 'XS', now());
  annotated := public.get_product_unit_cost(product, color, 'xs [품절]', now());
  IF plain IS NULL OR annotated IS DISTINCT FROM plain THEN
    RAISE EXCEPTION 'Annotated size did not reuse the existing cost';
  END IF;

  SELECT p.id, pc.manufacturer_color_id
  INTO product, color
  FROM public.products p
  JOIN public.product_colors pc ON pc.product_id = p.id AND pc.is_active
  WHERE p.product_code = '00085-CVT'
  LIMIT 1;
  plain := public.get_product_unit_cost(product, color, '110', now());
  annotated := public.get_product_unit_cost(product, color, '110 (아동용) 품절', now());
  IF plain IS NULL OR annotated IS DISTINCT FROM plain THEN
    RAISE EXCEPTION 'Plain stock suffix did not reuse the existing cost';
  END IF;
END $$;
