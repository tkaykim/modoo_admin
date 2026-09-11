-- 마케팅·UX 분석가(열람 전용) 역할 추가.
-- marketing_manager 와 같은 화면(분석·마케팅 콘솔·주간 매출 목표)을 보지만
-- Meta 광고 중단·재개·예산 변경·소재 업로드·소재 승인·목표 저장 같은 쓰기 API는 서버에서 403 으로 막는다.
-- (권한 판정은 lib/auth-helpers.ts canExecuteMarketingActions / requireMarketingWriteAccess)

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (
    role = ANY (
      ARRAY[
        'admin'::text,
        'customer'::text,
        'factory'::text,
        'manufacturer'::text,
        'super_admin'::text,
        'marketing_manager'::text,
        'marketing_analyst'::text
      ]
    )
  );
