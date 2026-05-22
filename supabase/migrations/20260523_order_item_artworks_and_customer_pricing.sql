-- ============================================================================
-- 단계 1a: order_item_artworks + customer_print_method_pricing 추가
--   - 신규 테이블만 추가. 기존 테이블·정책·트리거 무변경.
--   - 신규 트리거는 order_item_artworks 행이 1개 이상일 때만 작동 (count=0 → noop)
--   - 기존 주문(아트워크 행 0개)은 factory_amount 100% 보존
--   - 롤백: DROP TRIGGER → DROP FUNCTION → DROP TABLE 두 줄로 완전 복원
-- ============================================================================

-- ===== 1) customer_print_method_pricing (글로벌 고객 노출가) =====
-- 공장 단가표(factory_print_method_pricing)와 동일 구조의 글로벌 단일 단가표.
-- factory_id가 없을 뿐, 나머지 사이즈 자유 + cm + flat/bulk 구조 동일.
CREATE TABLE IF NOT EXISTS public.customer_print_method_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  print_method_id uuid NOT NULL REFERENCES public.print_methods(id) ON DELETE CASCADE,
  size text NOT NULL,
  max_width_cm numeric,
  max_height_cm numeric,
  pricing_model text NOT NULL,
  unit_price numeric,
  base_price numeric,
  base_quantity integer,
  additional_price_per_piece numeric,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_print_method_pricing_model_check
    CHECK (pricing_model IN ('flat', 'bulk')),
  CONSTRAINT customer_print_method_pricing_flat_unit_price
    CHECK (pricing_model <> 'flat' OR unit_price IS NOT NULL),
  CONSTRAINT customer_print_method_pricing_bulk_fields
    CHECK (pricing_model <> 'bulk' OR (base_price IS NOT NULL AND base_quantity IS NOT NULL AND additional_price_per_piece IS NOT NULL)),
  CONSTRAINT customer_print_method_pricing_unique
    UNIQUE (print_method_id, size)
);

CREATE INDEX IF NOT EXISTS idx_customer_print_method_pricing_method
  ON public.customer_print_method_pricing(print_method_id);
CREATE INDEX IF NOT EXISTS idx_customer_print_method_pricing_dims
  ON public.customer_print_method_pricing(print_method_id, max_width_cm, max_height_cm);

ALTER TABLE public.customer_print_method_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage customer pricing" ON public.customer_print_method_pricing;
CREATE POLICY "Admins manage customer pricing"
  ON public.customer_print_method_pricing FOR ALL
  USING (public.app_is_admin_or_super_admin())
  WITH CHECK (public.app_is_admin_or_super_admin());

-- 누구나 활성 행 읽기 가능 (추후 modoo_app 에디터에서 사용)
DROP POLICY IF EXISTS "Anyone read active customer pricing" ON public.customer_print_method_pricing;
CREATE POLICY "Anyone read active customer pricing"
  ON public.customer_print_method_pricing FOR SELECT
  USING (is_active = true);

-- ===== 2) order_item_artworks (한 order_item당 N개 아트워크) =====
-- 모든 컬럼 NULL 허용. 기존 주문은 행 0개 상태로 영향 없음.
CREATE TABLE IF NOT EXISTS public.order_item_artworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  print_method_id uuid REFERENCES public.print_methods(id) ON DELETE SET NULL,
  placement text,
  size_label text,
  width_cm numeric,
  height_cm numeric,
  applied_quantity integer,
  customer_unit_price numeric,
  customer_total numeric,
  customer_pricing_snapshot jsonb,
  factory_pricing_row_id uuid REFERENCES public.factory_print_method_pricing(id) ON DELETE SET NULL,
  factory_unit_price numeric,
  factory_total numeric,
  factory_cost_source text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_item_artworks_cost_source_check
    CHECK (factory_cost_source IS NULL OR factory_cost_source IN ('auto_match','manual','negotiated','override'))
);

CREATE INDEX IF NOT EXISTS idx_order_item_artworks_order_item
  ON public.order_item_artworks(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_artworks_print_method
  ON public.order_item_artworks(print_method_id);

ALTER TABLE public.order_item_artworks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage order item artworks" ON public.order_item_artworks;
CREATE POLICY "Admins manage order item artworks"
  ON public.order_item_artworks FOR ALL
  USING (public.app_is_admin_or_super_admin())
  WITH CHECK (public.app_is_admin_or_super_admin());

-- 공장 회원은 본인 공장에 배정된 order_item의 아트워크만 read
DROP POLICY IF EXISTS "Factory reads own assigned artworks" ON public.order_item_artworks;
CREATE POLICY "Factory reads own assigned artworks"
  ON public.order_item_artworks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE oi.id = order_item_artworks.order_item_id
        AND p.role = 'factory'
        AND oi.assigned_manufacturer_id = p.manufacturer_id
    )
  );

-- ===== 3) 트리거: order_item_artworks → order_items.factory_amount 자동 동기화 =====
-- 안전 가드:
--   1. 행 0개면 절대 UPDATE 안 함 (기존 수기 factory_amount 100% 보존)
--   2. SECURITY DEFINER로 RLS 우회 (관리자 RW 정책 통과)
CREATE OR REPLACE FUNCTION public.sync_order_item_factory_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_order_item_id uuid;
  row_count int;
  sum_total numeric;
BEGIN
  target_order_item_id := COALESCE(NEW.order_item_id, OLD.order_item_id);

  SELECT COUNT(*), COALESCE(SUM(factory_total), 0)
    INTO row_count, sum_total
    FROM public.order_item_artworks
    WHERE order_item_id = target_order_item_id;

  -- 행 1개 이상일 때만 동기화. 0개면 기존 수기값 그대로.
  IF row_count > 0 THEN
    UPDATE public.order_items
      SET factory_amount = sum_total
      WHERE id = target_order_item_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_item_factory_amount ON public.order_item_artworks;
CREATE TRIGGER trg_sync_order_item_factory_amount
  AFTER INSERT OR UPDATE OR DELETE ON public.order_item_artworks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_item_factory_amount();
