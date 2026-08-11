-- 주문 연락처 수정 이력 (2026-08-11, ORD-20260811-DUB7CB 연락 두절 건)
--
-- 배경: 고객이 전화번호를 한 자리 빠뜨려 입력하면(0104931766) 주문 후 연락이 닿지
--   않는데, 운영자가 이를 고칠 경로가 아예 없었다.
--   어드민 PATCH /api/admin/orders 는 결제상태·송장·가격조정만 받았고,
--   주문 상세의 "받는 분(편집 가능)" 입력칸은 로젠 송장 등록 폼 전용이라
--   거기서 고친 값은 orders 에 반영되지 않았다.
--   → 송장은 맞게 나가는데 DB·알림톡·CS는 계속 틀린 번호를 쓰는 상태가 유지됐다.
--
-- 이 테이블의 목적: orders 의 연락처·성함을 덮어쓸 때 원본을 남긴다.
--   전화번호는 개인정보이고 배송·정산 분쟁의 근거가 되므로
--   "누가 언제 무엇을 왜 바꿨나" 없이 덮어쓰면 안 된다.
--   원본이 남아 있어 되돌리기도 가능하다.

CREATE TABLE IF NOT EXISTS order_contact_changes (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_contact_changes_order_id_idx
  ON order_contact_changes (order_id, created_at DESC);

COMMENT ON TABLE order_contact_changes IS
  '주문 연락처·성함 수정 이력. 운영자가 오타를 정정할 때 원본을 보존한다.';
COMMENT ON COLUMN order_contact_changes.field IS
  'orders 의 컬럼명 — customer_phone / customer_name / recipient_phone / recipient_name.';
COMMENT ON COLUMN order_contact_changes.reason IS
  '수정 사유. 필수 — CS·분쟁 시 근거가 된다. 예: "고객 통화로 확인".';
COMMENT ON COLUMN order_contact_changes.changed_by_email IS
  '수정 시점의 운영자 이메일 스냅샷. 계정이 삭제돼도 누구인지 남기기 위함.';

-- 이력은 서버(service role)만 쓰고 읽는다. 클라이언트 직접 접근은 막는다.
ALTER TABLE order_contact_changes ENABLE ROW LEVEL SECURITY;
