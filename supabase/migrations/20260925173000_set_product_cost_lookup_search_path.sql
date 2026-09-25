-- Keep the cost lookup independent from caller-controlled schemas.
ALTER FUNCTION public.get_product_unit_cost(uuid, uuid, text, timestamptz)
  SET search_path = '';

NOTIFY pgrst, 'reload schema';
