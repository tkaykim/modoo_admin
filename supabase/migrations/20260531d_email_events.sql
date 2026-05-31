-- 이메일 추적(Track A): 발송·열람·클릭 이벤트 적재.
-- Gmail SMTP 발송을 유지한 채, 메일 HTML에 추적 픽셀(open)과 래핑 링크(click)를 심어
-- modoouniform.com/api/email/{open,click} 가 이 테이블에 이벤트를 기록한다.
-- 서비스 롤 전용(RLS on, 정책 없음).

CREATE TABLE IF NOT EXISTS public.email_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL,                                   -- 메일 1통당 고유 추적 id
  inquiry_id  uuid REFERENCES public.inquiries(id) ON DELETE SET NULL,
  draft_id    uuid,                                            -- cs_draft_replies.id (느슨한 참조)
  to_email    text,
  event_type  text NOT NULL CHECK (event_type IN ('sent','queued','open','click','bounce')),
  url         text,                                            -- click 시 목적지
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_message  ON public.email_events(message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_inquiry  ON public.email_events(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type_time ON public.email_events(event_type, created_at DESC);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
