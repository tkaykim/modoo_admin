-- 시안확인 등 카카오 알림톡 발송 로그를 modoo DB(자기 도메인)에 보관.
-- 워커(orchestrator)가 발송 시 미러 기록, modoo_admin이 자기 DB에서 직접 조회
-- (허브 service-role 직접 결합 제거). 허브 modoo_alimtalk_log는 멱등 정본으로 유지.
create table if not exists public.modoo_alimtalk_log (
  id           bigserial primary key,
  event_type   text not null,
  entity_id    text not null,
  phone        text,
  template_key text,
  status       text not null,
  message_id   text,
  error        text,
  variables    jsonb,
  created_at   timestamptz not null default now(),
  unique (event_type, entity_id)
);

alter table public.modoo_alimtalk_log enable row level security;
