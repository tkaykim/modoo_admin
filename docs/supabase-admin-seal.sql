-- 거래명세서 도장(인감)용 비공개 스토리지 버킷 및 admin_documents doc_type 확장
-- Supabase Dashboard → SQL Editor 에서 프로젝트에 맞게 실행하세요.

-- 1) 비공개 버킷 (이미 있으면 public 만 false 로 갱신)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-seal',
  'admin-seal',
  false,
  2097152,
  ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) 도장은 공개 URL 이 없으므로 file_url 을 NULL 허용 권장 (앱은 빈 문자열도 지원)
ALTER TABLE public.admin_documents
  ALTER COLUMN file_url DROP NOT NULL;

-- 3) doc_type CHECK 가 있을 때만 (제약 이름은 DB에서 확인)
-- SELECT conname FROM pg_constraint WHERE conrelid = 'admin_documents'::regclass;
-- 예시:
-- ALTER TABLE public.admin_documents DROP CONSTRAINT IF EXISTS admin_documents_doc_type_check;
-- ALTER TABLE public.admin_documents
--   ADD CONSTRAINT admin_documents_doc_type_check
--   CHECK (doc_type IN ('business_registration', 'bank_account', 'company_seal'));

-- 서비스 롤(Next.js API의 createAdminClient)은 RLS를 우회하므로 별도 storage policy 없이
-- 서버에서만 download/upload 가능합니다. Public URL 은 사용하지 않습니다.
