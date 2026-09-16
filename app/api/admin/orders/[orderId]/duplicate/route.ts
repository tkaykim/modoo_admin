import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { getKstYYYYMMDD } from '@/lib/kst';

/**
 * 주문 복사 (재결제용).
 *
 * 카드 승인이 안 되거나 "다른 카드로 다시 결제하고 싶다"는 고객을 위해,
 * 기존 주문의 주문정보·디자인·사이즈별 수량·주소지·금액을 그대로 유지한 채
 * 결제만 다시 받을 수 있는 새 주문을 만든다.
 *
 * 복사되는 것: 고객/받는 분 정보, 배송지, 배송방법·배송비, 품목(디자인·목업·사이즈별 수량·단가),
 *              할인·할증·쿠폰 금액과 최종 결제금액, 메모, 문의/파트너몰/영업사원 귀속, 유입(UTM).
 * 초기화되는 것: 결제(결제대기), 송장·로젠, 공유링크, 발주·공장 배정·공장단가, 입금/승인 시각.
 *
 * 원주문은 건드리지 않는다. 원주문 취소·환불은 운영자가 별도로 판단해 처리한다.
 */

type PaymentType = 'customer_payment' | 'bank_transfer' | 'manual';

const SITE_URL = 'https://modoouniform.com';

// 복사 대상 orders 컬럼 — 결제·배송·발주 관련 컬럼은 의도적으로 제외한다.
const ORDER_COPY_COLUMNS = [
  'user_id',
  'order_category',
  'cobuy_session_id',
  'parent_order_id',
  'inquiry_id',
  'customer_name',
  'customer_email',
  'customer_phone',
  'guest_name',
  'guest_email',
  'guest_phone',
  'recipient_name',
  'recipient_phone',
  'recipient_same_as_orderer',
  'shipping_method',
  'country_code',
  'state',
  'city',
  'postal_code',
  'address_line_1',
  'address_line_2',
  'delivery_fee',
  'shipping_box_qty',
  'total_amount',
  'original_amount',
  'custom_unit_price',
  'admin_discount',
  'admin_surcharge',
  'coupon_discount',
  'applied_coupon_id',
  'salesman_id',
  'salesman_coupon_id',
  'salesman_discount_amount',
  'partner_mall_id',
  'pricing_note',
  'notes',
  'customer_note',
  'attachment_urls',
  'customer_editable_fields',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
] as const;

// 복사 대상 order_items 컬럼 — 디자인·수량·단가는 그대로, 발주·공장 관련은 제외한다.
const ITEM_COPY_COLUMNS = [
  'product_id',
  'design_id',
  'product_variant_id',
  'product_title',
  'design_title',
  'quantity',
  'price_per_item',
  'canvas_state',
  'color_selections',
  'item_options',
  'thumbnail_url',
  'image_urls',
  'text_svg_exports',
  'custom_fonts',
  'calibration_snapshot',
  'configuration_snapshot',
  'source_template_id',
  'production_ready',
  'design_status',
  'design_share_channel',
  'design_shared_at',
  'design_confirmed_at',
  'design_revision_note',
  'color_notice_agreed_at',
  'retouch_requested',
] as const;

