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

    // 공장 스코프: 메일 링크에 ?factory=<manufacturer_id>가 붙어 오면 그 공장 배정 건만 노출(혼선 방지).
    // 보안 격리가 목적이 아니라 작업자 혼선 방지가 목적이므로, 없으면 전체를 보여준다(레거시 호환).
    const factoryId = new URL(request.url).searchParams.get('factory');

    const adminClient = createAdminClient();

    // Fetch order by share token
    // Only select fields safe for factory viewing (exclude sensitive customer/payment data)
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select(`
        id,
        order_status,
        order_category,
        parent_order_id,
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
        configuration_snapshot,
        color_selections,
        item_options,
        thumbnail_url,
        image_urls,
        text_svg_exports,
        custom_fonts,
        assigned_manufacturer_id,
        factory_status,
        factory_amount,
        factory_unit_price,
        factory_price_confirmed_at,
        factory_price_locked,
        products(product_code, title, configuration, size_options, base_price, manufacturers(id, name)),
        created_at
      `)
      .eq('order_id', order.id)
      .order('created_at', { ascending: true });

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // 공장 스코프 적용: factory 파라미터가 있으면 그 공장 배정 건만 남긴다.
    const scopedItems = factoryId
      ? (items || []).filter((it) => it.assigned_manufacturer_id === factoryId)
      : (items || []);

    // Fetch product colors for each unique product
    const productIds = [...new Set(scopedItems.map((item) => item.product_id))];
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
        items: scopedItems,
        productColors: productColorsMap,
        scopedFactoryId: factoryId,
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
    const itemId = payload?.itemId;
    const factoryAmount = payload?.factoryAmount;
    const factoryUnitPrice = payload?.factoryUnitPrice;
    const factoryPriceMode = payload?.factoryPriceMode;
    const factoryId = payload?.factory; // 선택: 공장 스코프
    const confirmFactoryPrice = payload?.confirmFactoryPrice === true;

    const validStatuses = ['assigned', 'in_progress', 'completed', 'shipped'];
    if (!factoryStatus || !validStatuses.includes(factoryStatus)) {
      return NextResponse.json({ error: '유효하지 않은 공장 배정 상태입니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Verify the share token exists
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, order_status')
      .eq('share_token', shareToken)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 주문 단위 상태 롤업 헬퍼: 모든 품목 상태로 주문 대표 상태를 파생한다.
    const rollupOrder = async (): Promise<string> => {
      const { data: allItems } = await adminClient
        .from('order_items')
        .select('factory_status')
        .eq('order_id', order.id);
      const statuses = (allItems || []).map((i) => i.factory_status || 'pending');
      let rollup = 'assigned';
      if (statuses.length > 0 && statuses.every((s) => s === 'shipped')) rollup = 'shipped';
      else if (statuses.length > 0 && statuses.every((s) => s === 'completed' || s === 'shipped')) rollup = 'completed';
      else if (statuses.some((s) => ['in_progress', 'completed', 'shipped'].includes(s))) rollup = 'in_progress';
      const orderStatus = rollup === 'shipped' ? 'shipping' : 'in_production';
      await adminClient
        .from('orders')
        .update({ factory_status: rollup, order_status: orderStatus, updated_at: new Date().toISOString() })
        .eq('id', order.id);
      return orderStatus;
    };

    // 품목 단위 업데이트 (신규 동작)
    if (itemId) {
      // 대상 품목의 정산 확정(잠금) 상태 확인
      const { data: lockRow } = await adminClient
        .from('order_items')
        .select('factory_price_locked')
        .eq('id', itemId)
        .eq('order_id', order.id)
        .single();
      const itemLocked = !!lockRow?.factory_price_locked;
      const wantsPriceChange =
        (factoryAmount !== undefined && factoryAmount !== null) ||
        factoryUnitPrice !== undefined ||
        factoryPriceMode !== undefined;

      // 잠금된 단가는 공장이 수정 불가
      if (itemLocked && wantsPriceChange) {
        return NextResponse.json(
          { error: '관리자가 정산 확정한 단가입니다. 수정하려면 관리자에게 요청해 주세요.', code: 'FACTORY_PRICE_LOCKED' },
          { status: 403 }
        );
      }
      // 단가 확정 게이트 (잠금된 건은 확정값 사용 → 게이트 생략)
      if (!itemLocked && factoryStatus === 'in_progress' && !confirmFactoryPrice) {
        return NextResponse.json(
          { error: '작업 시작 전 정산 단가를 확인해 주세요.', code: 'FACTORY_PRICE_REQUIRED' },
          { status: 400 }
        );
      }

      const itemUpdate: Record<string, unknown> = {
        factory_status: factoryStatus,
        updated_at: new Date().toISOString(),
      };
      if (!itemLocked) {
        if (factoryAmount !== undefined && factoryAmount !== null) {
          itemUpdate.factory_amount = factoryAmount;
        }
        if (factoryUnitPrice !== undefined) {
          itemUpdate.factory_unit_price = factoryUnitPrice;
        }
        if (factoryPriceMode !== undefined) {
          itemUpdate.factory_price_mode = factoryPriceMode;
        }
        if (confirmFactoryPrice) {
          // 비로그인 링크 확정 — 주체(by)는 없음, 시각만 기록
          itemUpdate.factory_price_confirmed_at = new Date().toISOString();
        }
      }

      let q = adminClient
        .from('order_items')
        .update(itemUpdate)
        .eq('id', itemId)
        .eq('order_id', order.id);
      if (factoryId) q = q.eq('assigned_manufacturer_id', factoryId);

      const { data: updatedItems, error: updErr } = await q.select('id, factory_status, factory_amount');
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      if (!updatedItems || updatedItems.length === 0) {
        return NextResponse.json({ error: '해당 작업 항목을 찾을 수 없습니다.' }, { status: 404 });
      }

      const orderStatus = await rollupOrder();
      return NextResponse.json({ data: { item: updatedItems[0], order_status: orderStatus } });
    }

    // 레거시 호환: itemId 없이 온 구버전 요청 — 주문 단위 처리
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
