-- Durable CS learning state.
--
-- Administrator edits and rejections used to live only as raw examples in
-- cs_feedback.  The worker loaded the latest 20 rows, so clean approvals could
-- push important corrections out of the prompt.  Keep the original evidence,
-- but explicitly pin high-signal rows and persist a compact learned rule.

alter table public.cs_feedback
  add column if not exists is_pinned boolean not null default false,
  add column if not exists learned_at timestamptz,
  add column if not exists learning_rule text,
  add column if not exists learning_version integer not null default 1;

comment on column public.cs_feedback.is_pinned is
  'True for edited/rejected feedback that must remain in the CS knowledge set regardless of recency.';
comment on column public.cs_feedback.learned_at is
  'When the feedback was converted into a compact durable learning rule.';
comment on column public.cs_feedback.learning_rule is
  'PII-free generalized instruction distilled from the administrator correction.';
comment on column public.cs_feedback.learning_version is
  'Version of the feedback-to-rule distillation contract.';

update public.cs_feedback
set
  is_pinned = true,
  learning_rule = case
    when nullif(btrim(reviewer_note), '') is not null then btrim(reviewer_note)
    else learning_rule
  end,
  learned_at = case
    when nullif(btrim(reviewer_note), '') is not null then coalesce(learned_at, now())
    else learned_at
  end
where verdict in ('edited', 'rejected');

create index if not exists cs_feedback_pinned_intent_created_idx
  on public.cs_feedback (intent, created_at desc)
  where is_pinned = true;

alter table public.cs_draft_replies
  add column if not exists knowledge_snapshot jsonb not null default '{}'::jsonb;

comment on column public.cs_draft_replies.knowledge_snapshot is
  'Trace of the durable manuals and learned feedback rules used to generate this draft.';
