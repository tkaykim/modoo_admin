-- 상품별 재사용 가능한 조건부 할인 룰
-- 현재는 quantity_threshold (수량 임계값) 룰만 지원. 추후 amount_threshold, 기간 등 확장 가능.

create table if not exists public.product_discount_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  rule_type text not null default 'quantity_threshold'
    check (rule_type in ('quantity_threshold')),
  min_quantity integer not null check (min_quantity > 0),
  discount_type text not null
    check (discount_type in ('fixed', 'percentage')),
  discount_value numeric not null check (discount_value > 0),
  active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_discount_rules_product_active_idx
  on public.product_discount_rules (product_id) where active;

alter table public.product_discount_rules enable row level security;

-- 관리자: 전체 권한 (관리자 판별은 기존 products 정책과 동일한 패턴을 따른다고 가정)
create policy "admin_all_product_discount_rules"
  on public.product_discount_rules
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin'))
  );

-- 일반 유저: 활성 룰만 read
create policy "public_read_active_product_discount_rules"
  on public.product_discount_rules
  for select
  to anon, authenticated
  using (active = true);

-- 주문에 적용된 룰 스냅샷 + 미평가 룰 설정
alter table public.orders
  add column if not exists rule_discount numeric not null default 0,
  add column if not exists applied_discount_rules jsonb,
  add column if not exists pending_discount_config jsonb;

comment on column public.orders.rule_discount is '상품별 할인 룰로 인한 할인 합계 (admin_discount와 별개)';
comment on column public.orders.applied_discount_rules is
  '룰 적용 내역 스냅샷: [{ rule_id, product_id, item_id, name, applied_amount, snapshot }]';
comment on column public.orders.pending_discount_config is
  '고객 수량 입력 위임 시 결제 시점에 적용할 룰/사전 할인 구성: { adminDiscount, adminDiscountType, ruleIds }';
