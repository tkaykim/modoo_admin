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
        thumbnail_url, purchase_order_status, purchase_ordered_at, created_at,
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

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
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
