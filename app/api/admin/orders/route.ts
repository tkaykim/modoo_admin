import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendFactoryAssignmentEmail } from '@/lib/gmail';
import { sendOrderStatusNotification, type OrderStatus } from '@/lib/notifications/order-status';
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

    const adminClient = createAdminClient();

    // Factory users: sort by deadline (마감일), Admin users: sort by created_at
    const isFactoryUser = profile.role === 'factory';

    // Factory fields are now on order_items, include them in the join
    const selectFields = isFactoryUser
      ? `id, order_category, order_status, customer_note, attachment_urls, created_at, order_items!inner(id, design_title, thumbnail_url, assigned_manufacturer_id, factory_status, factory_amount, deadline, factory_payment_date, factory_payment_status)`
      : `id, customer_name, customer_email, customer_phone, order_category, delivery_fee, created_at, total_amount, order_status, payment_status, payment_method, shipping_method, country_code, postal_code, state, city, address_line_1, address_line_2, tracking_number, tracking_carrier, logen_registered_at, logen_slip_printed, refund_reason, customer_note, attachment_urls, notes, original_amount, custom_unit_price, admin_discount, admin_surcharge, coupon_discount, applied_coupon_id, pricing_note, payment_link_token, share_token, order_items(id, purchase_order_status, design_title, assigned_manufacturer_id, factory_status, factory_amount, deadline, factory_payment_date, factory_payment_status)`;

    let query = adminClient.from('orders').select(selectFields as string);

    if (orderId) {
      query = query.eq('id', orderId);
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
        `id, customer_name, customer_email, customer_phone, order_category, delivery_fee, created_at, total_amount, order_status, payment_status, payment_method, shipping_method, country_code, postal_code, state, city, address_line_1, address_line_2, refund_reason, customer_note, attachment_urls, notes, original_amount, custom_unit_price, admin_discount, admin_surcharge, coupon_discount, applied_coupon_id, pricing_note, payment_link_token, share_token, order_items!inner(id, purchase_order_status, design_title, assigned_manufacturer_id, factory_status, factory_amount, deadline, factory_payment_date, factory_payment_status)` as string
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

    return NextResponse.json({ data: data || [] });
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

    const adminClient = createAdminClient();

    // Factory users can update factory_status and factory_amount on their own items
    if (isFactoryUser) {
      const factoryStatusInput = payload?.factoryStatus;
      const factoryAmountInput = payload?.factoryAmount;
      const orderItemId = payload?.orderItemId;

      if (!factoryStatusInput && factoryAmountInput === undefined) {
        return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
      }

      if (factoryStatusInput) {
        const validFactoryStatuses = ['assigned', 'in_progress', 'completed', 'shipped'];
        if (!validFactoryStatuses.includes(factoryStatusInput)) {
          return NextResponse.json({ error: '유효하지 않은 공장 배정 상태입니다.' }, { status: 400 });
        }
      }

      // Verify this factory has items assigned in this order
      const { data: factoryItems, error: itemCheckError } = await adminClient
        .from('order_items')
        .select('id, assigned_manufacturer_id')
        .eq('order_id', orderId)
        .eq('assigned_manufacturer_id', profile.manufacturer_id);

      if (itemCheckError || !factoryItems || factoryItems.length === 0) {
        return NextResponse.json({ error: '이 주문에 대한 권한이 없습니다.' }, { status: 403 });
      }

      const itemUpdateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (factoryStatusInput) {
        itemUpdateData.factory_status = factoryStatusInput;
      }
      if (factoryAmountInput !== undefined) {
        itemUpdateData.factory_amount = factoryAmountInput;
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
        const allShipped = allItems.every((i) => i.factory_status === 'shipped');
        const anyInProgress = allItems.some((i) => ['assigned', 'in_progress', 'completed'].includes(i.factory_status || ''));
        let newOrderStatus: string | null = null;
        if (allShipped) {
          newOrderStatus = 'shipping';
        } else if (anyInProgress || factoryStatusInput) {
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
              newStatus: newOrderStatus as any,
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
      .select('customer_note, share_token, order_status, payment_status, customer_name, customer_email')
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
        if (factoryStatusInput === 'shipped') {
          updateData.order_status = 'shipping';
        } else if (['assigned', 'in_progress', 'completed'].includes(factoryStatusInput)) {
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
