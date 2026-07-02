import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { resolveColorByHex } from '@/lib/colorLookup';
import { randomBytes } from 'crypto';
import { getKstYYYYMMDD } from '@/lib/kst';
import { getRemoteAreaSurcharge } from '@/lib/remoteAreaShipping';

interface CreateOrderVariant {
  sizeLabel: string;
  sizeCode: string;
  quantity: number;
}

type PaymentType = 'completed' | 'bank_transfer' | 'customer_payment';

interface CreateOrderItemInput {
  designId?: string;            // 간이 이미지 항목은 디자인이 없으므로 optional
  productId: string;
  variants: CreateOrderVariant[];
  pricingMode?: 'auto' | 'custom_unit_price';
  customUnitPrice?: number;
  designTitle?: string;
  quickImage?: boolean;         // 간이 이미지 주문 항목 (디자인 없이 이미지+단가로 생성, 목업은 나중에)
  thumbnailUrl?: string;        // 간이 이미지 항목의 이미지 URL
  inheritFromOrderItemId?: string; // 차액 수량추가: 원주문 품목의 디자인/목업을 그대로 승계해 N개 더 제작
}

interface CreateOrderRequest {
  // Multi-item format
  items?: CreateOrderItemInput[];
  // Legacy single-item format (backward compat)
  designId?: string;
  productId?: string;
  variants?: CreateOrderVariant[];
  // Shared fields
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  inquiryId?: string;           // 문의에서 만든 간이주문이면 연결
  parentOrderId?: string;       // 차액(추가결제) 주문이면 원주문 id 연결 → order_category='surcharge'
  shippingMethod?: 'pickup' | 'domestic';
  deliveryFee?: number;
  postalCode?: string;
  state?: string;
  city?: string;
  addressLine1?: string;
  addressLine2?: string;
  // Order-level pricing
  pricingMode?: 'auto' | 'custom_unit_price' | 'custom_total';
  customUnitPrice?: number;
  customTotalPrice?: number;
  couponCode?: string;
  couponId?: string;
  couponDiscount?: number;
  adminDiscount?: number;
  adminDiscountType?: 'fixed' | 'percentage';
  adminSurcharge?: number;
  pricingNote?: string;
  paymentType?: PaymentType;
  customerEditableFields?: {
    quantities?: boolean;
    customerInfo?: boolean;
    shipping?: boolean;
  };
}

const requireAdmin = async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  }

  if (!user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  }

  if (!profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
};

