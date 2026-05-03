import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';
import { getKstYYYYMMDD } from '@/lib/kst';

interface CreateOrderVariant {
  sizeLabel: string;
  sizeCode: string;
  quantity: number;
}

type PaymentType = 'completed' | 'bank_transfer' | 'customer_payment';

interface CreateOrderItemInput {
  designId: string;
  productId: string;
  variants: CreateOrderVariant[];
  pricingMode?: 'auto' | 'custom_unit_price';
  customUnitPrice?: number;
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
      if (!item.designId || typeof item.designId !== 'string') {
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

    // Fetch all designs and products for all items
    const designIds = orderItems.map(i => i.designId);
    const productIds = [...new Set(orderItems.map(i => i.productId))];

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
      const design = designMap.get(item.designId);
      if (!design) {
        return NextResponse.json({ error: `디자인을 찾을 수 없습니다: ${item.designId}` }, { status: 404 });
      }
      const product = productMap.get(item.productId);
      if (!product) {
        return NextResponse.json({ error: `제품을 찾을 수 없습니다: ${item.productId}` }, { status: 404 });
      }
      if (design.product_id !== item.productId) {
        return NextResponse.json({ error: `디자인과 제품이 일치하지 않습니다: ${product.title}` }, { status: 400 });
      }

      // Per-item pricing
      let unitPrice: number;
      if (item.pricingMode === 'custom_unit_price' && item.customUnitPrice != null && item.customUnitPrice > 0) {
        unitPrice = item.customUnitPrice;
      } else {
        const designPrice = toNumber(design.price_per_item);
        unitPrice = designPrice > 0 ? designPrice : toNumber(product.base_price);
      }

      const itemQuantity = item.variants.reduce((sum, v) => sum + (v.quantity || 0), 0);
      const itemSubtotal = unitPrice * itemQuantity;

      grandTotalQuantity += itemQuantity;
      grandOriginalAmount += itemSubtotal;

      const colorSelections = normalizeJson<Record<string, unknown>>(design.color_selections ?? null, {});
      const canvasState = normalizeJson<Record<string, unknown>>(design.canvas_state ?? null, {});
      const productColor = resolveProductColor(colorSelections);

      const orderVariants = (ceq ? item.variants : item.variants.filter(v => v.quantity > 0))
        .map(variant => ({
          size_id: variant.sizeCode,
          size_name: variant.sizeLabel,
          quantity: variant.quantity,
          color_hex: productColor || undefined,
        }));

      const itemOptions: Record<string, unknown> = { variants: orderVariants };
      if (orderVariants.length === 1) {
        const [single] = orderVariants;
        itemOptions.size_id = single.size_id;
        itemOptions.size_name = single.size_name;
        if (single.color_hex) itemOptions.color_hex = single.color_hex;
      }

      processedItems.push({
        payload: {
          product_id: item.productId,
          design_id: item.designId,
          product_title: product.title || 'Product',
          quantity: itemQuantity,
          price_per_item: unitPrice,
          canvas_state: canvasState,
          color_selections: colorSelections,
          item_options: itemOptions,
          thumbnail_url: design.preview_url || null,
          image_urls: design.image_urls || null,
          text_svg_exports: design.text_svg_exports || null,
          custom_fonts: design.custom_fonts || null,
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
    const deliveryFee = payload.deliveryFee ?? (payload.shippingMethod === 'domestic' ? 3000 : 0);
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
      order_category: 'regular',
      cobuy_session_id: null,
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
