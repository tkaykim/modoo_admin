import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

// Public API - No authentication required
// Fetches order details by share token for factory viewing

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  try {
    const { shareToken } = await params;

    if (!shareToken || typeof shareToken !== 'string') {
      return NextResponse.json({ error: '공유 토큰이 필요합니다.' }, { status: 400 });
    }

    // Validate token format (32-character hex)
    if (!/^[a-f0-9]{32}$/.test(shareToken)) {
      return NextResponse.json({ error: '유효하지 않은 공유 링크입니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Fetch order by share token
    // Only select fields safe for factory viewing (exclude sensitive customer/payment data)
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select(`
        id,
        order_status,
        order_category,
        shipping_method,
        country_code,
        state,
        city,
        postal_code,
        address_line_1,
        address_line_2,
        deadline,
        factory_amount,
        factory_payment_date,
        factory_payment_status,
        factory_status,
        created_at,
        customer_note,
        attachment_urls
      `)
      .eq('share_token', shareToken)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Fetch order items with product details
    // Exclude price information
    const { data: items, error: itemsError } = await adminClient
      .from('order_items')
      .select(`
        id,
        product_id,
        product_title,
        quantity,
        canvas_state,
        color_selections,
        item_options,
        thumbnail_url,
        image_urls,
        text_svg_exports,
        custom_fonts,
        products(product_code, title, configuration, size_options, base_price, manufacturers(id, name)),
        created_at
      `)
      .eq('order_id', order.id)
      .order('created_at', { ascending: true });

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Fetch product colors for each unique product
    const productIds = [...new Set((items || []).map((item) => item.product_id))];
    const productColorsMap: Record<string, unknown[]> = {};
    for (const productId of productIds) {
      const { data: colors } = await adminClient
        .from('product_colors')
        .select(`*, manufacturer_colors(id, name, hex, color_code, label)`)
        .eq('product_id', productId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      productColorsMap[productId] = colors || [];
    }

    return NextResponse.json({
      data: {
        order,
        items: items || [],
        productColors: productColorsMap,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '주문 정보를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Factory can update factory_status via share token
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  try {
    const { shareToken } = await params;

    if (!shareToken || !/^[a-f0-9]{32}$/.test(shareToken)) {
      return NextResponse.json({ error: '유효하지 않은 공유 링크입니다.' }, { status: 400 });
    }

    const payload = await request.json().catch(() => null);
    const factoryStatus = payload?.factoryStatus;

    const validStatuses = ['assigned', 'in_progress', 'completed', 'shipped'];
    if (!factoryStatus || !validStatuses.includes(factoryStatus)) {
      return NextResponse.json({ error: '유효하지 않은 공장 배정 상태입니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Verify the share token exists
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, order_status, factory_status')
      .eq('share_token', shareToken)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    // Auto-set order_status based on factory_status
    // shipped → order_status = shipping
    // assigned, in_progress, completed → order_status stays in_production
    const orderStatus = factoryStatus === 'shipped' ? 'shipping' : 'in_production';

    const { data, error } = await adminClient
      .from('orders')
      .update({
        factory_status: factoryStatus,
        order_status: orderStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .select('id, order_status, factory_status')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '상태 변경에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
