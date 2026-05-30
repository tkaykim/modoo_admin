-- 답변 발신자 구분(관리자 vs 고객 답글). 기존 답변은 모두 관리자 → default true.
ALTER TABLE public.inquiry_replies
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT true;
