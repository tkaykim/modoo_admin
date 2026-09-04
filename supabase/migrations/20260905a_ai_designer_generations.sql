-- AI 디자이너 생성 원장 (2026-09-05, 운영 적용 — MCP apply_migration 'ai_designer_generations')
-- 한 행 = 생성 라운드 1회(후보 n장). 비용·품질 플래그·선택·디자이너 평가(파일럿)를 기록해
-- 세션/IP 캡과 파일럿 지표(사용 가능률·보정 시간)를 계산한다.
-- 모든 쓰기는 modoo_app 서버 API(service role)만 수행. anon/auth 직접 접근 차단.
create table if not exists public.ai_designer_generations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'customer',             -- customer | pilot
  session_id uuid references public.ai_designer_requests(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  ip_hash text,                                      -- sha256(salt:ip) 앞 32자 — 하루 캡 계산용
  purpose text not null,                             -- emblem | mascot | wordmark
  provider text not null,                            -- gemini | openai | recraft | ideogram | mock
  model text not null,
  request_text text not null default '',             -- 고객 원문(한국어)
  prompt text not null,                              -- 모델에 보낸 구조화 프롬프트
  negative_prompt text,
  candidate_count int not null default 0,
  candidates jsonb not null default '[]'::jsonb,     -- [{index, path, url, width, height, mime, quality, svgPath?, svgUrl?}]
  selected_index int,
  variation_of uuid references public.ai_designer_generations(id) on delete set null,
  final jsonb,                                       -- {path, url, width, height, svgPath, svgUrl, removedBackground, vectorized, quality}
  cost_usd numeric(10,4) not null default 0,         -- 가격표 기준 추정치
  credits numeric(12,3),                             -- 제공자가 알려준 크레딧(Recraft)
  status text not null default 'generated',          -- generated | selected | finalized | failed
  pilot_run text,
  pilot_prompt_id text,
  ratings jsonb,                                     -- 파일럿 디자이너 평가 [{index, grade: keep|fix|reject, minutes?, note?}]
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_designer_generations_session on public.ai_designer_generations(session_id);
create index if not exists idx_ai_designer_generations_ip_day on public.ai_designer_generations(ip_hash, created_at desc);
create index if not exists idx_ai_designer_generations_pilot on public.ai_designer_generations(pilot_run);
create index if not exists idx_ai_designer_generations_created on public.ai_designer_generations(created_at desc);

alter table public.ai_designer_generations enable row level security;
-- 정책 없음 = anon/authenticated 전면 차단. service role만 접근.
