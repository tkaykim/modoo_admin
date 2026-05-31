-- CS 답변 메일 야간 보류 큐. KST 09~21시 외에 발행된 메일은 즉시 발송하지 않고
-- 적재 → /api/cron/notification-queue (매일 09:00 KST)에서 일괄 발송.
CREATE TABLE IF NOT EXISTS public.cs_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid,
  to_email text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  body_text text NOT NULL DEFAULT '',
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS cs_email_queue_pending_idx ON public.cs_email_queue (scheduled_for) WHERE status='pending';
ALTER TABLE public.cs_email_queue ENABLE ROW LEVEL SECURITY;
