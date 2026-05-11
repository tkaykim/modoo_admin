ALTER TABLE product_colors
  ADD COLUMN IF NOT EXISTS side_mockups jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN product_colors.side_mockups IS '{ [sideId]: imageUrl } — 색상별 면 단위 목업. 키가 없으면 products.configuration[*].imageUrl + BlendColor 필터 fallback';
