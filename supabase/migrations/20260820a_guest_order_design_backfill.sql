-- 비회원(게스트) 주문 디자인 저장본 백필 (2026-08-20, prod 적용 완료)
--
-- 배경: 게스트 주문은 고객 디자인함이 없어 시안확정 write-back 이 skip 됐다.
--   결과적으로 디자인이 order_items.canvas_state 안에만 남아 saved_designs 에 없었고,
--   "기존 디자인 불러오기"는 saved_designs 만 조회하므로 재주문 때 담당자가 디자인을
--   처음부터 다시 그려야 했다. (실사례: ORD-20260812-5G3U8G → 2026-08-20 수기 재작업 후
--   ORDER-20260820-GMHKA2 생성)
--
-- 조치:
--   1) 시스템 계정 `guest-designs@modoo.co.kr` 생성 (scripts/ensure-guest-design-owner.mjs).
--      saved_designs.user_id 가 NOT NULL 이라 소유자가 필요하다. 사람이 로그인하지 않으며
--      고객 앱은 본인 user_id 로만 조회하므로 이 디자인들은 어드민에서만 보인다.
--   2) design_id 가 없고 실제 캔버스가 있는 주문 품목 179건을 저장본으로 만들고 재연결.
--      canvas_state = '{}' 인 7건(간이 이미지 주문)은 그릴 내용이 없어 제외.
--   3) lib/designWriteBack.ts (admin·app 양쪽)가 앞으로는 게스트 주문도 이 계정 명의로 저장.
--
-- 멱등: design_id 가 이미 있으면 건너뛴다. 아래 owner uuid 는 1)에서 생성된 실제 계정이다.

do $$
declare
  v_owner uuid;
  r record;
  v_design uuid;
  v_count int := 0;
begin
  select id into v_owner from profiles where email = 'guest-designs@modoo.co.kr';
  if v_owner is null then
    raise notice 'guest design owner account missing — run scripts/ensure-guest-design-owner.mjs first';
    return;
  end if;

  for r in
    select oi.id as item_id, oi.order_id, oi.product_id, oi.design_title, oi.product_title,
           oi.canvas_state, oi.color_selections, oi.thumbnail_url, oi.price_per_item,
           oi.image_urls, oi.text_svg_exports, oi.custom_fonts,
           oi.design_status, oi.design_confirmed_at
    from order_items oi
    where oi.design_id is null
      and oi.canvas_state is not null
      and oi.canvas_state <> '{}'::jsonb
    order by oi.created_at
  loop
    insert into saved_designs (
      user_id, product_id, title, canvas_state, color_selections, preview_url,
      price_per_item, image_urls, text_svg_exports, custom_fonts,
      last_confirmed_at, last_confirmed_order_item_id
    ) values (
      v_owner, r.product_id,
      coalesce(nullif(btrim(r.design_title), ''), coalesce(r.product_title, '디자인') || ' (' || r.order_id || ')'),
      r.canvas_state, coalesce(r.color_selections, '{}'::jsonb), r.thumbnail_url,
      r.price_per_item, r.image_urls, r.text_svg_exports, r.custom_fonts,
      case when r.design_status = 'confirmed' then r.design_confirmed_at end,
      case when r.design_status = 'confirmed' then r.item_id end
    )
    returning id into v_design;

    update order_items set design_id = v_design, updated_at = now() where id = r.item_id;
    v_count := v_count + 1;
  end loop;
  raise notice 'backfilled %', v_count;
end $$;
