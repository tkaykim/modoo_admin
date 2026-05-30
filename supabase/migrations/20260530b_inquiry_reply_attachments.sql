-- 문의 답변(inquiry_replies)에 이미지/파일 첨부 지원
ALTER TABLE public.inquiry_replies
  ADD COLUMN IF NOT EXISTS file_urls text[] NOT NULL DEFAULT '{}'::text[];
