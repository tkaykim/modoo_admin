import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { resolveColorByHex } from '@/lib/colorLookup';

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

/**
 * canvas_state 의 각 side에서 productColor를 추출.
 * 에디터(saveOrderMode)가 canvas_state[sideId].productColor에 최신 색을 저장하므로,
 * 이를 권위 있는 source로 보고 color_selections / item_options에 전파한다.
 *
 * 모든 side의 productColor가 동일하면 그 값을, 다르면 첫 side 값을 반환.
 * (단일 색상 제품 기준 — 멀티 레이어는 별도로 layerColors 처리)
 */
const extractProductColorFromCanvasState = (canvasState: unknown): string | null => {
  if (!canvasState || typeof canvasState !== 'object') return null;
  for (const raw of Object.values(canvasState as Record<string, unknown>)) {
    const parsed = typeof raw === 'string'
      ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
      : raw;
    if (parsed && typeof parsed === 'object') {
      const pc = (parsed as Record<string, unknown>).productColor;
      if (typeof pc === 'string' && pc.startsWith('#')) return pc;
    }
  }
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
        .select('id, order_id, product_id, color_selections')
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
        updateData.production_ready = true;  // 디자인 연결됨 → 공장배정 가능(간이주문 게이트 해제)

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

        // 디자인 변경 시 새 color_selections, 수량만 변경 시 기존 행의 color_selections 로 폴백
        // (폴백이 없으면 수량 변경만으로 기존 색상정보가 지워지는 회귀 발생)
        const colorSelections =
          (updateData.color_selections as Record<string, unknown> | undefined)
          ?? (normalizeJson<Record<string, unknown>>((existingItem?.color_selections as Record<string, unknown> | string | null) ?? null, {}));
        const productColor = resolveProductColor(colorSelections);
        // 변경 후 productId 기준으로 색상명/코드 조회 (디자인 미변경 시 기존 행의 product_id 사용)
        const variantProductId = (updateData.product_id as string | undefined) ?? existingItem?.product_id;
        const resolvedColor = await resolveColorByHex(adminClient, variantProductId, productColor);
        const orderVariants = variants
          .filter((v: { quantity: number }) => v.quantity > 0)
          .map((v: { sizeCode: string; sizeLabel: string; quantity: number }) => ({
            size_id: v.sizeCode,
            size_name: v.sizeLabel,
            quantity: v.quantity,
            color_hex: productColor || undefined,
            color_id: productColor || undefined,
            color_name: resolvedColor?.color_name,
            color_code: resolvedColor?.color_code,
          }));

        const itemOptions: Record<string, unknown> = { variants: orderVariants };
        if (orderVariants.length === 1) {
          const [single] = orderVariants;
          itemOptions.size_id = single.size_id;
          itemOptions.size_name = single.size_name;
          if (single.color_hex) itemOptions.color_hex = single.color_hex;
          if (single.color_name) itemOptions.color_name = single.color_name;
          if (single.color_code) itemOptions.color_code = single.color_code;
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

    // --- design_title 모드: admin·factory 둘 다 (자기 배정 건만) ---
    if (updateMode === 'design_title') {
      const raw = payload?.designTitle;
      const designTitle = typeof raw === 'string' ? raw.trim().slice(0, 60) : '';
      if (!designTitle) {
        return NextResponse.json({ error: '디자인 이름을 입력해주세요.' }, { status: 400 });
      }

      // factory 권한 체크: 자기 배정 item만 수정 가능
      if (profile.role === 'factory') {
        if (!profile.manufacturer_id) {
          return NextResponse.json({ error: '공장 정보가 필요합니다.' }, { status: 403 });
        }
        const { data: own, error: ownErr } = await adminClient
          .from('order_items')
          .select('id, assigned_manufacturer_id')
          .eq('id', orderItemId)
          .single();
        if (ownErr || !own || own.assigned_manufacturer_id !== profile.manufacturer_id) {
          return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
        }
      }

      const { data, error } = await adminClient
        .from('order_items')
        .update({ design_title: designTitle, updated_at: new Date().toISOString() })
        .eq('id', orderItemId)
        .select('id, design_title')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ data });
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
      production_ready: true,  // 목업/아트워크가 채워지면 공장배정 가능(간이주문 게이트 해제). 일반 주문은 이미 true라 무영향.
      updated_at: new Date().toISOString(),
    };
    if (typeof thumbnailUrl === 'string') {
      updateData.thumbnail_url = thumbnailUrl;
    }

    // canvas_state 에 담긴 최신 productColor 를 color_selections / item_options 에도 동기화.
    // 누락 시 useEditorData 가 stale 한 color_selections 를 우선 읽어 옛 색으로 표시되는 버그 방지.
    const newProductColor = extractProductColorFromCanvasState(canvasState);
    if (newProductColor) {
      const { data: existing } = await adminClient
        .from('order_items')
        .select('color_selections, item_options')
        .eq('id', orderItemId)
        .single();

      const prevColorSelections = normalizeJson<Record<string, unknown>>(
        existing?.color_selections ?? null,
        {}
      );
      updateData.color_selections = { ...prevColorSelections, productColor: newProductColor };

      const prevItemOptions = normalizeJson<Record<string, unknown>>(
        existing?.item_options ?? null,
        {}
      );
      const nextItemOptions: Record<string, unknown> = { ...prevItemOptions };
      const prevColor = typeof prevColorSelections.productColor === 'string' ? prevColorSelections.productColor : null;
      if (Array.isArray(prevItemOptions.variants)) {
        // 다색상 보존: 이 item 의 기존 단일색(prevColor)과 같던 variant(또는 색 미지정)만 새 색으로 갱신.
        // 의도적으로 다른 색으로 담긴 variant(블랙/화이트/버건디 혼합 주문)는 그대로 둔다.
        // (색 혼합 주문이 시안수정 저장 한 번에 한 색으로 뭉개지던 사고 방지 — ORD-20260630-S3H58R)
        nextItemOptions.variants = (prevItemOptions.variants as Array<Record<string, unknown>>).map((v) => {
          const vhex = typeof v.color_hex === 'string' ? v.color_hex : '';
          if (!vhex || (prevColor && vhex === prevColor)) return { ...v, color_hex: newProductColor };
          return v;
        });
      }
      if (typeof prevItemOptions.color_hex === 'string') {
        nextItemOptions.color_hex = newProductColor;
      }
      updateData.item_options = nextItemOptions;
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
    // 간이 이미지 항목: 디자인(목업) 없이 "완성 이미지 + 제품"만으로 추가. 목업은 결제 후 에디터에서 채움.
    const isQuick = payload?.quickImage === true;
    const quickThumbnailUrl = typeof payload?.thumbnailUrl === 'string' ? payload.thumbnailUrl : null;
    const designTitleInput = typeof payload?.designTitle === 'string' ? payload.designTitle.trim() : '';

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }
    if (isQuick) {
      if (!quickThumbnailUrl) {
        return NextResponse.json({ error: '간이 주문에는 이미지가 필요합니다.' }, { status: 400 });
      }
    } else if (!designId || typeof designId !== 'string') {
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
      .select('id, order_category, payment_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 결제 완료 주문에는 상품을 직접 추가할 수 없음 — 추가하면 결제금액과 주문총액이 어긋나 정합성이 깨진다.
    // 수량/사양 증가는 '차액 추가청구'(별도 결제건)로 처리해야 함.
    if (order.payment_status === 'completed') {
      return NextResponse.json(
        { error: "결제 완료된 주문에는 상품을 직접 추가할 수 없습니다. 수량·사양 추가는 '차액 추가청구'로 진행해 주세요." },
        { status: 400 },
      );
    }

    // 간이 항목은 디자인이 없으므로 조회 생략.
    let design: {
      id: string; product_id: string; title: string | null;
      canvas_state: Record<string, unknown> | string | null;
      color_selections: Record<string, unknown> | string | null;
      preview_url: string | null;
      price_per_item: number | null; image_urls: unknown; text_svg_exports: unknown; custom_fonts: unknown;
    } | null = null;
    if (!isQuick) {
      const { data: designData, error: designError } = await adminClient
        .from('saved_designs')
        .select('id, product_id, title, canvas_state, color_selections, preview_url, price_per_item, image_urls, text_svg_exports, custom_fonts')
        .eq('id', designId)
        .single();

      if (designError || !designData) {
        return NextResponse.json({ error: '디자인을 찾을 수 없습니다.' }, { status: 404 });
      }
      design = designData;
    }

    const { data: product, error: productError } = await adminClient
      .from('products')
      .select('id, title, base_price, size_options')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: '제품을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (design && design.product_id !== productId) {
      return NextResponse.json({ error: '디자인과 제품이 일치하지 않습니다.' }, { status: 400 });
    }

    let unitPrice: number;
    if (pricingMode === 'custom_unit_price' && customUnitPrice != null && customUnitPrice > 0) {
      unitPrice = customUnitPrice;
    } else if (design) {
      const designPrice = toNumber(design.price_per_item);
      unitPrice = designPrice > 0 ? designPrice : toNumber(product.base_price);
    } else {
      unitPrice = toNumber(product.base_price);
    }

    const colorSelections = design ? normalizeJson<Record<string, unknown>>(design.color_selections ?? null, {}) : {};
    const canvasState = design ? normalizeJson<Record<string, unknown>>(design.canvas_state ?? null, {}) : {};
    const productColor = resolveProductColor(colorSelections);
    // hex → 색상명/코드 조회 (발주서에 색상명 표시)
    const resolvedColor = await resolveColorByHex(adminClient, productId, productColor);

    const orderVariants = variants
      .filter((v: { quantity: number }) => v.quantity > 0)
      .map((v: { sizeCode: string; sizeLabel: string; quantity: number }) => ({
        size_id: v.sizeCode,
        size_name: v.sizeLabel,
        quantity: v.quantity,
        color_hex: productColor || undefined,
        color_id: productColor || undefined,
        color_name: resolvedColor?.color_name,
        color_code: resolvedColor?.color_code,
      }));

    const itemOptions: Record<string, unknown> = { variants: orderVariants };
    if (orderVariants.length === 1) {
      const [single] = orderVariants;
      itemOptions.size_id = single.size_id;
      itemOptions.size_name = single.size_name;
      if (single.color_hex) itemOptions.color_hex = single.color_hex;
      if (single.color_name) itemOptions.color_name = single.color_name;
      if (single.color_code) itemOptions.color_code = single.color_code;
    }

    // 디자인명(공장·관리자 구분 라벨): 입력값 우선, 없으면 디자인 title, 간이는 제품명.
    const designTitleSnapshot = designTitleInput
      ? designTitleInput.slice(0, 60)
      : (design ? (design.title || null) : (product.title || '간이주문'));

    const itemPayload = {
      order_id: orderId,
      product_id: productId,
      design_id: design ? designId : null,
      product_title: product.title || 'Product',
      design_title: designTitleSnapshot,
      quantity: totalQty,
      price_per_item: unitPrice,
      canvas_state: canvasState,
      color_selections: colorSelections,
      item_options: itemOptions,
      thumbnail_url: design ? (design.preview_url || null) : quickThumbnailUrl,
      image_urls: design ? (design.image_urls || null) : null,
      text_svg_exports: design ? (design.text_svg_exports || null) : null,
      custom_fonts: design ? (design.custom_fonts || null) : null,
      // 간이 항목은 목업 미완성 → 공장배정 가드 발동. 일반 항목은 디자인 완성 → 배정 가능.
      production_ready: isQuick ? false : true,
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
