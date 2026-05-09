-- 20260509130000: 주문 생성 트랜잭션화 + Toss 결제 멱등성
-- 배경:
--   기존 흐름은 orders insert → order_items insert를 분리 호출하여
--   items 실패 시 결제는 통과/주문은 비정상 상태로 남았다(toss/confirm route TODO 주석 참조).
--   Postgres 함수는 단일 트랜잭션으로 동작하므로 중간 실패 시 자동 롤백된다.
--
--   동시에 동일 paymentKey/orderId 중복 confirm 호출 시 두 번째 호출이 PK 충돌로 500 응답을
--   내고, 결과적으로 분석/이메일 등 부수효과가 두 번 발화될 수 있었다.
--   payment_key UNIQUE 인덱스로 멱등성을 강제한다.

BEGIN;

-- 1) payment_key 멱등성: 동일 결제키로 두 번 주문이 만들어지지 않도록 보장.
--    기존 데이터에 NULL 값이 다수 존재하므로 partial unique index 사용.
CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_key_unique
  ON public.orders (payment_key)
  WHERE payment_key IS NOT NULL;

-- 2) 트랜잭션 함수: orders + order_items 단일 트랜잭션 INSERT.
--    함수 내부 RAISE 시 자동 롤백.
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_order jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id text;
  v_inserted_items jsonb;
BEGIN
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'invalid p_order';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid p_items';
  END IF;

  -- orders insert. id가 비어있으면 RAISE.
  v_order_id := p_order->>'id';
  IF v_order_id IS NULL OR length(v_order_id) = 0 THEN
    RAISE EXCEPTION 'missing order id';
  END IF;

  -- jsonb_populate_record는 컬럼 정의가 안정적이지 않을 수 있어
  -- 명시 INSERT … SELECT로 처리한다. orders 컬럼셋이 변하면 이 함수도 같이 갱신해야 한다.
  INSERT INTO public.orders (
    id, user_id,
    customer_name, customer_email, customer_phone,
    shipping_method, country_code, state, city, postal_code,
    address_line_1, address_line_2,
    delivery_fee, total_amount, original_amount,
    payment_method, payment_key, payment_status, order_status,
    coupon_usage_id, coupon_discount, applied_coupon_id,
    salesman_coupon_id, salesman_discount_amount,
    admin_discount, admin_surcharge,
    customer_note, attachment_urls,
    partner_mall_id, salesman_id,
    payment_link_token, order_category
  )
  SELECT
    v_order_id,
    NULLIF(p_order->>'user_id','')::uuid,
    p_order->>'customer_name',
    p_order->>'customer_email',
    p_order->>'customer_phone',
    p_order->>'shipping_method',
    p_order->>'country_code',
    p_order->>'state',
    p_order->>'city',
    p_order->>'postal_code',
    p_order->>'address_line_1',
    p_order->>'address_line_2',
    NULLIF(p_order->>'delivery_fee','')::numeric,
    NULLIF(p_order->>'total_amount','')::numeric,
    NULLIF(p_order->>'original_amount','')::numeric,
    p_order->>'payment_method',
    p_order->>'payment_key',
    p_order->>'payment_status',
    p_order->>'order_status',
    NULLIF(p_order->>'coupon_usage_id','')::uuid,
    COALESCE(NULLIF(p_order->>'coupon_discount','')::numeric, 0),
    NULLIF(p_order->>'applied_coupon_id','')::uuid,
    NULLIF(p_order->>'salesman_coupon_id','')::uuid,
    COALESCE(NULLIF(p_order->>'salesman_discount_amount','')::numeric, 0),
    COALESCE(NULLIF(p_order->>'admin_discount','')::numeric, 0),
    COALESCE(NULLIF(p_order->>'admin_surcharge','')::numeric, 0),
    p_order->>'customer_note',
    CASE WHEN p_order ? 'attachment_urls'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_order->'attachment_urls'))
         ELSE NULL END,
    NULLIF(p_order->>'partner_mall_id','')::uuid,
    NULLIF(p_order->>'salesman_id','')::uuid,
    p_order->>'payment_link_token',
    COALESCE(p_order->>'order_category','regular');

  -- 멱등성 충돌이면 위 INSERT가 unique violation을 던진다.
  -- 호출자(API 라우트)는 23505를 별도로 처리해야 한다.

  -- order_items insert (각 item이 jsonb)
  INSERT INTO public.order_items (
    order_id, product_id, product_title, quantity, price_per_item,
    design_id, design_title, product_variant_id,
    canvas_state, color_selections, item_options,
    thumbnail_url, image_urls, custom_fonts, text_svg_exports,
    retouch_requested, purchase_order_status, design_status
  )
  SELECT
    v_order_id,
    NULLIF(item->>'product_id','')::uuid,
    item->>'product_title',
    NULLIF(item->>'quantity','')::int,
    NULLIF(item->>'price_per_item','')::numeric,
    NULLIF(item->>'design_id','')::uuid,
    item->>'design_title',
    NULLIF(item->>'product_variant_id','')::uuid,
    COALESCE(item->'canvas_state', '{}'::jsonb),
    COALESCE(item->'color_selections', '{}'::jsonb),
    COALESCE(item->'item_options', '{}'::jsonb),
    item->>'thumbnail_url',
    COALESCE(item->'image_urls', '{}'::jsonb),
    COALESCE(item->'custom_fonts', '[]'::jsonb),
    item->'text_svg_exports',
    COALESCE((item->>'retouch_requested')::boolean, false),
    COALESCE(item->>'purchase_order_status','pending'),
    COALESCE(item->>'design_status','pending')
  FROM jsonb_array_elements(p_items) AS item;

  -- 결과: 생성된 주문 + 항목 ID 리스트
  SELECT jsonb_agg(jsonb_build_object('id', oi.id, 'order_id', oi.order_id))
    INTO v_inserted_items
    FROM public.order_items oi
   WHERE oi.order_id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'items', COALESCE(v_inserted_items, '[]'::jsonb)
  );
END;
$$;

-- 3) 권한: API 라우트가 service_role과 authenticated 양쪽에서 호출 가능.
--    (anon은 게스트 결제 시 createClient(server) 컨텍스트에서 호출되므로 함께 부여)
GRANT EXECUTE ON FUNCTION public.create_order_with_items(jsonb, jsonb) TO authenticated, anon, service_role;

COMMIT;
