import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

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

  return { user, profile };
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
      .select('id, cobuy_session_id, order_category')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message || '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (authResult.profile.role === 'factory') {
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

    if (order.order_category !== 'cobuy') {
      return NextResponse.json({ data: { sessionId: null, participants: [] } });
    }

    let sessionId: string | null = order.cobuy_session_id || null;

    if (!sessionId) {
      const { data: session, error: sessionError } = await adminClient
        .from('cobuy_sessions')
        .select('id')
        .eq('bulk_order_id', orderId)
        .maybeSingle();

      if (sessionError) {
        return NextResponse.json({ error: sessionError.message }, { status: 500 });
      }

      sessionId = session?.id || null;
    }

    if (!sessionId) {
      return NextResponse.json({ data: { sessionId: null, participants: [] } });
    }

    const { data: participants, error: participantError } = await adminClient
      .from('cobuy_participants')
      .select('id, cobuy_session_id, name, email, phone, selected_size, payment_status, payment_amount, paid_at, joined_at')
      .eq('cobuy_session_id', sessionId)
      .order('joined_at', { ascending: true });

    if (participantError) {
      return NextResponse.json({ error: participantError.message }, { status: 500 });
    }

    return NextResponse.json({ data: { sessionId, participants: participants || [] } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '참여자 정보를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
