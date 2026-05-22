-- 추가금액 컬럼: 공장 단가표 기본가에 더해지는 가산금 (예: 단면 28cm 이상 등)
ALTER TABLE public.order_item_artworks
  ADD COLUMN IF NOT EXISTS additional_amount numeric;
