-- mall 경유 카트→주문 흐름의 attribution 근거.
-- /mall/[shareToken]에서 담은 카트 아이템에 어느 partner_mall에서 들어왔는지 기록 →
-- bank-transfer/Toss confirm에서 cart 첫 row의 partner_mall_id 추출 → orders.partner_mall_id +
-- partner_malls.salesman_id 조회해 orders.salesman_id 자동 채움 (쿠폰 경로 우선).

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS partner_mall_id uuid
    REFERENCES public.partner_malls(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cart_items_partner_mall
  ON public.cart_items(partner_mall_id)
  WHERE partner_mall_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
