import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

type AdminRole = 'admin' | 'factory';

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
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user, profile: profile as { role: AdminRole; manufacturer_id: string | null } };
};

const countQuery = async (query: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
};

export async function GET() {
  try {
    const authResult = await requireAdminOrFactory();
    if (authResult.error) return authResult.error;

    const { profile } = authResult;
    const adminClient = createAdminClient();

    if (profile.role === 'factory' && !profile.manufacturer_id) {
      return NextResponse.json({
        data: {
          role: profile.role,
          counts: {
            orders_total: 0,
            orders_pending: 0,
            orders_processing: 0,
            orders_completed: 0,
            orders_cancelled: 0,
            orders_refunded: 0,
          },
          recentOrders: [],
        },
      });
    }

    const ordersCountQuery = (status?: string) => {
      let query = adminClient.from('orders').select('id', { count: 'exact', head: true });

      if (status) {
        query = query.eq('order_status', status);
      }

      return query;
    };

    // For factory users, count orders that have items assigned to them
    let ordersTotal = 0;
    let ordersPaymentCompleted = 0;
    let ordersInProduction = 0;
    let ordersShipping = 0;
    let ordersDelivered = 0;
    let ordersCancelled = 0;
    let ordersUnassigned = 0;

    if (profile.role === 'factory') {
      // Get distinct order_ids for this factory's items
      const { data: factoryOrderIds } = await adminClient
        .from('order_items')
        .select('order_id')
        .eq('assigned_manufacturer_id', profile.manufacturer_id);
      const uniqueOrderIds = [...new Set((factoryOrderIds || []).map((i) => i.order_id))];
      ordersTotal = uniqueOrderIds.length;

      if (uniqueOrderIds.length > 0) {
        const { data: factoryOrders } = await adminClient
          .from('orders')
          .select('order_status')
          .in('id', uniqueOrderIds);
        for (const o of factoryOrders || []) {
          if (o.order_status === 'payment_completed') ordersPaymentCompleted++;
          else if (o.order_status === 'in_production') ordersInProduction++;
          else if (o.order_status === 'shipping') ordersShipping++;
          else if (o.order_status === 'delivered') ordersDelivered++;
          else if (o.order_status === 'cancelled') ordersCancelled++;
        }
      }
    } else {
      [ordersTotal, ordersPaymentCompleted, ordersInProduction, ordersShipping, ordersDelivered, ordersCancelled, ordersUnassigned] = await Promise.all([
        countQuery(ordersCountQuery()),
        countQuery(ordersCountQuery('payment_completed')),
        countQuery(ordersCountQuery('in_production')),
        countQuery(ordersCountQuery('shipping')),
        countQuery(ordersCountQuery('delivered')),
        countQuery(ordersCountQuery('cancelled')),
        // Unassigned = orders that have at least one item without assigned_manufacturer_id
        (async () => {
          const { data: unassignedItems } = await adminClient
            .from('order_items')
            .select('order_id')
            .is('assigned_manufacturer_id', null);
          return new Set((unassignedItems || []).map((i) => i.order_id)).size;
        })(),
      ]);
    }

    let recentOrdersBuilder = adminClient
      .from('orders')
      .select('id, created_at, customer_name, total_amount, order_status, payment_status');

    if (profile.role === 'factory') {
      const { data: factoryOrderIds } = await adminClient
        .from('order_items')
        .select('order_id')
        .eq('assigned_manufacturer_id', profile.manufacturer_id);
      const ids = [...new Set((factoryOrderIds || []).map((i) => i.order_id))];
      if (ids.length === 0) {
        recentOrdersBuilder = recentOrdersBuilder.eq('id', 'none');
      } else {
        recentOrdersBuilder = recentOrdersBuilder.in('id', ids);
      }
    }

    const { data: recentOrders, error: recentOrdersError } = await recentOrdersBuilder
      .order('created_at', { ascending: false })
      .limit(6);

    if (recentOrdersError) {
      throw new Error(recentOrdersError.message);
    }

    const baseCounts = {
      orders_total: ordersTotal,
      orders_payment_completed: ordersPaymentCompleted,
      orders_in_production: ordersInProduction,
      orders_shipping: ordersShipping,
      orders_delivered: ordersDelivered,
      orders_cancelled: ordersCancelled,
    };

    if (profile.role === 'factory') {
      return NextResponse.json({
        data: {
          role: profile.role,
          counts: baseCounts,
          recentOrders: recentOrders || [],
        },
      });
    }

    const [
      productsTotal,
      productsActive,
      usersTotal,
      usersAdmin,
      usersFactory,
      usersCustomer,
      factoriesTotal,
      inquiriesPending,
    ] = await Promise.all([
      countQuery(adminClient.from('products').select('id', { count: 'exact', head: true })),
      countQuery(adminClient.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true)),
      countQuery(adminClient.from('profiles').select('id', { count: 'exact', head: true })),
      countQuery(adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')),
      countQuery(adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'factory')),
      countQuery(adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer')),
      countQuery(adminClient.from('manufacturers').select('id', { count: 'exact', head: true })),
      countQuery(adminClient.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    ]);

    return NextResponse.json({
      data: {
        role: profile.role,
        counts: {
          ...baseCounts,
          orders_unassigned: ordersUnassigned,
          products_total: productsTotal,
          products_active: productsActive,
          users_total: usersTotal,
          users_admin: usersAdmin,
          users_factory: usersFactory,
          users_customer: usersCustomer,
          factories_total: factoriesTotal,
          inquiries_pending: inquiriesPending,
        },
        recentOrders: recentOrders || [],
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '대시보드 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
