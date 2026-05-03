import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

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

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: '세션 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('cobuy_participants')
      .select('*')
      .eq('cobuy_session_id', sessionId)
      .order('joined_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '참여자 정보를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: '요청 데이터가 필요합니다.' }, { status: 400 });
    }

    const { sessionId, name, email, phone, selectedItems, fieldResponses, deliveryMethod, deliveryInfo, deliveryFee, paymentAmount, paymentStatus } = payload;

    if (!sessionId || !name || !email || !selectedItems || !Array.isArray(selectedItems) || selectedItems.length === 0) {
      return NextResponse.json({ error: '필수 필드가 누락되었습니다. (sessionId, name, email, selectedItems)' }, { status: 400 });
    }

    const totalQuantity = selectedItems.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
    const selectedSize = selectedItems.map((i: { size: string; quantity: number }) => `${i.size}(${i.quantity})`).join(', ');

    const adminClient = createAdminClient();

    const { data: session, error: sessionError } = await adminClient
      .from('cobuy_sessions')
      .select('id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    const resolvedPaymentStatus = paymentStatus || 'pending';
    const resolvedPaymentAmount = typeof paymentAmount === 'number' ? paymentAmount : 0;

    const { data: participant, error: insertError } = await adminClient
      .from('cobuy_participants')
      .insert({
        cobuy_session_id: sessionId,
        name,
        email,
        phone: phone || null,
        selected_size: selectedSize,
        selected_size_code: null,
        selected_items: selectedItems,
        total_quantity: totalQuantity,
        field_responses: fieldResponses || {},
        delivery_method: deliveryMethod || null,
        delivery_info: deliveryInfo || null,
        delivery_fee: deliveryFee || 0,
        pickup_status: 'pending',
        payment_status: resolvedPaymentStatus,
        payment_amount: resolvedPaymentAmount,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: '이미 해당 이메일로 참여한 참여자가 존재합니다.' }, { status: 409 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ data: participant });
  } catch (error) {
    const message = error instanceof Error ? error.message : '참여자 추가에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: '요청 데이터가 필요합니다.' }, { status: 400 });
    }

    const { participantId, ...updates } = payload;

    if (!participantId) {
      return NextResponse.json({ error: '참여자 ID가 필요합니다.' }, { status: 400 });
    }

    const allowedFields: Record<string, string> = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      selectedItems: 'selected_items',
      totalQuantity: 'total_quantity',
      selectedSize: 'selected_size',
      fieldResponses: 'field_responses',
      deliveryMethod: 'delivery_method',
      deliveryInfo: 'delivery_info',
      deliveryFee: 'delivery_fee',
      pickupStatus: 'pickup_status',
      paymentStatus: 'payment_status',
      paymentAmount: 'payment_amount',
    };

    const updateData: Record<string, unknown> = {};
    for (const [key, dbField] of Object.entries(allowedFields)) {
      if (updates[key] !== undefined) {
        updateData[dbField] = updates[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: participant, error } = await adminClient
      .from('cobuy_participants')
      .update(updateData)
      .eq('id', participantId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: participant });
  } catch (error) {
    const message = error instanceof Error ? error.message : '참여자 수정에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const participantId = url.searchParams.get('participantId');

    if (!participantId) {
      return NextResponse.json({ error: '참여자 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: participant, error: fetchError } = await adminClient
      .from('cobuy_participants')
      .select('cobuy_session_id, payment_status, total_quantity')
      .eq('id', participantId)
      .single();

    if (fetchError || !participant) {
      return NextResponse.json({ error: '참여자를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (participant.payment_status === 'completed') {
      const { data: session } = await adminClient
        .from('cobuy_sessions')
        .select('current_participant_count, current_total_quantity')
        .eq('id', participant.cobuy_session_id)
        .single();

      if (session) {
        await adminClient
          .from('cobuy_sessions')
          .update({
            current_participant_count: Math.max(0, session.current_participant_count - 1),
            current_total_quantity: Math.max(0, (session.current_total_quantity || 0) - (participant.total_quantity || 0)),
          })
          .eq('id', participant.cobuy_session_id);
      }
    }

    const { error: deleteError } = await adminClient
      .from('cobuy_participants')
      .delete()
      .eq('id', participantId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '참여자 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
