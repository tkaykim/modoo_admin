-- 관리자 "기존 디자인 불러오기" 검색 정본
--
-- 배경: /api/admin/designs 는 saved_designs.title 만 ilike 검색해서,
--   * 주문에서 디자인 이름을 바꿔도(order_items.design_title) saved_designs.title 은 그대로라
--     운영자가 주문 화면에서 보이는 이름으로 검색하면 결과가 0건이 된다.
--   * 검색창 placeholder 가 약속한 "사용자 / 제품명" 도 실제로는 동작하지 않았다.
-- 해결: 디자인 제목 + 소유자(이름/이메일/전화) + 제품명 + 주문(주문번호/주문자/수령인/주문상 디자인명)
--       까지 한 번에 훑어 id 목록과 총계를 돌려준다.
--
-- 반환: { "total": <bigint>, "ids": ["<uuid>", ...] }  (created_at desc 정렬)

create or replace function public.admin_search_saved_design_ids(
  p_search text default null,
  p_limit int default 10,
  p_offset int default 0
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with q as (
    select nullif(btrim(coalesce(p_search, '')), '') as term
  ),
  matched as (
    select sd.id, sd.created_at
    from saved_designs sd
    cross join q
    where q.term is null
       or sd.title ilike '%' || q.term || '%'
       or exists (
            select 1 from profiles p
            where p.id = sd.user_id
              and (
                p.name ilike '%' || q.term || '%'
                or p.email ilike '%' || q.term || '%'
                or p.phone_number ilike '%' || q.term || '%'
              )
          )
       or exists (
            select 1 from products pr
            where pr.id = sd.product_id
              and pr.title ilike '%' || q.term || '%'
          )
       or exists (
            select 1 from order_items oi
            where oi.design_id = sd.id
              and (
                oi.design_title ilike '%' || q.term || '%'
                or oi.product_title ilike '%' || q.term || '%'
                or exists (
                     select 1 from orders o
                     where o.id = oi.order_id
                       and (
                         o.id ilike '%' || q.term || '%'
                         or o.customer_name ilike '%' || q.term || '%'
                         or o.customer_email ilike '%' || q.term || '%'
                         or o.customer_phone ilike '%' || q.term || '%'
                         or o.recipient_name ilike '%' || q.term || '%'
                       )
                   )
              )
          )
  ),
  page as (
    select m.id, row_number() over (order by m.created_at desc) as rn
    from matched m
    order by m.created_at desc
    limit greatest(coalesce(p_limit, 10), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'ids', coalesce((select jsonb_agg(page.id order by page.rn) from page), '[]'::jsonb)
  );
$$;

-- 관리자 전용: service_role(서버 API)만 실행 가능. anon/authenticated 노출 금지.
revoke all on function public.admin_search_saved_design_ids(text, int, int) from public;
revoke all on function public.admin_search_saved_design_ids(text, int, int) from anon;
revoke all on function public.admin_search_saved_design_ids(text, int, int) from authenticated;
grant execute on function public.admin_search_saved_design_ids(text, int, int) to service_role;
