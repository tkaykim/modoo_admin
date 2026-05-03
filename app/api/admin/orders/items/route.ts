import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

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
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
};

const resolveProductColor = (colorSelections: Record<string, unknown>): string | null => {
  if (!colorSelections || typeof colorSelections !== 'object') return null;
  if (typeof colorSelections.productColor === 'string') return colorSelections.productColor;
  if (typeof colorSelections.body === 'string') return colorSelections.body;
  const front = colorSelections.front as Record<string, unknown> | undefined;
  if (front && typeof front.body === 'string') return front.body;
  return null;
};

const requireAdmin = async () => {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profileError) return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  if (!profile || (!isAdminLike(profile.role))) return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  return { user };
};

async function recalcOrderTotals(adminClient: ReturnType<typeof createAdminClient>, orderId: string) {
  const { data: items } = await adminClient
    .from('order_items')
    .select('price_per_item, quantity')
    .eq('order_id', orderId);

  const newOriginalAmount = (items || []).reduce((sum, i) => sum + i.price_per_item * i.quantity, 0);

  const { data: order } = await adminClient
    .from('orders')
    .select('delivery_fee, coupon_discount, admin_discount, admin_surcharge')
    .eq('id', orderId)
    .single();

  const newTotalAmount = Math.max(0,
    newOriginalAmount
    + (order?.delivery_fee ?? 0)
    - (order?.coupon_discount ?? 0)
    - (order?.admin_discount ?? 0)
    + (order?.admin_surcharge ?? 0)
  );

  await adminClient
    .from('orders')
    .update({ original_amount: newOriginalAmount, total_amount: newTotalAmount, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  return { newOriginalAmount, newTotalAmount };
}

const requireAdminOrFactory = async () => {
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
    .select('role, manufacturer_id')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  }

  if (!profile || (!isBackofficeOperatorRole(profile.role))) {
    return { error: NextResponse.json({ error: '권한이 필요합니다.' }, { status: 403 }) };
  }

  return { profile };
};

export async function GET(request: Request) {
  try {
    const authResult = await requireAdminOrFactory();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message || '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    const isFactory = authResult.profile.role === 'factory';

    if (isFactory) {
      if (!authResult.profile.manufacturer_id) {
        return NextResponse.json({ error: '공장 정보가 필요합니다.' }, { status: 403 });
      }
      const { data: factoryItems, error: factoryItemsError } = await adminClient
        .from('order_items')
        .select('id')
        .eq('order_id', orderId)
        .eq('assigned_manufacturer_id', authResult.profile.manufacturer_id)
        .limit(1);

      if (factoryItemsError || !factoryItems || factoryItems.length === 0) {
        return NextResponse.json({ error: '이 주문에 대한 권한이 없습니다.' }, { status: 403 });
      }
    }

    let itemsQuery = adminClient
      .from('order_items')
      .select('*, products(product_code)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (isFactory) {
      itemsQuery = itemsQuery.eq('assigned_manufacturer_id', authResult.profile.manufacturer_id!);
    }

    const { data, error } = await itemsQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '주문 상품을 불러오지 못했습니다.';
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

    if (profileError || !profile || (!isBackofficeOperatorRole(profile.role))) {
      return NextResponse.json({ error: '권한이 필요합니다.' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const orderItemId = payload?.orderItemId;
    const updateMode = payload?.updateMode;

    if (!orderItemId || typeof orderItemId !== 'string') {
      return NextResponse.json({ error: '주문 상품 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // --- admin_edit mode: update quantity/price/design ---
    if (updateMode === 'admin_edit') {
      if ((!isAdminLike(profile.role))) {
        return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
      }

      const { data: existingItem, error: existingErr } = await adminClient
        .from('order_items')
        .select('id, order_id')
        .eq('id', orderItemId)
        .single();

      if (existingErr || !existingItem) {
        return NextResponse.json({ error: '주문 상품을 찾을 수 없습니다.' }, { status: 404 });
      }

      const orderId = existingItem.order_id;
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

      const { variants, pricePerItem, designId, productId } = payload;

      // Design change
      if (designId && productId) {
        const { data: design } = await adminClient
          .from('saved_designs')
          .select('id, product_id, title, canvas_state, color_selections, preview_url, price_per_item, image_urls, text_svg_exports, custom_fonts')
          .eq('id', designId)
          .single();
        const { data: product } = await adminClient
          .from('products')
          .select('id, title, base_price')
          .eq('id', productId)
          .single();

        if (!design || !product) {
          return NextResponse.json({ error: '디자인 또는 제품을 찾을 수 없습니다.' }, { status: 404 });
        }

        const colorSelections = normalizeJson<Record<string, unknown>>(design.color_selections ?? null, {});
        const canvasState = normalizeJson<Record<string, unknown>>(design.canvas_state ?? null, {});

        updateData.design_id = designId;
        updateData.product_id = productId;
        updateData.product_title = product.title || 'Product';
        updateData.canvas_state = canvasState;
        updateData.color_selections = colorSelections;
        updateData.thumbnail_url = design.preview_url || null;
        updateData.image_urls = design.image_urls || null;
        updateData.text_svg_exports = design.text_svg_exports || null;
        updateData.custom_fonts = design.custom_fonts || null;

        if (pricePerItem == null) {
          const designPrice = toNumber(design.price_per_item);
          updateData.price_per_item = designPrice > 0 ? designPrice : toNumber(product.base_price);
        }
      }

      // Price change
      if (pricePerItem != null && pricePerItem > 0) {
        updateData.price_per_item = pricePerItem;
      }

      // Variants / quantity change
      if (variants && Array.isArray(variants) && variants.length > 0) {
        const totalQty = variants.reduce((s: number, v: { quantity: number }) => s + (v.quantity || 0), 0);
        if (totalQty <= 0) {
          return NextResponse.json({ error: '총 수량은 1개 이상이어야 합니다.' }, { status: 400 });
        }

        const colorSelections = (updateData.color_selections as Record<string, unknown> | undefined) ?? {};
        const productColor = resolveProductColor(colorSelections);
        const orderVariants = variants
          .filter((v: { quantity: number }) => v.quantity > 0)
          .map((v: { sizeCode: string; sizeLabel: string; quantity: number }) => ({
            size_id: v.sizeCode,
            size_name: v.sizeLabel,
            quantity: v.quantity,
            color_hex: productColor || undefined,
          }));

        const itemOptions: Record<string, unknown> = { variants: orderVariants };
        if (orderVariants.length === 1) {
          const [single] = orderVariants;
          itemOptions.size_id = single.size_id;
          itemOptions.size_name = single.size_name;
          if (single.color_hex) itemOptions.color_hex = single.color_hex;
        }

        updateData.quantity = totalQty;
        updateData.item_options = itemOptions;
      }

      const { data, error } = await adminClient
        .from('order_items')
        .update(updateData)
        .eq('id', orderItemId)
        .select('*, products(product_code)')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await recalcOrderTotals(adminClient, orderId);

      const { data: updatedOrder } = await adminClient
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      return NextResponse.json({ data: { item: data, order: updatedOrder } });
    }

    // --- Default mode: canvas_state update (factory/admin) ---
    const canvasState = payload?.canvasState;
    const thumbnailUrl = payload?.thumbnailUrl;

    if (!canvasState || typeof canvasState !== 'object') {
      return NextResponse.json({ error: 'canvas_state가 필요합니다.' }, { status: 400 });
    }

    if (profile.role === 'factory') {
      if (!profile.manufacturer_id) {
        return NextResponse.json({ error: '공장 정보가 필요합니다.' }, { status: 403 });
      }
      const { data: orderItem, error: itemError } = await adminClient
        .from('order_items')
        .select('order_id, orders!inner(assigned_manufacturer_id)')
        .eq('id', orderItemId)
        .single();

      if (itemError || !orderItem) {
        return NextResponse.json({ error: '주문 상품을 찾을 수 없습니다.' }, { status: 404 });
      }

      const order = orderItem.orders as unknown as { assigned_manufacturer_id: string | null };
      if (order.assigned_manufacturer_id !== profile.manufacturer_id) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
      }
    }

    const updateData: Record<string, unknown> = {
      canvas_state: canvasState,
      updated_at: new Date().toISOString(),
    };
    if (typeof thumbnailUrl === 'string') {
      updateData.thumbnail_url = thumbnailUrl;
    }

    const { data, error } = await adminClient
      .from('order_items')
      .update(updateData)
      .eq('id', orderItemId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '주문 상품 수정에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: '요청 데이터가 올바르지 않습니다.' }, { status: 400 });
    }

    const { orderId, designId, productId, variants, pricingMode, customUnitPrice } = payload;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }
    if (!designId || typeof designId !== 'string') {
      return NextResponse.json({ error: '디자인 ID가 필요합니다.' }, { status: 400 });
    }
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: '제품 ID가 필요합니다.' }, { status: 400 });
    }
    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      return NextResponse.json({ error: '최소 하나의 사이즈/수량을 선택해주세요.' }, { status: 400 });
    }

    const totalQty = variants.reduce((s: number, v: { quantity: number }) => s + (v.quantity || 0), 0);
    if (totalQty <= 0) {
      return NextResponse.json({ error: '총 수량은 1개 이상이어야 합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, order_category')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: design, error: designError } = await adminClient
      .from('saved_designs')
      .select('id, product_id, title, canvas_state, color_selections, preview_url, price_per_item, image_urls, text_svg_exports, custom_fonts')
      .eq('id', designId)
      .single();

    if (designError || !design) {
      return NextResponse.json({ error: '디자인을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: product, error: productError } = await adminClient
      .from('products')
      .select('id, title, base_price, size_options')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: '제품을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (design.product_id !== productId) {
      return NextResponse.json({ error: '디자인과 제품이 일치하지 않습니다.' }, { status: 400 });
    }

    let unitPrice: number;
    if (pricingMode === 'custom_unit_price' && customUnitPrice != null && customUnitPrice > 0) {
      unitPrice = customUnitPrice;
    } else {
      const designPrice = toNumber(design.price_per_item);
      unitPrice = designPrice > 0 ? designPrice : toNumber(product.base_price);
    }

    const colorSelections = normalizeJson<Record<string, unknown>>(design.color_selections ?? null, {});
    const canvasState = normalizeJson<Record<string, unknown>>(design.canvas_state ?? null, {});
    const productColor = resolveProductColor(colorSelections);

    const orderVariants = variants
      .filter((v: { quantity: number }) => v.quantity > 0)
      .map((v: { sizeCode: string; sizeLabel: string; quantity: number }) => ({
        size_id: v.sizeCode,
        size_name: v.sizeLabel,
        quantity: v.quantity,
        color_hex: productColor || undefined,
      }));

    const itemOptions: Record<string, unknown> = { variants: orderVariants };
    if (orderVariants.length === 1) {
      const [single] = orderVariants;
      itemOptions.size_id = single.size_id;
      itemOptions.size_name = single.size_name;
      if (single.color_hex) itemOptions.color_hex = single.color_hex;
    }

    const itemPayload = {
      order_id: orderId,
      product_id: productId,
      design_id: designId,
      product_title: product.title || 'Product',
      quantity: totalQty,
      price_per_item: unitPrice,
      canvas_state: canvasState,
      color_selections: colorSelections,
      item_options: itemOptions,
      thumbnail_url: design.preview_url || null,
      image_urls: design.image_urls || null,
      text_svg_exports: design.text_svg_exports || null,
      custom_fonts: design.custom_fonts || null,
    };

    const { data: newItem, error: insertError } = await adminClient
      .from('order_items')
      .insert(itemPayload)
      .select('*, products(product_code)')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { newOriginalAmount, newTotalAmount } = await recalcOrderTotals(adminClient, orderId);

    const { data: updatedOrder } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    return NextResponse.json({ data: { item: newItem, order: updatedOrder, originalAmount: newOriginalAmount, totalAmount: newTotalAmount } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '주문 상품 추가에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');
    const orderItemId = url.searchParams.get('orderItemId');

    if (!orderId || !orderItemId) {
      return NextResponse.json({ error: '주문 ID와 상품 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: item, error: itemError } = await adminClient
      .from('order_items')
      .select('id, order_id')
      .eq('id', orderItemId)
      .eq('order_id', orderId)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: '주문 상품을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { count } = await adminClient
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId);

    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: '주문에는 최소 1개의 상품이 필요합니다.' }, { status: 400 });
    }

    const { error: deleteError } = await adminClient
      .from('order_items')
      .delete()
      .eq('id', orderItemId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { newOriginalAmount, newTotalAmount } = await recalcOrderTotals(adminClient, orderId);

    const { data: updatedOrder } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    return NextResponse.json({ data: { order: updatedOrder, originalAmount: newOriginalAmount, totalAmount: newTotalAmount } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '주문 상품 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
