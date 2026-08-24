import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole, isSuperAdmin } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendFactoryAssignmentEmail } from '@/lib/gmail';
import { sendOrderStatusNotification, type OrderStatus } from '@/lib/notifications/order-status';
import { LOGEN_CONTRACT_FARE } from '@/lib/logen';
import { assertPhoneOrMessage, sanitizePhoneInput } from '@/lib/phone';
import { NAVER_UNIFIED_ORDER_PREFIX, projectNaverOrdersForAdmin } from '@/lib/naver-commerce/unified-orders';
import { randomBytes } from 'crypto';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, manufacturer_id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 403 });
    }

    if (!profile || (!isBackofficeOperatorRole(profile.role))) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'all';
    const factoryId = url.searchParams.get('factoryId');
    const orderId = url.searchParams.get('orderId');
    const includeNaver = url.searchParams.get('includeNaver') === '1';
    // 택배 관리 등에서 디자인 썸네일/4면 미리보기가 필요할 때만 미디어 필드 포함(기본 목록 페이로드 비대화 방지)
    const withMedia = url.searchParams.get('withMedia') === '1';
    const itemMedia = withMedia ? ', thumbnail_url, image_urls, product_title, quantity, price_per_item' : '';

    const adminClient = createAdminClient();

    // Factory users: sort by deadline (마감일), Admin users: sort by created_at
    const isFactoryUser = profile.role === 'factory';

    // Factory fields are now on order_items, include them in the join
    const selectFields = isFactoryUser
      ? `id, order_category, parent_order_id, order_status, customer_note, attachment_urls, created_at, order_items!inner(id, product_title, quantity, design_title, thumbnail_url, assigned_manufacturer_id, factory_assigned_at, factory_status, factory_amount, factory_unit_price, factory_price_confirmed_at, factory_price_locked, deadline, factory_payment_date, factory_payment_status)`
      : `id, customer_name, customer_email, customer_phone, recipient_name, recipient_phone, recipient_same_as_orderer, order_category, parent_order_id, inquiry_id, delivery_fee, created_at, paid_at, total_amount, order_status, payment_status, payment_method, shipping_method, country_code, postal_code, state, city, address_line_1, address_line_2, tracking_number, tracking_carrier, logen_registered_at, logen_slip_printed, shipping_box_qty, refund_reason, customer_note, attachment_urls, notes, original_amount, custom_unit_price, admin_discount, admin_surcharge, coupon_discount, applied_coupon_id, pricing_note, payment_link_token, share_token, partner_mall_id, partner_mall:partner_malls(id,name,slug), salesman_id, attributed_salesman:salesman_profiles!salesman_id(id,display_name,salesman_code), order_items(id, purchase_order_status, design_title${itemMedia}, assigned_manufacturer_id, factory_assigned_at, factory_status, factory_amount, deadline, factory_payment_date, factory_payment_status)`;

    let query = adminClient.from('orders').select(selectFields as string);

    if (orderId) {
      query = query.eq('id', orderId);
    }

    // 차액(추가) 주문 조회 — 특정 원주문의 자식 차액주문 목록
    const parentOrderId = url.searchParams.get('parentOrderId');
    if (parentOrderId) {
      query = query.eq('parent_order_id', parentOrderId);
    }

    if (isFactoryUser) {
      if (!profile.manufacturer_id) {
        return NextResponse.json({ data: [] });
      }
      // Filter orders that have at least one item assigned to this factory
      query = query.eq('order_items.assigned_manufacturer_id', profile.manufacturer_id);
      query = query.order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    if (isAdminLike(profile.role) && factoryId) {
      // Admin filtering by a specific factory — use inner join filter
      query = adminClient.from('orders').select(
        `id, customer_name, customer_email, customer_phone, recipient_name, recipient_phone, recipient_same_as_orderer, order_category, delivery_fee, created_at, paid_at, total_amount, order_status, payment_status, payment_method, shipping_method, country_code, postal_code, state, city, address_line_1, address_line_2, refund_reason, customer_note, attachment_urls, notes, original_amount, custom_unit_price, admin_discount, admin_surcharge, coupon_discount, applied_coupon_id, pricing_note, payment_link_token, share_token, partner_mall_id, partner_mall:partner_malls(id,name,slug), salesman_id, attributed_salesman:salesman_profiles!salesman_id(id,display_name,salesman_code), order_items!inner(id, purchase_order_status, design_title, assigned_manufacturer_id, factory_assigned_at, factory_status, factory_amount, deadline, factory_payment_date, factory_payment_status)` as string
      ).eq('order_items.assigned_manufacturer_id', factoryId).order('created_at', { ascending: false });
      if (orderId) {
        query = query.eq('id', orderId);
      }
    }

    if (status !== 'all') {
      if (isFactoryUser) {
        query = query.eq('order_items.factory_status', status);
      } else {
        query = query.eq('order_status', status);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Orders GET supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const regularOrders = data || [];
    const canIncludeNaver = includeNaver
      && !isFactoryUser
      && !factoryId
      && !orderId
      && !parentOrderId
      && !withMedia
      && status === 'all';

    if (!canIncludeNaver) {
      return NextResponse.json({ data: regularOrders });
    }

    // 네이버 주문은 기존 orders/order_items에 복제하지 않는다.
    // 이 읽기 전용 조회가 실패해도 기존 주문 목록은 반드시 정상 응답한다.
    const { data: naverRows, error: naverError } = await adminClient
      .from('naver_product_orders')
      .select('product_order_id, naver_order_id, product_order_status, claim_status, last_changed_type, last_changed_at, order_date, payment_date, origin_product_no, channel_product_no, product_name, option_name, option_manage_code, local_product_id, quantity, unit_price, total_payment_amount, buyer_name, buyer_tel, receiver_name, receiver_tel1, receiver_tel2, receiver_zip_code, receiver_base_address, receiver_detail_address, shipping_memo, delivery_method, delivery_company_code, tracking_number, dispatched_at, synced_at, updated_at')
      .order('last_changed_at', { ascending: false })
      .limit(1000);

    if (naverError) {
      console.error('Orders GET Naver projection error (regular orders returned):', naverError);
      return NextResponse.json({ data: regularOrders });
    }

    const naverOrderIds = [...new Set((naverRows || []).map((row) => row.naver_order_id).filter(Boolean))];
    const designByOrderId = new Map<string, { status: string; job_count: number; submitted_job_count: number }>();
    if (naverOrderIds.length > 0) {
      const { data: designRows, error: designError } = await adminClient
        .from('naver_design_sessions')
        .select('naver_order_id,status,job_count,submitted_job_count')
        .in('naver_order_id', naverOrderIds);
      if (designError) {
        console.error('Orders GET Naver design projection error (orders returned without design status):', designError);
      } else {
        (designRows || []).forEach((row) => designByOrderId.set(row.naver_order_id, row));
      }
    }

    const naverOrders = projectNaverOrdersForAdmin(naverRows || [], designByOrderId);
    return NextResponse.json({ data: [...regularOrders, ...naverOrders] });
  } catch (error) {
    console.error('Orders GET error:', error);
    const message = error instanceof Error ? error.message : '주문 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, manufacturer_id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 403 });
    }

    if (!profile || (!isBackofficeOperatorRole(profile.role))) {
      return NextResponse.json({ error: '권한이 필요합니다.' }, { status: 403 });
    }

    const isFactoryUser = profile.role === 'factory';

    const payload = await request.json().catch(() => null);
    const orderId = payload?.orderId;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    if (orderId.startsWith(NAVER_UNIFIED_ORDER_PREFIX)) {
      return NextResponse.json(
        { error: '네이버 주문 상태는 네이버 스마트스토어 관리 화면에서 처리해 주세요.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Factory users can update factory_status and factory_amount on their own items
    if (isFactoryUser) {
      const factoryStatusInput = payload?.factoryStatus;
      const factoryAmountInput = payload?.factoryAmount;
      const factoryUnitPriceInput = payload?.factoryUnitPrice;
      const factoryPriceModeInput = payload?.factoryPriceMode;
      const orderItemId = payload?.orderItemId;

      if (!factoryStatusInput && factoryAmountInput === undefined && factoryUnitPriceInput === undefined) {
        return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
      }

      if (factoryStatusInput) {
        const validFactoryStatuses = ['assigned', 'in_progress', 'completed', 'shipped'];
        if (!validFactoryStatuses.includes(factoryStatusInput)) {
          return NextResponse.json({ error: '유효하지 않은 공장 배정 상태입니다.' }, { status: 400 });
        }
      }

      // Verify this factory has items assigned in this order (+ 잠금 상태 확인)
      const { data: factoryItems, error: itemCheckError } = await adminClient
        .from('order_items')
        .select('id, assigned_manufacturer_id, factory_price_locked')
        .eq('order_id', orderId)
        .eq('assigned_manufacturer_id', profile.manufacturer_id);

      if (itemCheckError || !factoryItems || factoryItems.length === 0) {
        return NextResponse.json({ error: '이 주문에 대한 권한이 없습니다.' }, { status: 403 });
      }

      // 정산 확정(잠금) 판정 — 대상 품목 기준
      const targetItem = orderItemId ? factoryItems.find((i) => i.id === orderItemId) : null;
      const targetLocked = orderItemId
        ? !!targetItem?.factory_price_locked
        : factoryItems.every((i) => i.factory_price_locked);

      const wantsPriceChange =
        factoryAmountInput !== undefined || factoryUnitPriceInput !== undefined || factoryPriceModeInput !== undefined;

      // 잠금된 단가는 공장이 수정 불가 (관리자만 해제/수정)
      if (targetLocked && wantsPriceChange) {
        return NextResponse.json(
          { error: '관리자가 정산 확정한 단가입니다. 수정하려면 관리자에게 요청해 주세요.', code: 'FACTORY_PRICE_LOCKED' },
          { status: 403 }
        );
      }

      // 단가 확정 게이트: "작업중" 전환은 단가 확인을 거쳐야 한다.
      // 단, 이미 정산 확정(잠금)된 건은 확정값을 그대로 쓰므로 게이트 생략.
      const confirmFactoryPrice = payload?.confirmFactoryPrice === true;
      if (!targetLocked && factoryStatusInput === 'in_progress' && !confirmFactoryPrice) {
        return NextResponse.json(
          { error: '작업 시작 전 정산 단가를 확인해 주세요.', code: 'FACTORY_PRICE_REQUIRED' },
          { status: 400 }
        );
      }

      const itemUpdateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (factoryStatusInput) {
        itemUpdateData.factory_status = factoryStatusInput;
      }
      // 단가 관련 필드는 잠금 안 됐을 때만 반영 (잠금 시 상태 진행만 허용)
      if (!targetLocked) {
        if (factoryAmountInput !== undefined) {
          itemUpdateData.factory_amount = factoryAmountInput;
        }
        if (factoryUnitPriceInput !== undefined) {
          itemUpdateData.factory_unit_price = factoryUnitPriceInput;
        }
        if (factoryPriceModeInput !== undefined) {
          itemUpdateData.factory_price_mode = factoryPriceModeInput;
        }
        // 단가 확정 시각·주체 기록 (0원 의도 확정 vs 미입력 구분)
        if (confirmFactoryPrice) {
          itemUpdateData.factory_price_confirmed_at = new Date().toISOString();
          itemUpdateData.factory_price_confirmed_by = user.id;
        }
      }

      // Update specific item or all items assigned to this factory in this order
      let itemQuery = adminClient
        .from('order_items')
        .update(itemUpdateData)
        .eq('order_id', orderId)
        .eq('assigned_manufacturer_id', profile.manufacturer_id);

      if (orderItemId) {
        itemQuery = itemQuery.eq('id', orderItemId);
      }

      const { error: itemUpdateError } = await itemQuery;

      if (itemUpdateError) {
        return NextResponse.json({ error: itemUpdateError.message }, { status: 500 });
      }

      // Sync order-level status based on all items' factory statuses
      const { data: allItems } = await adminClient
        .from('order_items')
        .select('factory_status')
        .eq('order_id', orderId);

      const { data: existingOrder } = await adminClient
        .from('orders')
        .select('id, order_status, customer_name, customer_email, total_amount, payment_method')
        .eq('id', orderId)
        .single();

      if (existingOrder && allItems) {
        // 공장 출고완료(shipped 포함)여도 고객 order_status를 'shipping'으로 올리지 않는다.
        // 공장→본사 입고 케이스가 있어, 고객 '배송중'은 실제 택배 접수/송장 경로에서만 전환한다.
        // 이미 배송/완료/취소 단계면 택배 단계를 보존(downgrade 방지).
        const anyFactoryActivity = allItems.some((i) => ['assigned', 'in_progress', 'completed', 'shipped'].includes(i.factory_status || ''));
        const TERMINAL = ['shipping', 'delivered', 'cancelled', 'partially_cancelled'];
        let newOrderStatus: OrderStatus | null = null;
        if ((anyFactoryActivity || factoryStatusInput) && !TERMINAL.includes(existingOrder.order_status || '')) {
          newOrderStatus = 'in_production';
        }

        if (newOrderStatus && newOrderStatus !== existingOrder.order_status) {
          await adminClient.from('orders').update({ order_status: newOrderStatus, updated_at: new Date().toISOString() }).eq('id', orderId);

          if (existingOrder.customer_email) {
            const { data: orderItems } = await adminClient
              .from('order_items')
              .select('product_title, quantity, price_per_item')
              .eq('order_id', orderId);

            sendOrderStatusNotification({
              orderId,
              customerName: existingOrder.customer_name || '고객',
              customerEmail: existingOrder.customer_email,
              newStatus: newOrderStatus,
              previousStatus: existingOrder.order_status,
              items: orderItems?.map(i => ({ product_title: i.product_title, quantity: i.quantity, price_per_item: i.price_per_item })) || [],
              totalAmount: existingOrder.total_amount ?? undefined,
              paymentMethod: existingOrder.payment_method ?? undefined,
            }).catch((err) => console.error('Order status notification (factory) failed:', err));
          }
        }
      }

      // Return updated order with items
      const { data: updatedOrder } = await adminClient
        .from('orders')
        .select('*, order_items(id, design_title, thumbnail_url, assigned_manufacturer_id, factory_status, factory_amount, deadline, factory_payment_date, factory_payment_status)')
        .eq('id', orderId)
        .single();

      return NextResponse.json({ data: updatedOrder });
    }

    // 관리자: 공장 단가 정산 확정(잠금) / 해제 — 잠금되면 공장은 단가 수정 불가.
    if (payload?.lockFactoryPrice !== undefined && payload?.orderItemId) {
      const locked = payload.lockFactoryPrice === true;
      const { error: lockErr } = await adminClient
        .from('order_items')
        .update({
          factory_price_locked: locked,
          factory_price_locked_by: locked ? user.id : null,
          factory_price_locked_at: locked ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.orderItemId)
        .eq('order_id', orderId);
      if (lockErr) {
        return NextResponse.json({ error: lockErr.message }, { status: 500 });
      }
      return NextResponse.json({ data: { id: payload.orderItemId, factory_price_locked: locked } });
    }

    // Admin flow below
    const manufacturerId = payload?.factoryId ?? null;

    // Factory-specific fields
    const deadlineInput = payload?.deadline ?? null;
    const factoryAmountInput = payload?.factoryAmount ?? null;
    const factoryPaymentDateInput = payload?.factoryPaymentDate ?? null;
    const factoryPaymentStatusInput = payload?.factoryPaymentStatus ?? null;
    const orderStatusInput = payload?.orderStatus ?? null;
    const factoryStatusInput = payload?.factoryStatus ?? null;

    if (manufacturerId !== null && typeof manufacturerId !== 'string') {
      return NextResponse.json({ error: '공장 ID 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    // Validate order status
    const validOrderStatuses = ['payment_pending', 'payment_completed', 'in_production', 'shipping', 'delivered', 'cancelled', 'partially_cancelled'];
    if (orderStatusInput !== null && !validOrderStatuses.includes(orderStatusInput)) {
      return NextResponse.json({ error: '유효하지 않은 주문 상태입니다.' }, { status: 400 });
    }

    // Validate factory status
    const validFactoryStatuses = ['pending', 'assigned', 'in_progress', 'completed', 'shipped', 'cancelled'];
    if (factoryStatusInput !== null && !validFactoryStatuses.includes(factoryStatusInput)) {
      return NextResponse.json({ error: '유효하지 않은 공장 배정 상태입니다.' }, { status: 400 });
    }

    // Validate factory payment status
    const validPaymentStatuses = ['pending', 'completed', 'cancelled'];
    if (factoryPaymentStatusInput !== null && !validPaymentStatuses.includes(factoryPaymentStatusInput)) {
      return NextResponse.json({ error: '유효하지 않은 결제 상태입니다.' }, { status: 400 });
    }

    let manufacturerInfo: { id: string; name: string; email: string | null } | null = null;

    if (manufacturerId !== null) {
      const { data: manufacturer, error: manufacturerError } = await adminClient
        .from('manufacturers')
        .select('id, name, email')
        .eq('id', manufacturerId)
        .single();

      if (manufacturerError || !manufacturer) {
        return NextResponse.json({ error: '공장을 찾을 수 없습니다.' }, { status: 400 });
      }
      manufacturerInfo = manufacturer;
    }

    const { data: existingOrder } = await adminClient
      .from('orders')
      .select('customer_note, share_token, order_status, payment_status, customer_name, customer_email, customer_phone, recipient_name, recipient_phone, recipient_same_as_orderer, tracking_number, shipping_method, logen_registered_at')
      .eq('id', orderId)
      .single();

    // Handle payment_status update (manual payment confirmation)
    const paymentStatusInput = payload?.payment_status ?? null;
    if (paymentStatusInput !== null) {
      const validOrderPaymentStatuses = ['pending', 'completed', 'failed', 'refunded'];
      if (!validOrderPaymentStatuses.includes(paymentStatusInput)) {
        return NextResponse.json({ error: '유효하지 않은 결제 상태입니다.' }, { status: 400 });
      }
    }

    // Handle payment link generation for existing orders
    const generatePaymentLink = payload?.generate_payment_link === true;

    // Handle price adjustment
    const priceAdjustment = payload?.priceAdjustment ?? null;

    // Handle tracking number
    const trackingNumberInput = payload?.trackingNumber ?? null;
    const trackingCarrierInput = payload?.trackingCarrier ?? null;

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // 연락처·성함 정정 — 고객이 오타로 입력한 번호를 운영자가 고친다.
    // 개인정보 덮어쓰기라 사유를 필수로 받고 원본을 order_contact_changes 에 남긴다.
    // 공장 계정은 여기 닿지 않는다(위 isFactoryUser 분기에서 먼저 반환된다).
    const contactUpdateInput = payload?.contactUpdate ?? null;
    const contactChanges: { field: string; old_value: string | null; new_value: string | null }[] = [];
    let contactUpdateReason = '';

    if (contactUpdateInput !== null) {
      if (!isAdminLike(profile.role)) {
        return NextResponse.json({ error: '연락처 수정 권한이 없습니다.' }, { status: 403 });
      }
      if (typeof contactUpdateInput !== 'object') {
        return NextResponse.json({ error: '연락처 수정 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      if (!existingOrder) {
        return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
      }

      const reason = typeof contactUpdateInput.reason === 'string' ? contactUpdateInput.reason.trim() : '';
      if (!reason) {
        return NextResponse.json({ error: '수정 사유를 입력해주세요.' }, { status: 400 });
      }

      const existing = existingOrder as unknown as Record<string, unknown>;

      for (const field of ['customer_phone', 'recipient_phone'] as const) {
        if (!Object.prototype.hasOwnProperty.call(contactUpdateInput, field)) continue;
        const next = sanitizePhoneInput(String(contactUpdateInput[field] ?? ''));
        const label = field === 'customer_phone' ? '주문자 연락처' : '받는 분 연락처';
        const message = assertPhoneOrMessage(next, label);
        if (message) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        const prev = (existing[field] as string | null) ?? null;
        if (prev !== next) {
          updateData[field] = next;
          contactChanges.push({ field, old_value: prev, new_value: next });
        }
      }

      for (const field of ['customer_name', 'recipient_name'] as const) {
        if (!Object.prototype.hasOwnProperty.call(contactUpdateInput, field)) continue;
        const next = String(contactUpdateInput[field] ?? '').trim();
        if (!next) {
          return NextResponse.json({ error: '성함은 비워둘 수 없습니다.' }, { status: 400 });
        }
        const prev = (existing[field] as string | null) ?? null;
        if (prev !== next) {
          updateData[field] = next;
          contactChanges.push({ field, old_value: prev, new_value: next });
        }
      }

      if (contactChanges.length === 0) {
        return NextResponse.json({ error: '변경된 내용이 없습니다.' }, { status: 400 });
      }

      contactUpdateReason = reason;
    }

    if (Object.prototype.hasOwnProperty.call(payload ?? {}, 'salesman_id')) {
      const next = payload?.salesman_id;
      if (next !== null && typeof next !== 'string') {
        return NextResponse.json({ error: '영업사원 ID 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      if (next) {
        const { data: salesman, error: serr } = await adminClient
          .from('salesman_profiles')
          .select('id, status')
          .eq('id', next)
          .single();
        if (serr || !salesman) {
          return NextResponse.json({ error: '영업사원을 찾을 수 없습니다.' }, { status: 400 });
        }
      }
      updateData.salesman_id = next ?? null;
    }

    if (trackingNumberInput !== null) {
      updateData.tracking_number = trackingNumberInput;
    }
    if (trackingCarrierInput !== null) {
      updateData.tracking_carrier = trackingCarrierInput;
    }

    if (paymentStatusInput !== null) {
      updateData.payment_status = paymentStatusInput;
    }

    if (generatePaymentLink) {
      const newToken = randomBytes(16).toString('hex');
      updateData.payment_link_token = newToken;
    }

    if (priceAdjustment !== null && typeof priceAdjustment === 'object') {
      const { mode, value, note } = priceAdjustment as { mode: string; value?: number; note?: string };

      const { data: currentOrder } = await adminClient
        .from('orders')
        .select('total_amount, original_amount, delivery_fee, coupon_discount, admin_discount, admin_surcharge')
        .eq('id', orderId)
        .single();

      if (!currentOrder) {
        return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
      }

      const baseAmount = currentOrder.original_amount ?? currentOrder.total_amount;

      if (mode === 'reset') {
        updateData.admin_discount = 0;
        updateData.admin_surcharge = 0;
        updateData.total_amount = Math.max(0,
          baseAmount
          + (currentOrder.delivery_fee ?? 0)
          - (currentOrder.coupon_discount ?? 0)
        );
        updateData.pricing_note = note || null;
      } else if (mode === 'remove_discount') {
        const oldDiscount = currentOrder.admin_discount ?? 0;
        updateData.admin_discount = 0;
        updateData.total_amount = (currentOrder.total_amount ?? 0) + oldDiscount;
        if (note) updateData.pricing_note = note;
      } else if (mode === 'remove_surcharge') {
        const oldSurcharge = currentOrder.admin_surcharge ?? 0;
        updateData.admin_surcharge = 0;
        updateData.total_amount = Math.max(0, (currentOrder.total_amount ?? 0) - oldSurcharge);
        if (note) updateData.pricing_note = note;
      } else if (mode === 'update_discount') {
        if (typeof value !== 'number' || value < 0) {
          return NextResponse.json({ error: '유효하지 않은 금액입니다.' }, { status: 400 });
        }
        const oldDiscount = currentOrder.admin_discount ?? 0;
        updateData.admin_discount = value;
        updateData.total_amount = Math.max(0, (currentOrder.total_amount ?? 0) + oldDiscount - value);
        if (note) updateData.pricing_note = note;
      } else if (mode === 'update_surcharge') {
        if (typeof value !== 'number' || value < 0) {
          return NextResponse.json({ error: '유효하지 않은 금액입니다.' }, { status: 400 });
        }
        const oldSurcharge = currentOrder.admin_surcharge ?? 0;
        updateData.admin_surcharge = value;
        updateData.total_amount = Math.max(0, (currentOrder.total_amount ?? 0) - oldSurcharge + value);
        if (note) updateData.pricing_note = note;
      } else {
        if (typeof value !== 'number' || value < 0) {
          return NextResponse.json({ error: '유효하지 않은 금액입니다.' }, { status: 400 });
        }

        switch (mode) {
          case 'set_total':
            updateData.total_amount = value;
            if (!currentOrder.original_amount) {
              updateData.original_amount = currentOrder.total_amount;
            }
            if (value >= baseAmount) {
              updateData.admin_surcharge = value - baseAmount;
              updateData.admin_discount = 0;
            } else {
              updateData.admin_discount = baseAmount - value;
              updateData.admin_surcharge = 0;
            }
            break;
          case 'discount_fixed':
            updateData.total_amount = Math.max(0, baseAmount - value);
            if (!currentOrder.original_amount) {
              updateData.original_amount = currentOrder.total_amount;
            }
            updateData.admin_discount = value;
            updateData.admin_surcharge = 0;
            break;
          case 'discount_rate': {
            const discountAmount = Math.floor(baseAmount * (value / 100));
            updateData.total_amount = Math.max(0, baseAmount - discountAmount);
            if (!currentOrder.original_amount) {
              updateData.original_amount = currentOrder.total_amount;
            }
            updateData.admin_discount = discountAmount;
            updateData.admin_surcharge = 0;
            break;
          }
          case 'surcharge':
            updateData.total_amount = baseAmount + value;
            if (!currentOrder.original_amount) {
              updateData.original_amount = currentOrder.total_amount;
            }
            updateData.admin_surcharge = value;
            break;
          default:
            return NextResponse.json({ error: '유효하지 않은 조정 모드입니다.' }, { status: 400 });
        }

        if (note) {
          updateData.pricing_note = note;
        }
      }
    }

    // Factory-specific fields now go to order_items, not orders
    const hasFactoryItemUpdates = deadlineInput !== undefined || factoryAmountInput !== undefined ||
      factoryPaymentDateInput !== undefined || factoryPaymentStatusInput !== undefined ||
      factoryStatusInput !== null || manufacturerId !== null;

    if (hasFactoryItemUpdates) {
      const itemUpdateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (manufacturerId !== null) {
        itemUpdateData.assigned_manufacturer_id = manufacturerId;
        if (!factoryStatusInput) {
          itemUpdateData.factory_status = 'assigned';
        }
      }

      if (deadlineInput !== undefined) {
        if (deadlineInput) {
          const date = new Date(deadlineInput);
          itemUpdateData.deadline = isNaN(date.getTime()) ? null : date.toISOString();
        } else {
          itemUpdateData.deadline = null;
        }
      }
      if (factoryAmountInput !== undefined) {
        itemUpdateData.factory_amount = factoryAmountInput;
      }
      if (factoryPaymentDateInput !== undefined) {
        if (factoryPaymentDateInput) {
          const date = new Date(factoryPaymentDateInput);
          itemUpdateData.factory_payment_date = isNaN(date.getTime()) ? null : date.toISOString();
        } else {
          itemUpdateData.factory_payment_date = null;
        }
      }
      if (factoryPaymentStatusInput !== undefined) {
        itemUpdateData.factory_payment_status = factoryPaymentStatusInput;
      }
      if (factoryStatusInput !== null) {
        itemUpdateData.factory_status = factoryStatusInput;
      }

      // Update all order_items for this order
      await adminClient
        .from('order_items')
        .update(itemUpdateData)
        .eq('order_id', orderId);
    }

    // Handle order_status updates
    if (factoryStatusInput !== null) {
      if (orderStatusInput !== null) {
        updateData.order_status = orderStatusInput;
      } else {
        // 공장 상태(출고완료 포함)로는 고객 order_status를 'shipping'으로 올리지 않는다.
        // 실제 '배송중' 전환은 택배 접수/송장 경로(수동 송장입력·로젠 조회 등)에서만. 이미 배송/완료/취소면 보존.
        const TERMINAL = ['shipping', 'delivered', 'cancelled', 'partially_cancelled'];
        if (!TERMINAL.includes(existingOrder?.order_status || '')) {
          updateData.order_status = 'in_production';
        }
      }
    } else if (orderStatusInput !== null) {
      updateData.order_status = orderStatusInput;
    }

    const { data, error } = await adminClient
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 연락처 수정 이력 — orders 업데이트가 성공한 뒤에만 남긴다.
    // 이력 기록이 실패해도 수정 자체를 되돌리지는 않되, 로그로 남겨 추적 가능하게 한다.
    if (contactChanges.length > 0) {
      const { error: historyError } = await adminClient.from('order_contact_changes').insert(
        contactChanges.map((change) => ({
          order_id: orderId,
          field: change.field,
          old_value: change.old_value,
          new_value: change.new_value,
          reason: contactUpdateReason,
          changed_by: user.id,
          changed_by_email: user.email ?? null,
        }))
      );
      if (historyError) {
        console.error('[admin/orders] 연락처 수정 이력 기록 실패:', historyError, { orderId });
      }
    }

    // 수동 송장 입력(스마트로젠 등 API 외 경로) 시 택배비 원가 자동 기록
    // — order_profit_summary.internal_shipping_cost(손익 차감)에 반영
    if (
      trackingNumberInput &&
      !existingOrder?.tracking_number &&
      existingOrder?.shipping_method === 'domestic'
    ) {
      const { data: existingLeg } = await adminClient
        .from('order_shipping_legs')
        .select('id')
        .eq('order_id', orderId)
        .eq('leg_type', 'to_customer')
        .limit(1)
        .maybeSingle();
      if (!existingLeg) {
        await adminClient.from('order_shipping_legs').insert({
          order_id: orderId,
          leg_type: 'to_customer',
          amount: LOGEN_CONTRACT_FARE,
          carrier: (trackingCarrierInput as string) || 'logen',
          tracking_number: trackingNumberInput,
          note: '송장 수동 입력 시 자동 기록 (계약운임)',
        });
      }
    }

    // Factory assignment email is now handled by the factory-allocation API endpoint

    // Fetch order items for notification emails
    const resolvedOrderStatus = (updateData.order_status as string) ?? existingOrder?.order_status;
    const previousOrderStatus = existingOrder?.order_status;
    const previousPaymentStatus = existingOrder?.payment_status;

    const needsNotification =
      (resolvedOrderStatus && resolvedOrderStatus !== previousOrderStatus && existingOrder?.customer_email) ||
      (paymentStatusInput === 'completed' && previousPaymentStatus !== 'completed' && existingOrder?.customer_email);

    let notificationItems: { product_title: string; quantity: number; price_per_item: number }[] = [];
    if (needsNotification) {
      const { data: orderItems } = await adminClient
        .from('order_items')
        .select('product_title, quantity, price_per_item')
        .eq('order_id', orderId);
      notificationItems = orderItems?.map(i => ({ product_title: i.product_title, quantity: i.quantity, price_per_item: i.price_per_item })) || [];
    }

    // Send order status change notification to customer
    if (resolvedOrderStatus && resolvedOrderStatus !== previousOrderStatus && existingOrder?.customer_email) {
      const trackingNumber = payload?.trackingNumber ?? null;
      sendOrderStatusNotification({
        orderId,
        customerName: existingOrder.customer_name || '고객',
        customerEmail: existingOrder.customer_email,
        newStatus: resolvedOrderStatus as OrderStatus,
        previousStatus: previousOrderStatus,
        trackingNumber,
        items: notificationItems,
        totalAmount: data?.total_amount ?? undefined,
        paymentMethod: data?.payment_method ?? undefined,
      }).catch((err) => console.error('Order status notification failed:', err));
    }

    // Payment confirmation notification (bank transfer)
    if (paymentStatusInput === 'completed' && previousPaymentStatus !== 'completed' && existingOrder?.customer_email) {
      const effectiveOrderStatus = ((updateData.order_status as string) ?? 'payment_completed') as OrderStatus;
      sendOrderStatusNotification({
        orderId,
        customerName: existingOrder.customer_name || '고객',
        customerEmail: existingOrder.customer_email,
        newStatus: effectiveOrderStatus,
        previousStatus: previousOrderStatus,
        items: notificationItems,
        totalAmount: data?.total_amount ?? undefined,
        paymentMethod: data?.payment_method ?? undefined,
      }).catch((err) => console.error('Payment confirmation notification failed:', err));
    }

    // Re-fetch order with items to include factory fields
    const { data: finalOrder } = await adminClient
      .from('orders')
      .select('*, order_items(id, purchase_order_status, design_title, assigned_manufacturer_id, factory_status, factory_amount, deadline, factory_payment_date, factory_payment_status)')
      .eq('id', orderId)
      .single();

    return NextResponse.json({ data: finalOrder || data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '주문 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 403 });
    }
    if (!profile || !isSuperAdmin(profile.role)) {
      return NextResponse.json({ error: '슈퍼 관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const queryOrderId = url.searchParams.get('orderId');
    const body = await request.json().catch(() => null);
    const orderId = (body?.orderId as string | undefined) ?? queryOrderId ?? null;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const confirmPaidOrder = body?.confirmPaidOrder === true;

    if (!orderId) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }
    if (reason.length < 5) {
      return NextResponse.json({ error: '삭제 사유를 5자 이상 입력하세요.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: existingOrder, error: fetchError } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !existingOrder) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (
      existingOrder.payment_status === 'completed' &&
      !confirmPaidOrder
    ) {
      return NextResponse.json(
        {
          error:
            '결제 완료 주문입니다. 환불 후 삭제하거나 confirmPaidOrder 플래그를 보내세요.',
        },
        { status: 409 },
      );
    }

    const { data: existingItems } = await adminClient
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    const { error: logError } = await adminClient.from('order_deletion_logs').insert({
      order_id: orderId,
      deleted_by: user.id,
      reason,
      snapshot: {
        order: existingOrder,
        order_items: existingItems ?? [],
      },
    });

    if (logError) {
      return NextResponse.json(
        { error: `감사 로그 기록 실패: ${logError.message}` },
        { status: 500 },
      );
    }

    const { error: couponError } = await adminClient
      .from('coupon_usages')
      .update({ order_id: null, used_at: null })
      .eq('order_id', orderId);

    if (couponError) {
      console.error('coupon_usages 정리 실패:', couponError);
    }

    const { error: itemsError } = await adminClient
      .from('order_items')
      .delete()
      .eq('order_id', orderId);

    if (itemsError) {
      return NextResponse.json(
        { error: `주문 항목 삭제 실패: ${itemsError.message}` },
        { status: 500 },
      );
    }

    const { error: deleteError } = await adminClient
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (deleteError) {
      return NextResponse.json(
        { error: `주문 삭제 실패: ${deleteError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: { orderId, deleted: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '주문 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
