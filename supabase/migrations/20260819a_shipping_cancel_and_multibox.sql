-- 택배 접수 취소 + 다박스 송장 (2026-08-19)
--
-- 배경 1) 로젠에는 접수 취소/삭제 API가 없다(반품 취소 제외 — 2026-06-11 전체 메뉴 확인).
--   어드민에서 접수를 취소하면 로젠 측 행은 "미출력 = 무효" 상태로 남기고,
--   우리 DB의 접수 도장만 되돌린다. 재접수는 logen_reg_seq를 올려 "-R<seq>" 접미사가
--   붙은 새 접수번호로 등록해, 멱등 가드가 무효 행을 보고 접수를 건너뛰는 문제를 피한다.
-- 배경 2) 다박스(qty≥2) 접수는 로젠에 박스별 행이 생겨 송장이 여러 장 발번된다.
--   첫 송장은 tracking_number, 나머지는 extra_tracking_numbers에 보관한다.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS logen_reg_seq integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN orders.logen_reg_seq IS
  '로젠 접수 세대 번호. 1이면 fixTakeNo=주문ID, 2 이상이면 "<주문ID>-R<seq>"로 접수. 접수 취소 시 +1.';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS extra_tracking_numbers text[];

COMMENT ON COLUMN orders.extra_tracking_numbers IS
  '다박스 접수 시 두 번째 이후 박스의 송장번호 목록(첫 송장은 tracking_number).';

CREATE TABLE IF NOT EXISTS shipping_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  fix_take_no text NOT NULL,
  reason text NOT NULL,
  box_qty integer,
  had_tracking boolean NOT NULL DEFAULT false,
  tracking_number text,
  cancelled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE shipping_cancellations IS
  '어드민 택배 접수 취소 이력(사유 필수). 로젠 측 행은 삭제 불가라 미출력 무효로 남는다 — fix_take_no는 출력 금지 대상.';

CREATE INDEX IF NOT EXISTS idx_shipping_cancellations_order_id
  ON shipping_cancellations (order_id);

-- 서비스 롤(admin API)만 접근 — anon/authenticated 정책 없음
ALTER TABLE shipping_cancellations ENABLE ROW LEVEL SECURITY;