const buildOrderId = () => {
  const ymd = getKstYYYYMMDD();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORDER-${ymd}-${random}`;
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeJson = <T,>(value: T | string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

const resolveProductColor = (colorSelections: Record<string, unknown>): string | null => {
  if (!colorSelections || typeof colorSelections !== 'object') return null;
  if (typeof colorSelections.productColor === 'string') return colorSelections.productColor;
  if (typeof colorSelections.body === 'string') return colorSelections.body;
  const front = colorSelections.front as Record<string, unknown> | undefined;
  if (front && typeof front.body === 'string') {
    return front.body;
  }
  return null;
};

function getBaseUrl(): string {
  return 'https://modoouniform.com';
}

function normalizeItems(payload: CreateOrderRequest): CreateOrderItemInput[] | null {
  if (payload.items && Array.isArray(payload.items) && payload.items.length > 0) {
    return payload.items;
  }
  // Legacy single-item format
  if (payload.designId && payload.productId && payload.variants) {
    return [{
      designId: payload.designId,
      productId: payload.productId,
      variants: payload.variants,
      pricingMode: (payload.pricingMode === 'custom_unit_price' ? 'custom_unit_price' : 'auto') as 'auto' | 'custom_unit_price',
      customUnitPrice: payload.customUnitPrice,
    }];
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null) as CreateOrderRequest | null;

    if (!payload) {
      return NextResponse.json({ error: '요청 데이터가 올바르지 않습니다.' }, { status: 400 });
    }

    const { customerName, customerEmail, customerPhone, notes, customerEditableFields } = payload;
    const ceq = !!customerEditableFields?.quantities;

    if (!customerEditableFields?.customerInfo && (!customerName || typeof customerName !== 'string')) {
      return NextResponse.json({ error: '고객 이름이 필요합니다.' }, { status: 400 });
    }

    if (!customerEditableFields?.customerInfo && (!customerEmail || typeof customerEmail !== 'string')) {
      return NextResponse.json({ error: '고객 이메일이 필요합니다.' }, { status: 400 });
    }

    const orderItems = normalizeItems(payload);
    if (!orderItems || orderItems.length === 0) {
      return NextResponse.json({ error: '최소 하나의 제품이 필요합니다.' }, { status: 400 });
    }

    for (const item of orderItems) {
      if (item.quickImage) {
        if (!item.thumbnailUrl || typeof item.thumbnailUrl !== 'string') {
          return NextResponse.json({ error: '간이 주문에는 이미지가 필요합니다.' }, { status: 400 });
        }
      } else if (item.inheritFromOrderItemId) {
        // 차액 수량추가: 원주문 품목에서 디자인을 승계하므로 designId 불필요
        if (typeof item.inheritFromOrderItemId !== 'string') {
          return NextResponse.json({ error: '승계할 원주문 품목 정보가 올바르지 않습니다.' }, { status: 400 });
        }
      } else if (!item.designId || typeof item.designId !== 'string') {
        return NextResponse.json({ error: '디자인 ID가 필요합니다.' }, { status: 400 });
      }
      if (!item.productId || typeof item.productId !== 'string') {
        return NextResponse.json({ error: '제품 ID가 필요합니다.' }, { status: 400 });
      }
      if (!item.variants || !Array.isArray(item.variants) || item.variants.length === 0) {
        return NextResponse.json({ error: '최소 하나의 사이즈/수량을 선택해주세요.' }, { status: 400 });
      }
      if (!ceq) {
        const itemQty = item.variants.reduce((sum, v) => sum + (v.quantity || 0), 0);
        if (itemQty <= 0) {
          return NextResponse.json({ error: '총 수량은 1개 이상이어야 합니다.' }, { status: 400 });
        }
      }
    }

    const adminClient = createAdminClient();

    // Fetch all designs and products for all items (간이 이미지·차액승계 항목은 디자인 조회 제외)
    const designIds = orderItems.filter(i => !i.quickImage && !i.inheritFromOrderItemId && i.designId).map(i => i.designId as string);
    const productIds = [...new Set(orderItems.map(i => i.productId))];

    // 차액 수량추가(inherit): 원주문 품목을 그대로 복제하기 위해 조회
    const inheritIds = [...new Set(orderItems.filter(i => i.inheritFromOrderItemId).map(i => i.inheritFromOrderItemId as string))];
    const inheritMap = new Map<string, Record<string, unknown>>();
    if (inheritIds.length > 0) {
      const { data: parentItems, error: parentItemsError } = await adminClient
        .from('order_items')
        .select('id, product_id, design_id, product_title, design_title, canvas_state, color_selections, thumbnail_url, image_urls, text_svg_exports, custom_fonts, price_per_item')
        .in('id', inheritIds);
      if (parentItemsError || !parentItems || parentItems.length !== inheritIds.length) {
        return NextResponse.json({ error: '승계할 원주문 품목을 찾을 수 없습니다.' }, { status: 404 });
      }
      for (const p of parentItems) inheritMap.set(p.id as string, p as Record<string, unknown>);
    }

    const { data: designs, error: designsError } = await adminClient
      .from('saved_designs')
      .select('id, product_id, title, canvas_state, color_selections, preview_url, price_per_item, image_urls, text_svg_exports, custom_fonts')
      .in('id', designIds);

    if (designsError || !designs) {
      return NextResponse.json({ error: designsError?.message || '디자인을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: products, error: productsError } = await adminClient
      .from('products')
      .select('id, title, base_price, size_options')
      .in('id', productIds);

    if (productsError || !products) {
      return NextResponse.json({ error: productsError?.message || '제품을 찾을 수 없습니다.' }, { status: 404 });
    }

    const designMap = new Map(designs.map(d => [d.id, d]));
    const productMap = new Map(products.map(p => [p.id, p]));

    // Build order_items payloads and calculate totals
    interface ProcessedItem {
      payload: Record<string, unknown>;
      unitPrice: number;
      quantity: number;
      subtotal: number;
    }

    const processedItems: ProcessedItem[] = [];
    let grandTotalQuantity = 0;
    let grandOriginalAmount = 0;

    for (const item of orderItems) {
      const product = productMap.get(item.productId);
      if (!product) {
        return NextResponse.json({ error: `제품을 찾을 수 없습니다: ${item.productId}` }, { status: 404 });
      }

      // 간이 이미지 / 차액승계(inherit) / 디자인 항목 분기. 디자인 항목 처리는 기존 동작 그대로 유지.
      const isQuick = item.quickImage === true;
      const isInherit = !!item.inheritFromOrderItemId;
      const parentItem = isInherit ? inheritMap.get(item.inheritFromOrderItemId as string) : undefined;
      const design = (isQuick || isInherit) ? undefined : designMap.get(item.designId as string);
      if (!isQuick && !isInherit) {
        if (!design) {
          return NextResponse.json({ error: `디자인을 찾을 수 없습니다: ${item.designId}` }, { status: 404 });
        }
        if (design.product_id !== item.productId) {
          return NextResponse.json({ error: `디자인과 제품이 일치하지 않습니다: ${product.title}` }, { status: 400 });
        }
      }

      // Per-item pricing
      let unitPrice: number;
      if (item.pricingMode === 'custom_unit_price' && item.customUnitPrice != null && item.customUnitPrice > 0) {
        unitPrice = item.customUnitPrice;
      } else if (design) {
        const designPrice = toNumber(design.price_per_item);
        unitPrice = designPrice > 0 ? designPrice : toNumber(product.base_price);
      } else if (isInherit && parentItem) {
        // 승계: 원주문 동일 품목 단가를 기본값으로
        const parentPrice = toNumber(parentItem.price_per_item);
        unitPrice = parentPrice > 0 ? parentPrice : toNumber(product.base_price);
      } else {
        unitPrice = toNumber(product.base_price);
      }

      const itemQuantity = item.variants.reduce((sum, v) => sum + (v.quantity || 0), 0);
      const itemSubtotal = unitPrice * itemQuantity;

      grandTotalQuantity += itemQuantity;
      grandOriginalAmount += itemSubtotal;

      const colorSelections = design
        ? normalizeJson<Record<string, unknown>>(design.color_selections ?? null, {})
        : (isInherit && parentItem ? normalizeJson<Record<string, unknown>>((parentItem.color_selections as Record<string, unknown> | string | null) ?? null, {}) : {});
      const canvasState = design
        ? normalizeJson<Record<string, unknown>>(design.canvas_state ?? null, {})
        : (isInherit && parentItem ? normalizeJson<Record<string, unknown>>((parentItem.canvas_state as Record<string, unknown> | string | null) ?? null, {}) : {});
      const productColor = resolveProductColor(colorSelections);
      // hex → 색상명/코드 조회 (발주서에 색상명이 표시되도록 고객앱 주문과 동일한 형태로 저장)
      const resolvedColor = await resolveColorByHex(adminClient, item.productId, productColor);

      const usedVariantIds = new Set<string>();
      const orderVariants = (ceq ? item.variants : item.variants.filter(v => v.quantity > 0))
        .map((variant, idx) => {
          let sid = (variant.sizeCode || '').trim();
          if (!sid || usedVariantIds.has(sid)) {
            const labelKey = (variant.sizeLabel || '').trim() || `size`;
            sid = `${labelKey}-${idx}`;
            let suffix = idx;
            while (usedVariantIds.has(sid)) {
              suffix += 1;
              sid = `${labelKey}-${suffix}`;
            }
          }
          usedVariantIds.add(sid);
          return {
            size_id: sid,
            size_name: variant.sizeLabel,
            quantity: variant.quantity,
            color_hex: productColor || undefined,
            color_id: productColor || undefined,
            color_name: resolvedColor?.color_name,
            color_code: resolvedColor?.color_code,
          };
        });

      const itemOptions: Record<string, unknown> = { variants: orderVariants };
      if (orderVariants.length === 1) {
        const [single] = orderVariants;
        itemOptions.size_id = single.size_id;
        itemOptions.size_name = single.size_name;
        if (single.color_hex) itemOptions.color_hex = single.color_hex;
        if (single.color_name) itemOptions.color_name = single.color_name;
        if (single.color_code) itemOptions.color_code = single.color_code;
      }

      // 디자인명: admin이 직접 입력했으면 그것을, 아니면 저장된 디자인의 title을 스냅샷.
      // (공장·관리자가 주문 구분에 쓰는 라벨이라 의미있는 값 필수)
      const designTitleOverride =
        typeof item.designTitle === 'string' && item.designTitle.trim()
          ? item.designTitle.trim()
          : null;
      const designTitleSnapshot = designTitleOverride
        ?? (design ? (design.title || null)
          : (isInherit && parentItem ? ((parentItem.design_title as string) || null)
            : (product.title || '간이주문')));

      processedItems.push({
        payload: {
          product_id: item.productId,
          design_id: design ? item.designId : (isInherit && parentItem ? (parentItem.design_id ?? null) : null),
          product_title: product.title || 'Product',
          design_title: designTitleSnapshot,
          quantity: itemQuantity,
          price_per_item: unitPrice,
          canvas_state: canvasState,
          color_selections: colorSelections,
          item_options: itemOptions,
          thumbnail_url: design ? (design.preview_url || null) : (isInherit && parentItem ? (parentItem.thumbnail_url ?? null) : (item.thumbnailUrl || null)),
          image_urls: design ? (design.image_urls || null) : (isInherit && parentItem ? (parentItem.image_urls ?? null) : null),
          text_svg_exports: design ? (design.text_svg_exports || null) : (isInherit && parentItem ? (parentItem.text_svg_exports ?? null) : null),
          custom_fonts: design ? (design.custom_fonts || null) : (isInherit && parentItem ? (parentItem.custom_fonts ?? null) : null),
          // 승계 항목은 디자인이 이미 완성돼 있으므로 production_ready=true → 발주/공장 배정 정상 진입
          production_ready: isInherit ? true : (isQuick ? false : true),
        },
        unitPrice,
        quantity: itemQuantity,
        subtotal: itemSubtotal,
      });
    }

    // Order-level pricing
    const orderPricingMode = payload.pricingMode || 'auto';
    const paymentType: PaymentType = payload.paymentType || 'completed';
    const originalAmount = grandOriginalAmount;
    // 제주·도서산간 추가 택배비(고객 부담). 클라가 deliveryFee를 명시하면 이미 할증 포함분이므로 그대로 사용,
    // 미명시 시 fallback에 base + 할증을 함께 반영한다(이중가산 방지).
    const remoteSurcharge = getRemoteAreaSurcharge(payload.postalCode, payload.shippingMethod);
    const deliveryFee = payload.deliveryFee ?? ((payload.shippingMethod === 'domestic' ? 3000 : 0) + remoteSurcharge);
    let couponDiscount = 0;
    let adminDiscount = 0;
    let adminSurcharge = 0;
    let totalAmount: number;

    if (orderPricingMode === 'custom_total' && payload.customTotalPrice != null && payload.customTotalPrice > 0) {
      totalAmount = payload.customTotalPrice;
      const diff = totalAmount - originalAmount;
      if (diff > 0) {
        adminSurcharge = diff;
      } else if (diff < 0) {
        adminDiscount = Math.abs(diff);
      }
    } else {
      couponDiscount = Math.max(0, toNumber(payload.couponDiscount));

      if (payload.adminDiscount && payload.adminDiscount > 0) {
        if (payload.adminDiscountType === 'percentage') {
          adminDiscount = Math.floor(originalAmount * (payload.adminDiscount / 100));
        } else {
          adminDiscount = payload.adminDiscount;
        }
      }

      adminSurcharge = Math.max(0, toNumber(payload.adminSurcharge));
      totalAmount = Math.max(0, originalAmount + deliveryFee - couponDiscount - adminDiscount + adminSurcharge);
    }

    const orderId = buildOrderId();
    const hasQuickItem = orderItems.some((i) => i.quickImage === true);
    const isSurcharge = typeof payload.parentOrderId === 'string' && payload.parentOrderId.length > 0;

    // 차액(추가결제) 주문이면 원주문 검증 + 문의 연결 상속
    let surchargeInquiryId: string | null = null;
    if (isSurcharge) {
      const { data: parentOrder, error: parentErr } = await adminClient
        .from('orders')
        .select('id, inquiry_id')
        .eq('id', payload.parentOrderId as string)
        .single();
      if (parentErr || !parentOrder) {
        return NextResponse.json({ error: '원주문을 찾을 수 없습니다.' }, { status: 404 });
      }
      surchargeInquiryId = parentOrder.inquiry_id ?? null;
    }

    // Payment method/status
    let paymentMethod: string;
    let paymentStatus: string;
    let orderStatus: string;
    let paymentLinkToken: string | null = null;

    switch (paymentType) {
      case 'bank_transfer':
        paymentMethod = 'bank_transfer';
        paymentStatus = 'pending';
        orderStatus = 'payment_pending';
        break;
      case 'customer_payment':
        paymentMethod = 'toss';
        paymentStatus = 'pending';
        orderStatus = 'payment_pending';
        paymentLinkToken = randomBytes(16).toString('hex');
        break;
      case 'completed':
      default:
        paymentMethod = 'admin';
        paymentStatus = 'completed';
        orderStatus = 'payment_completed';
        break;
    }

    const orderPayload: Record<string, unknown> = {
      id: orderId,
      user_id: null,
      order_category: isSurcharge ? 'surcharge' : (hasQuickItem ? 'quick' : 'regular'),
      parent_order_id: isSurcharge ? payload.parentOrderId : null,
      cobuy_session_id: null,
      inquiry_id: payload.inquiryId || surchargeInquiryId || null,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      shipping_method: payload.shippingMethod || 'pickup',
      country_code: payload.shippingMethod === 'domestic' ? 'KR' : null,
      state: payload.state || null,
      city: payload.city || null,
      postal_code: payload.postalCode || null,
      address_line_1: payload.addressLine1 || null,
      address_line_2: payload.addressLine2 || null,
      delivery_fee: deliveryFee,
      payment_method: paymentMethod,
      payment_key: null,
      payment_status: paymentStatus,
      order_status: orderStatus,
      total_amount: totalAmount,
      notes: notes || null,
      original_amount: originalAmount,
      custom_unit_price: null,
      admin_discount: adminDiscount,
      admin_surcharge: adminSurcharge,
      coupon_discount: couponDiscount,
      applied_coupon_id: payload.couponId || null,
      pricing_note: payload.pricingNote || null,
      payment_link_token: paymentLinkToken,
      customer_editable_fields: customerEditableFields || null,
    };

    const { error: orderError } = await adminClient
      .from('orders')
      .insert(orderPayload);

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    // Insert all order items
    const orderItemPayloads = processedItems.map(item => ({
      ...item.payload,
      order_id: orderId,
    }));

    const { error: orderItemsError } = await adminClient
      .from('order_items')
      .insert(orderItemPayloads);

    if (orderItemsError) {
      await adminClient.from('orders').delete().eq('id', orderId);
      return NextResponse.json({ error: orderItemsError.message }, { status: 500 });
    }

    // Increment coupon current_uses when a coupon is applied to admin order
    if (payload.couponId && couponDiscount > 0) {
      try {
        const { data: coupon } = await adminClient
          .from('coupons')
          .select('current_uses')
          .eq('id', payload.couponId)
          .single();

        if (coupon) {
          await adminClient
            .from('coupons')
            .update({
              current_uses: (coupon.current_uses || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', payload.couponId);
        }
      } catch (couponError) {
        console.error('Error incrementing coupon current_uses:', couponError);
      }
    }

    let paymentLinkUrl: string | null = null;
    if (paymentLinkToken) {
      paymentLinkUrl = `${getBaseUrl()}/order/custom/${paymentLinkToken}`;
    }

    return NextResponse.json({
      data: {
        orderId,
        totalAmount,
        originalAmount,
        totalQuantity: grandTotalQuantity,
        paymentType,
        paymentLinkToken,
        paymentLinkUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '주문 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
