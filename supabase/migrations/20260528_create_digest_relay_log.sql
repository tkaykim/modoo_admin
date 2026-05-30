-- 일일 오류 다이제스트 중계 멱등성 로그.
-- /api/cron/error-digest 가 같은 날짜의 다이제스트를 한 번만 전송하도록 보장.
-- (원격 orchestrator 스케줄러가 next_run_at 갱신 지연으로 같은 작업을 반복 실행해도
--  메일은 digest_key 당 1통으로 고정됨)
create table if not exists public.digest_relay_log (
  digest_key text primary key,
  subject text,
  sent_at timestamptz not null default now()
);

comment on table public.digest_relay_log is
  '일일 오류 다이제스트 중계 멱등성 로그. digest_key(보통 다이제스트 날짜)당 1통만 발송 보장.';

-- 서버(서비스 롤)에서만 접근. 클라이언트 노출 불필요 → RLS 켜고 정책 없음(서비스 롤은 RLS 우회).
alter table public.digest_relay_log enable row level security;
