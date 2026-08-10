-- 주문자 / 받는 분 분리 (2026-08-10, ORDER-20260804-6BQZHA 금액 노출 건)
--
-- 배경: orders 에는 연락처 칸이 customer_phone 하나뿐이라, 같은 번호가
--   (A) 입금 안내·결제금액 알림톡이 가는 "금액 채널" 과
--   (B) 로젠 송장 수령인 연락처인 "배송 채널" 로 동시에 쓰였다.
-- 중간업자(리셀러)가 배송 목적으로 최종 고객 번호를 넣자, 결제완료 알림톡의
-- 결제금액이 최종 고객에게 그대로 노출돼 마진이 드러났다.
--
-- 설계 원칙: recipient_* 는 항상 실값으로 채운다(NULL fallback 금지).
--   "주문자와 동일" 이어도 값을 복사 저장한다. 소비처(로젠·발주서·배송목록·
--   알림)마다 "비면 customer 를 쓴다" 분기가 흩어지는 걸 막기 위함이다.
--   소비처는 무조건 recipient_* 만 읽는다.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS recipient_same_as_orderer boolean NOT NULL DEFAULT true;

-- 기존 주문 백필: 지금까지는 주문자 = 수령인 이었으므로 그대로 복사한다.
UPDATE orders
SET recipient_name = COALESCE(recipient_name, customer_name, guest_name),
    recipient_phone = COALESCE(recipient_phone, customer_phone, guest_phone)
WHERE recipient_name IS NULL OR recipient_phone IS NULL;

COMMENT ON COLUMN orders.recipient_name IS
  '받는 분 성함. 송장·배송 안내 전용. 주문자와 동일해도 값을 복사해 항상 채운다.';
COMMENT ON COLUMN orders.recipient_phone IS
  '받는 분 연락처. 송장·배송 안내 전용. 금액·계좌·결제 안내는 절대 이 번호로 보내지 않는다.';
COMMENT ON COLUMN orders.recipient_same_as_orderer IS
  '주문서에서 "주문자와 동일" 체크 여부. 화면 복원과 리셀러 주문 식별용.';
