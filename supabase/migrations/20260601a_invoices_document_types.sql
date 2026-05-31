-- 거래명세서(invoices)에 세금계산서·현금영수증을 통합 — 전부 가산적(additive). 기존 거래명세서 동작 불변.
-- 단일 모델: document_type 으로 문서 종류 구분, PDF·이메일·도장 파이프라인은 그대로 재사용.
-- 안전성:
--  * document_type DEFAULT 'transaction_statement' → 기존 모든 행=거래명세서로 분류(동작 동일).
--  * order_id nullable FK(ON DELETE SET NULL) → 기존 행 전부 NULL.
--  * status DEFAULT 'sent' → 기존 행은 sent_at 이 채워진 '발송됨' 상태와 일치.
--  * 나머지(세금계산서 공급받는자·현금영수증 발급수단·외부발행 연동) 전부 nullable.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'transaction_statement',
  ADD COLUMN IF NOT EXISTS order_id text REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent',
  -- 세금계산서 공급받는자(사업자) 정보: { biz_no, org, ceo, address, biz_type, biz_item }
  ADD COLUMN IF NOT EXISTS recipient_business jsonb,
  -- 현금영수증 발급수단
  ADD COLUMN IF NOT EXISTS cash_receipt_method text,        -- 'phone' | 'business' | 'card'
  ADD COLUMN IF NOT EXISTS cash_receipt_identifier text,    -- 휴대폰번호 / 사업자번호 / 카드번호
  ADD COLUMN IF NOT EXISTS issue_date timestamptz,
  -- 향후 홈택스/대행(팝빌·바로빌) 실발행 연동용 (Phase A)
  ADD COLUMN IF NOT EXISTS external_provider text,
  ADD COLUMN IF NOT EXISTS external_doc_id text,
  ADD COLUMN IF NOT EXISTS external_status text,
  ADD COLUMN IF NOT EXISTS external_issued_at timestamptz;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_document_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_document_type_check
  CHECK (document_type = ANY (ARRAY['transaction_statement'::text, 'tax_invoice'::text, 'cash_receipt'::text]));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'issued'::text, 'sent'::text, 'external_issued'::text, 'void'::text]));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_cash_receipt_method_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_cash_receipt_method_check
  CHECK (cash_receipt_method IS NULL OR cash_receipt_method = ANY (ARRAY['phone'::text, 'business'::text, 'card'::text]));

CREATE INDEX IF NOT EXISTS idx_invoices_order ON public.invoices(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_document_type ON public.invoices(document_type);
