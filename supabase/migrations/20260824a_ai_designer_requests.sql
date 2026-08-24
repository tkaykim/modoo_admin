-- AI 디자이너 위저드 세션·주문 원장 (2026-08-24, 운영 적용 완료 — MCP apply_migration 'ai_designer_requests')
-- 모든 쓰기는 modoo_app 서버 API(service role)를 통해서만 수행한다. anon/auth 직접 접근은 차단.
create table if not exists public.ai_designer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  status text not null default 'draft', -- draft | drafted | ordered
  product_id uuid references public.products(id),
  product_color jsonb,            -- {hex, name, code, side_mockups}
  source_images jsonb not null default '[]'::jsonb, -- [{url, path, name, origin: upload|camera|ai, prompt?, width, height}]
  placements jsonb not null default '[]'::jsonb,    -- [{side_id, image_index, anchor_id?, fx, fy, width_mm}]
  draft_images jsonb not null default '{}'::jsonb,  -- {side_id: url} AI/합성 초안
  size_quantities jsonb,          -- {"M": 3, "L": 5}
  customer_note text,
  saved_design_id uuid references public.saved_designs(id),
  cart_item_ids jsonb,
  order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_designer_requests_user on public.ai_designer_requests(user_id);
create index if not exists idx_ai_designer_requests_status on public.ai_designer_requests(status);

alter table public.ai_designer_requests enable row level security;
-- 정책 없음 = anon/authenticated 전면 차단. service role만 접근.
