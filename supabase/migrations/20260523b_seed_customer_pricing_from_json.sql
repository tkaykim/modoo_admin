-- ============================================================================
-- 단계 1b: 기존 print_methods.pricing JSON을 customer_print_method_pricing 행으로 자동 시드.
--   - 10x10 → (10, 10) cm
--   - A4    → (21, 29.7) cm  ← A4 종이 규격, 회전 매칭 헬퍼가 양 방향 수용
--   - A3    → (29.7, 42)  cm
--   - 수치값(jsonb number)은 flat 모델, 객체는 bulk 모델로 변환
--   - 충돌 발생 시 skip (재실행 안전)
-- 영향: customer_print_method_pricing에 행 추가만. 다른 테이블 무변동.
-- modoo_app은 여전히 print_methods.pricing JSON을 사용하므로 고객 노출가 영향 0.
-- ============================================================================

WITH expanded AS (
  SELECT pm.id AS print_method_id,
         k.size_label,
         k.max_w,
         k.max_h,
         pm.pricing -> k.size_label AS price_value
  FROM public.print_methods pm
  CROSS JOIN (VALUES
    ('10x10', 10::numeric, 10::numeric),
    ('A4', 21::numeric, 29.7::numeric),
    ('A3', 29.7::numeric, 42::numeric)
  ) AS k(size_label, max_w, max_h)
  WHERE pm.pricing IS NOT NULL
    AND pm.pricing ? k.size_label
)
INSERT INTO public.customer_print_method_pricing (
  print_method_id, size, max_width_cm, max_height_cm, pricing_model,
  unit_price, base_price, base_quantity, additional_price_per_piece, is_active
)
SELECT
  print_method_id,
  size_label,
  max_w,
  max_h,
  CASE WHEN jsonb_typeof(price_value) = 'object' THEN 'bulk' ELSE 'flat' END,
  CASE WHEN jsonb_typeof(price_value) = 'number' THEN (price_value)::text::numeric ELSE NULL END,
  CASE WHEN jsonb_typeof(price_value) = 'object' THEN (price_value->>'basePrice')::numeric ELSE NULL END,
  CASE WHEN jsonb_typeof(price_value) = 'object' THEN (price_value->>'baseQuantity')::integer ELSE NULL END,
  CASE WHEN jsonb_typeof(price_value) = 'object' THEN (price_value->>'additionalPricePerPiece')::numeric ELSE NULL END,
  true
FROM expanded
WHERE jsonb_typeof(price_value) IN ('number', 'object')
ON CONFLICT (print_method_id, size) DO NOTHING;
