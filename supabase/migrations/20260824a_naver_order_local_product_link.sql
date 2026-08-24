-- 네이버 상품주문을 자체몰 상품 원장과 직접 연결한다.
alter table public.naver_product_orders
  add column if not exists local_product_id uuid references public.products(id) on delete set null,
  add column if not exists option_manage_code text;

create index if not exists idx_naver_product_orders_local_product
  on public.naver_product_orders(local_product_id)
  where local_product_id is not null;
