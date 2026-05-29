-- 주문 상태 알림메일 발송 대기 큐.
-- KST 09:00~20:00 외 시간에 발생한 상태 알림은 즉시 발송하지 않고 이 테이블에 적재하고,
-- /api/cron/notification-queue 가 매일 09:00 KST(00:00 UTC)에 일괄 발송한다.
create table if not exists public.queued_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  customer_name text,
  customer_email text not null,
  new_status text not null,
  previous_status text,
  tracking_number text,
  items jsonb,
  total_amount numeric,
  payment_method text,
  scheduled_for timestamptz not null,
  status text not null default 'pending', -- pending | sent | failed
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

comment on table public.queued_notifications is
  '발송 시간대(KST 09~20시) 밖에 발생한 주문 상태 알림메일 대기 큐. cron이 다음 09:00 KST에 일괄 발송.';

-- cron 픽업 쿼리(status='pending' and scheduled_for <= now())용 인덱스.
create index if not exists queued_notifications_pending_idx
  on public.queued_notifications (scheduled_for)
  where status = 'pending';

-- 서버(서비스 롤)에서만 접근. 클라이언트 노출 불필요 → RLS 켜고 정책 없음(서비스 롤은 RLS 우회).
alter table public.queued_notifications enable row level security;
