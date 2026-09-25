-- Internal print price lists are not ordinary-admin data.
-- Keep each factory's existing access to its own submitted settlement prices.
ALTER POLICY "Admins can manage factory print pricing"
ON public.factory_print_method_pricing
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'super_admin'));

-- A factory must never read another factory's legacy settlement fields.
ALTER POLICY "Factories can view order items"
ON public.order_items
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'factory' AND p.manufacturer_id = order_items.assigned_manufacturer_id));
