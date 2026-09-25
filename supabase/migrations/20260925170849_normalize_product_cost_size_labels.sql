-- Product option labels may include storefront annotations such as
-- "XS (85)" or "L [품절]". Normalize only the lookup input so an existing
-- cost row is reused instead of creating duplicate financial data.
CREATE OR REPLACE FUNCTION public.get_product_unit_cost(
  p_product_id uuid,
  p_color_id uuid,
  p_size text,
  p_at timestamptz
) RETURNS numeric
LANGUAGE sql
STABLE
AS $function$
  WITH input AS (
    SELECT upper(btrim(regexp_replace(
      COALESCE(p_size, ''),
      '\s*(\([^)]*\)|\[[^]]*\])\s*$',
      '',
      'g'
    ))) AS normalized_size
  )
  SELECT (pc.unit_cost + COALESCE(pc.size_surcharge, 0))
  FROM public.product_costs pc
  CROSS JOIN input
  WHERE pc.product_id = p_product_id
    AND (pc.manufacturer_color_id = p_color_id OR pc.manufacturer_color_id IS NULL)
    AND (
      upper(btrim(pc.size)) = upper(btrim(p_size))
      OR upper(btrim(pc.size)) = input.normalized_size
      OR pc.size IS NULL
    )
    AND pc.effective_from <= p_at
    AND (pc.effective_to IS NULL OR pc.effective_to > p_at)
  ORDER BY
    (pc.manufacturer_color_id IS NOT NULL)::int DESC,
    COALESCE((upper(btrim(pc.size)) = upper(btrim(p_size))), false)::int DESC,
    COALESCE((upper(btrim(pc.size)) = input.normalized_size), false)::int DESC,
    (pc.size IS NOT NULL)::int DESC,
    pc.effective_from DESC
  LIMIT 1;
$function$;

NOTIFY pgrst, 'reload schema';
