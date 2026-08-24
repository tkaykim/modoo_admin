-- Idempotent franchise-expo partner mall imports and capability-token writes.

BEGIN;

ALTER TABLE public.partner_malls
  ADD COLUMN IF NOT EXISTS source_key text;

ALTER TABLE public.partner_mall_products
  ADD COLUMN IF NOT EXISTS import_key text;

ALTER TABLE public.partner_mall_assets
  ADD COLUMN IF NOT EXISTS import_key text;

CREATE UNIQUE INDEX IF NOT EXISTS partner_malls_source_key_unique
  ON public.partner_malls (source_key)
  WHERE source_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS partner_mall_products_import_key_unique
  ON public.partner_mall_products (import_key)
  WHERE import_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS partner_mall_assets_import_key_unique
  ON public.partner_mall_assets (import_key)
  WHERE import_key IS NOT NULL;

COMMENT ON COLUMN public.partner_malls.source_key IS
  'Stable external source identifier used by idempotent importers.';

COMMENT ON COLUMN public.partner_mall_products.import_key IS
  'Stable importer-owned identifier; null for manually created products.';

COMMENT ON COLUMN public.partner_mall_assets.import_key IS
  'Stable importer-owned identifier; null for manually uploaded assets.';

ALTER TABLE public.partner_mall_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_mall_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_assets_public_read" ON public.partner_mall_assets;
DROP POLICY IF EXISTS "pm_assets_guest_insert" ON public.partner_mall_assets;
DROP POLICY IF EXISTS "pm_assets_owner_modify" ON public.partner_mall_assets;
DROP POLICY IF EXISTS "pm_products_public_read" ON public.partner_mall_products;
DROP POLICY IF EXISTS "pm_products_guest_insert" ON public.partner_mall_products;
DROP POLICY IF EXISTS "pm_products_owner_modify" ON public.partner_mall_products;

CREATE POLICY "pm_assets_public_read"
  ON public.partner_mall_assets
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.partner_malls AS mall
      WHERE mall.id = partner_mall_id
        AND mall.is_active = true
    )
  );

CREATE POLICY "pm_products_public_read"
  ON public.partner_mall_products
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.partner_malls AS mall
      WHERE mall.id = partner_mall_id
        AND mall.is_active = true
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.partner_mall_assets, public.partner_mall_products
  FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
