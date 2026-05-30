-- 챗봇 상담 마지막 단계에서 시안/로고 파일을 첨부 → 문의에 보존.
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS file_urls text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.chatbot_inquiries
  ADD COLUMN IF NOT EXISTS file_urls text[] NOT NULL DEFAULT '{}'::text[];
