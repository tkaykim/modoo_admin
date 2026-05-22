-- Allow factory users to UPDATE artworks of order_items assigned to their manufacturer.
-- Column-level restriction is enforced in the API layer (whitelist).
-- This RLS provides defense-in-depth at the row level.
DROP POLICY IF EXISTS "Factory updates own assigned artworks"
  ON public.order_item_artworks;
CREATE POLICY "Factory updates own assigned artworks"
  ON public.order_item_artworks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE oi.id = order_item_artworks.order_item_id
        AND p.role = 'factory'
        AND oi.assigned_manufacturer_id = p.manufacturer_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE oi.id = order_item_artworks.order_item_id
        AND p.role = 'factory'
        AND oi.assigned_manufacturer_id = p.manufacturer_id
    )
  );
