-- 영수증(payment_receipt) 문서종류 추가 — 계좌이체/입금확인 건에 발행하는 자체 입금확인 영수증.
-- 가산적(additive): document_type CHECK 에 'payment_receipt' 만 추가, 기존 동작 불변.
-- PDF·이메일·도장 파이프라인은 그대로 재사용(거래명세서 모델과 동일).

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_document_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_document_type_check
  CHECK (document_type = ANY (ARRAY['transaction_statement'::text, 'tax_invoice'::text, 'cash_receipt'::text, 'payment_receipt'::text]));
