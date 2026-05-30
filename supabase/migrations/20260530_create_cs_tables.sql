-- CS 응대 자동화 (FAQ·매뉴얼·문의 답변, 승인제) — 5 tables
-- See plan: 모두유니폼 CS 응대 자동화
-- worker는 초안만 쓰고, 실제 발송/발행/발급은 modoo_admin에서 대표님 승인 후 실행.

-- 1) cs_manuals — 응대 매뉴얼/SOP (에이전트에 이식되는 내부 지식)
CREATE TABLE IF NOT EXISTS public.cs_manuals (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  intent        text NOT NULL,                -- quote|design|leadtime|shipping|as_refund|order_change|payment_tax|general
  title         text NOT NULL,
  answer_guide  text NOT NULL DEFAULT '',     -- 톤·포함·금지·템플릿
  action_sop    text NOT NULL DEFAULT '',     -- 어떤 액션을 언제 제안하는지
  policy        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- 대표님이 채우는 가격/제작기간/환불 등 사실값
  source        text NOT NULL DEFAULT 'agent',-- manual|agent|research
  status        text NOT NULL DEFAULT 'draft',-- draft|approved|archived
  version       integer NOT NULL DEFAULT 1,
  created_by    uuid,
  approved_by   uuid,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_manuals_intent_status_idx ON public.cs_manuals (intent, status);

-- 2) cs_faq_candidates — FAQ 후보 (승인 시 faqs로 발행)
CREATE TABLE IF NOT EXISTS public.cs_faq_candidates (
  id                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  question                  text NOT NULL,
  answer                    text NOT NULL,
  category                  text,
  intent                    text,
  source                    text NOT NULL DEFAULT 'inquiry_learned', -- inquiry_learned|general|competitor
  rationale                 text,
  confidence                numeric,
  suggested_to_consult      boolean NOT NULL DEFAULT false,
  suggested_show_in_chatbot boolean NOT NULL DEFAULT true,
  status                    text NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  published_faq_id          uuid,
  reviewed_by               uuid,
  reviewed_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_faq_candidates_status_idx ON public.cs_faq_candidates (status);

-- 3) cs_draft_replies — 문의별 응대 초안 + 제안 액션 (검수 큐의 핵심)
CREATE TABLE IF NOT EXISTS public.cs_draft_replies (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  inquiry_id           uuid NOT NULL,
  source_type          text NOT NULL DEFAULT 'board', -- board|chatbot
  intent               text,
  customer_summary     text,
  draft_reply          text NOT NULL DEFAULT '',      -- 게시판·이메일 공용
  proposed_actions     jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{type,params,rationale,default_on}]
  confidence           numeric,
  flags                jsonb NOT NULL DEFAULT '{}'::jsonb, -- {needs_human, reasons[]}
  status               text NOT NULL DEFAULT 'pending_review', -- pending_review|approved|rejected|executing|done|failed
  reviewer_edited_reply text,
  approved_actions     jsonb,
  executed_actions     jsonb,
  run_id               text,
  reviewed_by          uuid,
  reviewed_at          timestamptz,
  executed_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_draft_replies_status_idx ON public.cs_draft_replies (status, created_at DESC);
CREATE INDEX IF NOT EXISTS cs_draft_replies_inquiry_idx ON public.cs_draft_replies (inquiry_id);
-- 문의당 열린 초안 1개만 (중복 triage 방지)
CREATE UNIQUE INDEX IF NOT EXISTS cs_draft_replies_one_open_per_inquiry
  ON public.cs_draft_replies (inquiry_id)
  WHERE status IN ('pending_review', 'approved', 'executing');

-- 4) cs_action_log — 실행 audit + 멱등성 (digest_relay_log 패턴)
CREATE TABLE IF NOT EXISTS public.cs_action_log (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id         uuid,
  action_type      text NOT NULL,            -- post_reply|send_email|issue_coupon
  idempotency_key  text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending', -- pending|done|failed
  request          jsonb,
  result           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_action_log_draft_idx ON public.cs_action_log (draft_id);

-- 5) cs_feedback — 관리자 피드백 학습 데이터 (점진 개선)
CREATE TABLE IF NOT EXISTS public.cs_feedback (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id               uuid,
  inquiry_id             uuid,
  intent                 text,
  original_draft         text,   -- 에이전트 초안
  final_sent             text,   -- 실제 발송본
  verdict                text NOT NULL, -- approved_clean|edited|rejected
  edit_summary           text,   -- 무엇을 왜 고쳤는지 (자동 diff 요약 가능)
  reviewer_note          text,   -- 대표님 메모
  proposed_actions_before jsonb,
  approved_actions_after  jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_feedback_intent_idx ON public.cs_feedback (intent, created_at DESC);

-- RLS: 서비스롤/관리자만 접근. 익명 클라이언트 차단 (admin API는 service_role/서버 경유).
ALTER TABLE public.cs_manuals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_faq_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_draft_replies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_action_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_feedback       ENABLE ROW LEVEL SECURITY;
-- (정책 미정의 = 익명/anon 접근 0. service_role은 RLS 우회하므로 worker/admin API는 정상 동작.)
