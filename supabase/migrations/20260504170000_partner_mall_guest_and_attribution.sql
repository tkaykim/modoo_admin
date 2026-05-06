-- Partner mall: guest contributions + order attribution wiring.
-- Context: /mall/[slug] 재설계. 비로그인(anon) 게스트가 에셋/제품을 추가할 수 있도록 RLS를 열고,
-- 주문에 partner_mall_id + 게스트 정보 컬럼을 추가해 영업사원 실적 자동 귀속의 기반을 만든다.
-- orders.salesman_id 는 이미 존재하므로 추가하지 않는다.

BEGIN;

-- 1) orders: partner_mall 연결 + 게스트 정보 ----------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS partner_mall_id uuid REFERENCES public.partner_malls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS guest_name  text;

CREATE INDEX IF NOT EXISTS idx_orders_partner_mall ON public.orders(partner_mall_id);

-- 2) partner_mall_products / partner_mall_assets: 작성자 흔적 -----------------
ALTER TABLE public.partner_mall_products
  ADD COLUMN IF NOT EXISTS created_by_role text
    CHECK (created_by_role IN ('salesman','admin','guest','owner')) DEFAULT 'salesman',
  ADD COLUMN IF NOT EXISTS created_by_fingerprint text;

ALTER TABLE public.partner_mall_assets
  ADD COLUMN IF NOT EXISTS created_by_role text
    CHECK (created_by_role IN ('salesman','admin','guest','owner')) DEFAULT 'salesman',
  ADD COLUMN IF NOT EXISTS created_by_fingerprint text;

-- 3) RLS: anon(게스트) insert 허용. 단 활성 mall에 한해서만. ------------------
ALTER TABLE public.partner_mall_assets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_mall_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_assets_public_read"     ON public.partner_mall_assets;
DROP POLICY IF EXISTS "pm_assets_guest_insert"    ON public.partner_mall_assets;
DROP POLICY IF EXISTS "pm_assets_owner_modify"    ON public.partner_mall_assets;
DROP POLICY IF EXISTS "pm_products_public_read"   ON public.partner_mall_products;
DROP POLICY IF EXISTS "pm_products_guest_insert"  ON public.partner_mall_products;
DROP POLICY IF EXISTS "pm_products_owner_modify"  ON public.partner_mall_products;

CREATE POLICY "pm_assets_public_read"
  ON public.partner_mall_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_malls m
      WHERE m.id = partner_mall_id AND m.is_active = true
    )
  );

CREATE POLICY "pm_assets_guest_insert"
  ON public.partner_mall_assets
  FOR INSERT
  WITH CHECK (
    asset_type IN ('logo','image','reference')
    AND EXISTS (
      SELECT 1 FROM public.partner_malls m
      WHERE m.id = partner_mall_id AND m.is_active = true
    )
  );

CREATE POLICY "pm_assets_owner_modify"
  ON public.partner_mall_assets
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "pm_products_public_read"
  ON public.partner_mall_products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_malls m
      WHERE m.id = partner_mall_id AND m.is_active = true
    )
  );

CREATE POLICY "pm_products_guest_insert"
  ON public.partner_mall_products
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_malls m
      WHERE m.id = partner_mall_id AND m.is_active = true
    )
  );

CREATE POLICY "pm_products_owner_modify"
  ON public.partner_mall_products
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';

COMMIT;
