-- Factory users CRUD their OWN manufacturer's pricing.
-- Admins/super_admins keep full access via the prior policy.

CREATE OR REPLACE FUNCTION public.app_is_factory_for_manufacturer(mfg_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'factory'
      AND p.manufacturer_id = mfg_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.app_is_factory_for_manufacturer(uuid)
  TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Factory users manage own pricing"
  ON public.factory_print_method_pricing;
CREATE POLICY "Factory users manage own pricing"
  ON public.factory_print_method_pricing
  FOR ALL
  USING (public.app_is_factory_for_manufacturer(factory_id))
  WITH CHECK (public.app_is_factory_for_manufacturer(factory_id));
