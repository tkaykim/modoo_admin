-- 결제일(paid_at)·공장배정일(factory_assigned_at) 신설 + 모든 쓰기 경로 공통 자동 기록 트리거
-- (2026-07-10 mcp apply_migration 으로 프로덕션 적용 완료 — 본 파일은 이력 보관용)
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.order_items add column if not exists factory_assigned_at timestamptz;

comment on column public.orders.paid_at is '최초 결제완료(payment_status=completed 전환) 시각. 트리거 자동 기록.';
comment on column public.order_items.factory_assigned_at is '공장(assigned_manufacturer_id) 배정 시각. 재배정 시 갱신. 트리거 자동 기록.';

-- 결제완료 전환 시각 기록. completed→pending 되돌림(오조작 정정)은 초기화, refunded 는 결제 이력이므로 보존.
create or replace function public.set_order_paid_at()
returns trigger
language plpgsql
as $$
begin
  if new.payment_status = 'completed' and new.paid_at is null then
    new.paid_at := now();
  elsif tg_op = 'UPDATE'
    and old.payment_status = 'completed'
    and new.payment_status = 'pending' then
    new.paid_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_set_paid_at on public.orders;
create trigger trg_orders_set_paid_at
before insert or update on public.orders
for each row execute function public.set_order_paid_at();

-- 공장 배정/재배정 시각 기록. 배정 해제 시 초기화. 같은 공장 재저장은 시각 유지.
create or replace function public.set_order_item_factory_assigned_at()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_manufacturer_id is not null then
    if tg_op = 'INSERT' or old.assigned_manufacturer_id is distinct from new.assigned_manufacturer_id then
      new.factory_assigned_at := now();
    end if;
  else
    new.factory_assigned_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_items_set_factory_assigned_at on public.order_items;
create trigger trg_order_items_set_factory_assigned_at
before insert or update on public.order_items
for each row execute function public.set_order_item_factory_assigned_at();

-- 기존 데이터 백필(근사값): 결제완료 주문은 생성 시각(토스는 생성≈결제, 계좌이체 확인시각은 소급 불가),
-- 배정 품목은 발주 시각(purchase_ordered_at) 우선, 없으면 마지막 수정 시각.
update public.orders
   set paid_at = created_at
 where payment_status = 'completed'
   and paid_at is null;

update public.order_items
   set factory_assigned_at = coalesce(purchase_ordered_at, updated_at, created_at)
 where assigned_manufacturer_id is not null
   and factory_assigned_at is null;
