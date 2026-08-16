-- 주문 시스템 도입 문의(B2B) 접수 테이블.
-- 고객 CS 문의(inquiries)나 학교 영업 리드(lead_*)와 목적이 달라 분리한다.
create table if not exists public.biz_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- 필수 최소 정보
  track text not null,                 -- produce | outsource | mall_only | supplier | unknown
  contact_name text not null,
  phone text not null,

  -- 선택 정보
  company text,
  email text,
  shop_url text,
  platform text,                       -- cafe24 | godo | imweb | smartstore | custom | none
  monthly_orders text,                 -- lt10 | 10_50 | 50_200 | gt200
  print_methods text[],
  pain_note text,

  -- 동의 (개인정보보호법·정보통신망법)
  agree_privacy boolean not null default false,
  agree_marketing boolean not null default false,

  -- 유입 추적
  source text default 'web',           -- web | booth | qr
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referer text,
  user_agent text,

  -- 처리 상태
  status text not null default 'new',  -- new | contacted | demo_sent | closed
  admin_note text
);

comment on table public.biz_leads is '커스텀 주문 시스템 도입 문의(B2B). K-PRINT 2026 부스·웹 랜딩 유입.';

create index if not exists biz_leads_created_at_idx on public.biz_leads (created_at desc);
create index if not exists biz_leads_status_idx on public.biz_leads (status);

-- 공개 랜딩에서만 들어오므로 클라이언트 직접 접근은 막고 서버(service role)로만 쓴다.
alter table public.biz_leads enable row level security;
