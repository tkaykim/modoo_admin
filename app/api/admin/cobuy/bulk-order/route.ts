import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';

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
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORDER-${Date.now()}-${random}`;
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
    } catch (error) {
      console.warn('Failed to parse JSON value:', error);
      return fallback;
    }
  }
  return value as T;
};

const resolveProductColor = (colorSelections: Record<string, any>): string | null => {
  if (!colorSelections || typeof colorSelections !== 'object') return null;
  if (typeof colorSelections.productColor === 'string') return colorSelections.productColor;
  if (typeof colorSelections.body === 'string') return colorSelections.body;
  if (colorSelections.front && typeof colorSelections.front.body === 'string') {
    return colorSelections.front.body;
  }
  return null;
};

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const sessionId = payload?.sessionId;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: '세션 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: session, error: sessionError } = await adminClient
      .from('cobuy_sessions')
      .select('id, user_id, saved_design_screenshot_id, title, status, bulk_order_id, cobuy_image_urls, payment_mode')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: sessionError?.message || '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (session.bulk_order_id) {
      return NextResponse.json({ error: '이미 주문이 생성된 세션입니다.' }, { status: 409 });
    }

    if (session.status !== 'gather_complete') {
      return NextResponse.json({ error: '모집완료 상태의 세션만 주문을 생성할 수 있습니다.' }, { status: 400 });
    }

    // Fetch participants (all statuses - free cobuys may stay 'pending')
    const { data: participants, error: participantError } = await adminClient
      .from('cobuy_participants')
      .select('id, name, email, phone, selected_size, selected_items, total_quantity, payment_status, payment_amount')
      .eq('cobuy_session_id', sessionId);

    if (participantError) {
      return NextResponse.json({ error: participantError.message }, { status: 500 });
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ error: '참여자가 없습니다.' }, { status: 400 });
    }

    // Fetch design data from saved_design_screenshots (not saved_designs)
    const { data: design, error: designError } = await adminClient
      .from('saved_design_screenshots')
      .select('id, product_id, title, canvas_state, color_selections, preview_url, price_per_item, image_urls, text_svg_exports, custom_fonts')
      .eq('id', session.saved_design_screenshot_id)
      .single();

    if (designError || !design) {
      return NextResponse.json({ error: designError?.message || '디자인 정보를 찾을 수 없습니다.' }, { status: 500 });
    }

    if (!design.product_id) {
      return NextResponse.json({
        error: '상품이 연결되지 않은 공동구매입니다. 공동구매를 다시 생성해주세요.',
      }, { status: 400 });
    }

    const { data: product, error: productError } = await adminClient
      .from('products')
      .select('id, title, base_price, size_options')
      .eq('id', design.product_id)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: productError?.message || '제품 정보를 찾을 수 없습니다.' }, { status: 500 });
    }

    const { data: creatorProfile } = await adminClient
      .from('profiles')
      .select('email, phone_number')
      .eq('id', session.user_id)
      .single();

    // Build size variant map from selected_items (supports multi-size per participant)
    interface SizeOptionObj { label: string; size_code: string; }
    const rawSizeOptions = normalizeJson<(string | SizeOptionObj)[]>(product.size_options ?? null, []);
    const sizeOptions: SizeOptionObj[] = rawSizeOptions.map((opt) =>
      typeof opt === 'string' ? { label: opt, size_code: opt } : opt
    );

    const variantMap = new Map<string, { size_id: string; size_name: string; quantity: number }>();

    for (const participant of participants) {
      const items = normalizeJson<{ size: string; quantity: number }[]>(participant.selected_items, []);

      if (items.length > 0) {
        for (const item of items) {
          const sizeName = item.size || 'unknown';
          const matched = sizeOptions.find((opt) => opt.label === sizeName);
          const sizeId = matched?.size_code || sizeName;

          const existing = variantMap.get(sizeId);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            variantMap.set(sizeId, { size_id: sizeId, size_name: matched?.label || sizeName, quantity: item.quantity });
          }
        }
      } else {
        const sizeName = participant.selected_size || 'unknown';
        const matched = sizeOptions.find((opt) => opt.label === sizeName);
        const sizeId = matched?.size_code || sizeName;

        const existing = variantMap.get(sizeId);
        if (existing) {
          existing.quantity += 1;
        } else {
          variantMap.set(sizeId, { size_id: sizeId, size_name: matched?.label || sizeName, quantity: 1 });
        }
      }
    }

    const totalQuantity = participants.reduce((sum, p) => sum + (toNumber(p.total_quantity) || 1), 0);
    const totalPaid = participants.reduce((sum, p) => sum + toNumber(p.payment_amount), 0);

    const designPrice = toNumber(design.price_per_item);
    const basePrice = designPrice > 0 ? designPrice : toNumber(product.base_price);
    const totalAmount = totalPaid > 0 ? totalPaid : basePrice * totalQuantity;
    const pricePerItem = totalQuantity > 0 ? Number((totalAmount / totalQuantity).toFixed(2)) : basePrice;

    const colorSelections = normalizeJson<Record<string, any>>(design.color_selections ?? null, {});
    const canvasState = normalizeJson<Record<string, any>>(design.canvas_state ?? null, {});
    const productColor = resolveProductColor(colorSelections);

    const variants = Array.from(variantMap.values()).map((variant) => ({
      ...variant,
      color_hex: productColor || undefined,
    }));

    const itemOptions: Record<string, unknown> = { variants };
    if (variants.length === 1) {
      const [single] = variants;
      itemOptions.size_id = single.size_id;
      itemOptions.size_name = single.size_name;
      if (single.color_hex) {
        itemOptions.color_hex = single.color_hex;
      }
    }

    const orderId = buildOrderId();
    const isSurveyMode = session.payment_mode === 'survey';
    const paymentLinkToken = isSurveyMode ? randomBytes(16).toString('hex') : null;

    const orderPayload: Record<string, unknown> = {
      id: orderId,
      user_id: session.user_id,
      order_category: 'cobuy',
      cobuy_session_id: sessionId,
      customer_name: creatorProfile?.email || `CoBuy ${session.title || session.id}`,
      customer_email: creatorProfile?.email || 'unknown@cobuy.local',
      customer_phone: creatorProfile?.phone_number || null,
      shipping_method: 'pickup',
      country_code: null,
      state: null,
      city: null,
      postal_code: null,
      address_line_1: null,
      address_line_2: null,
      delivery_fee: 0,
      payment_method: isSurveyMode ? 'toss' : 'admin',
      payment_key: null,
      payment_status: isSurveyMode ? 'pending' : 'completed',
      order_status: isSurveyMode ? 'payment_pending' : 'payment_completed',
      total_amount: totalAmount,
      payment_link_token: paymentLinkToken,
    };

    const { error: orderError } = await adminClient
      .from('orders')
      .insert(orderPayload);

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    const orderItemPayload = {
      order_id: orderId,
      product_id: design.product_id,
      design_id: null,
      product_title: product.title || 'CoBuy Product',
      quantity: totalQuantity,
      price_per_item: pricePerItem,
      canvas_state: canvasState,
      color_selections: colorSelections,
      item_options: itemOptions,
      thumbnail_url: design.preview_url || null,
      image_urls: design.image_urls || null,
      text_svg_exports: design.text_svg_exports || null,
      custom_fonts: design.custom_fonts || null,
    };

    const { error: orderItemError } = await adminClient
      .from('order_items')
      .insert(orderItemPayload);

    if (orderItemError) {
      await adminClient.from('orders').delete().eq('id', orderId);
      return NextResponse.json({ error: orderItemError.message }, { status: 500 });
    }

    const { error: updateError } = await adminClient
      .from('cobuy_sessions')
      .update({
        bulk_order_id: orderId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    let paymentLinkUrl: string | null = null;
    if (paymentLinkToken) {
      paymentLinkUrl = `https://modoouniform.com/order/custom/${paymentLinkToken}`;
    }

    return NextResponse.json({
      data: {
        orderId,
        paymentLinkToken,
        paymentLinkUrl,
        paymentMode: session.payment_mode,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공동구매 주문 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
