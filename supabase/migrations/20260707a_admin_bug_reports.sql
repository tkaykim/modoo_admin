-- 관리자(직원) 고장신고를 DB에 영속화 + 처리상태·완료알림 루프.
-- 기존엔 modoo Gmail로 메일만 발송돼 이력·상태가 남지 않아 신고가 묻히던 문제 해결.
-- 신규 테이블 1개만 추가(기존 스키마 무변경). 접근은 역할검증된 서버 라우트(service role)로만.

create table if not exists public.admin_bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid,
  reporter_name text,
  reporter_email text,
  reporter_role text,
  title text not null,
  description text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  page_url text,
  user_agent text,
  status text not null default 'open'
    check (status in ('open','in_progress','resolved','improvement','not_a_bug','wont_fix')),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_bug_reports_status on public.admin_bug_reports(status);
create index if not exists idx_admin_bug_reports_created on public.admin_bug_reports(created_at desc);
create index if not exists idx_admin_bug_reports_reporter on public.admin_bug_reports(reporter_id);

alter table public.admin_bug_reports enable row level security;
-- 정책 미부여: anon/authenticated 직접 접근 차단. 모든 조회/수정은 역할검증 API(service role)만.