const buildOrderId = () => {
  const ymd = getKstYYYYMMDD();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORDER-${ymd}-${random}`;
};

const pick = (row: Record<string, unknown>, columns: readonly string[]) => {
  const out: Record<string, unknown> = {};
  for (const col of columns) out[col] = row[col] ?? null;
  return out;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || !isAdminLike(profile.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { paymentType?: PaymentType };
    const paymentType: PaymentType = body.paymentType || 'customer_payment';

    const adminClient = createAdminClient();

    const { data: source, error: sourceError } = await adminClient
      .from('orders')
      .select(`id, ${ORDER_COPY_COLUMNS.join(', ')}`)
      .eq('id', orderId)
      .single<Record<string, unknown>>();

    if (sourceError || !source) {
      return NextResponse.json({ error: '원주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: sourceItems, error: itemsError } = await adminClient
      .from('order_items')
      .select(ITEM_COPY_COLUMNS.join(', '))
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .returns<Record<string, unknown>[]>();

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
    if (!sourceItems || sourceItems.length === 0) {
      return NextResponse.json({ error: '복사할 상품이 없는 주문입니다.' }, { status: 400 });
    }

    // 결제 방식 — 기본은 고객이 결제링크에서 직접(다른 카드로) 결제.
    let paymentMethod: string | null;
    let paymentLinkToken: string | null = null;
    if (paymentType === 'bank_transfer') {
      paymentMethod = 'bank_transfer';
    } else if (paymentType === 'manual') {
      paymentMethod = null;
    } else {
      paymentMethod = 'toss';
      paymentLinkToken = randomBytes(16).toString('hex');
    }

    const newOrderId = buildOrderId();
    const copied = pick(source, ORDER_COPY_COLUMNS);

    // 원주문 추적용 표시 — 별도 컬럼이 없어 운영 메모 첫 줄에 남긴다.
    const traceLine = `[재결제용 복사 · 원주문 ${orderId}]`;
    const existingNotes = typeof copied.notes === 'string' ? copied.notes.trim() : '';
    copied.notes = existingNotes ? `${traceLine}\n${existingNotes}` : traceLine;

    const orderPayload: Record<string, unknown> = {
      ...copied,
      id: newOrderId,
      payment_method: paymentMethod,
      payment_status: 'pending',
      order_status: 'payment_pending',
      payment_key: null,
      paid_at: null,
      payment_link_token: paymentLinkToken,
      payment_link_expires_at: null,
      toss_method: null,
      toss_status: null,
      toss_approved_at: null,
      toss_virtual_account: null,
      // 배송·발주·공유는 새 주문 기준으로 다시 시작한다.
      tracking_number: null,
      tracking_carrier: null,
      extra_tracking_numbers: null,
      logen_registered_at: null,
      logen_slip_printed: false,
      share_token: null,
      refund_reason: null,
      coupon_usage_id: null,
      assigned_factory_id: null,
      assigned_manufacturer_id: null,
      factory_status: 'pending',
      factory_amount: null,
      factory_payment_status: 'pending',
      factory_payment_date: null,
      deadline: null,
    };

    const { error: insertOrderError } = await adminClient.from('orders').insert(orderPayload);
    if (insertOrderError) {
      return NextResponse.json({ error: insertOrderError.message }, { status: 500 });
    }

    const itemPayloads = sourceItems.map((item) => ({
      ...pick(item, ITEM_COPY_COLUMNS),
      order_id: newOrderId,
      // 발주·공장 배정은 승계하지 않는다(중복 발주 방지).
      purchase_order_status: 'pending',
      purchase_ordered_at: null,
      assigned_manufacturer_id: null,
      factory_assigned_at: null,
      factory_status: 'pending',
      factory_amount: null,
      factory_unit_price: null,
      factory_price_mode: null,
      factory_price_confirmed_at: null,
      factory_price_confirmed_by: null,
      factory_price_locked: false,
      factory_price_locked_by: null,
      factory_price_locked_at: null,
      factory_payment_status: 'pending',
      factory_payment_date: null,
      deadline: null,
      work_drive_folder_id: null,
      work_drive_folder_url: null,
    }));

    const { error: insertItemsError } = await adminClient.from('order_items').insert(itemPayloads);
    if (insertItemsError) {
      await adminClient.from('orders').delete().eq('id', newOrderId);
      return NextResponse.json({ error: insertItemsError.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        orderId: newOrderId,
        sourceOrderId: orderId,
        itemCount: itemPayloads.length,
        paymentType,
        paymentLinkToken,
        paymentLinkUrl: paymentLinkToken ? `${SITE_URL}/order/custom/${paymentLinkToken}` : null,
      },
    });
  } catch (err) {
    console.error('[admin/orders/duplicate] error:', err);
    const message = err instanceof Error ? err.message : '주문 복사에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
