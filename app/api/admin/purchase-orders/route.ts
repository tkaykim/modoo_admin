import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const dateType = url.searchParams.get('dateType') || 'ordered';

    const adminClient = createAdminClient();

    let query = adminClient
      .from('order_items')
      .select(`
        id, order_id, product_id, product_title, design_title, quantity, item_options,
        purchase_order_status, purchase_ordered_at, created_at,
        assigned_manufacturer_id,
        products(product_code),
        manufacturers(id, name, address),
        orders!inner(id, customer_name, customer_email, order_status, created_at)
      `)
      .neq('orders.order_status', 'cancelled')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('purchase_order_status', status);
    }

    if (search) {
      query = query.or(`product_title.ilike.%${search}%,order_id.ilike.%${search}%`);
    }

    if (dateFrom) {
      const col = dateType === 'ordered' ? 'purchase_ordered_at' : 'created_at';
      query = query.gte(col, dateFrom);
    }
    if (dateTo) {
      const col = dateType === 'ordered' ? 'purchase_ordered_at' : 'created_at';
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      query = query.lt(col, endDate.toISOString());
    }

    // thumbnail_url은 대부분 base64 data URL(행당 평균 30KB, 전체 약 26MB)이라 목록에서 통째로 싣지 않는다.
    // 2026-09-22 DB 인스턴스 다운 직전 이 쿼리가 statement timeout을 반복했다.
    // 목록에는 짧은 URL만 싣고, data URL은 /api/admin/order-items/[id]/thumbnail 에서 필요할 때 받는다.
    // PostgREST 기본 1,000행 절단을 피하려고 range로 끝까지 읽는다.
    const PAGE = 1000;
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      rows.push(...((data || []) as unknown as Record<string, unknown>[]));
      if (!data || data.length < PAGE) break;
    }

    const thumbnails = new Map<string, string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await adminClient
        .from('order_items')
        .select('id, thumbnail_url')
        .not('thumbnail_url', 'is', null)
        .not('thumbnail_url', 'like', 'data:%')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      for (const r of data || []) thumbnails.set(r.id, r.thumbnail_url as string);
      if (!data || data.length < PAGE) break;
    }

    const inlineIds = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await adminClient
        .from('order_items')
        .select('id')
        .like('thumbnail_url', 'data:%')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      for (const r of data || []) inlineIds.add(r.id);
      if (!data || data.length < PAGE) break;
    }

    const result = rows.map((row) => {
      const id = row.id as string;
      const thumbnail_url = thumbnails.get(id)
        ?? (inlineIds.has(id) ? `/api/admin/order-items/${id}/thumbnail` : null);
      return { ...row, thumbnail_url };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : '발주 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const orderItemIds: string[] = payload?.orderItemIds;
    const newStatus: string = payload?.status;

    if (!orderItemIds || !Array.isArray(orderItemIds) || orderItemIds.length === 0) {
      return NextResponse.json({ error: '주문 상품 ID가 필요합니다.' }, { status: 400 });
    }

    const validStatuses = ['pending', 'ordered', 'received', 'cancelled'];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: '유효하지 않은 발주 상태입니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      purchase_order_status: newStatus,
      updated_at: now,
    };

    if (newStatus === 'ordered') {
      updateData.purchase_ordered_at = now;
    }

    const { data, error } = await adminClient
      .from('order_items')
      .update(updateData)
      .in('id', orderItemIds)
      .select('id, purchase_order_status, purchase_ordered_at');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '발주 상태 변경에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
