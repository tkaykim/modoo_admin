import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;

async function refundToss(paymentKey: string, reason: string, amount?: number) {
  if (!TOSS_SECRET_KEY) {
    throw new Error('토스 시크릿 키가 설정되지 않았습니다.');
  }

  const body: Record<string, unknown> = { cancelReason: reason };
  if (amount !== undefined) {
    body.cancelAmount = amount;
  }

  const response = await fetch(
    `https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('Toss refund error:', data);
    throw new Error(data.message || '토스 환불 처리에 실패했습니다.');
  }

  return data;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (!isAdminLike(profile.role))) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const participantId = payload?.participantId;
    const reason = payload?.reason;
    const refundAmount = payload?.amount;

    if (!participantId || typeof participantId !== 'string') {
      return NextResponse.json({ error: '참여자 ID가 필요합니다.' }, { status: 400 });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: '환불 사유를 입력해주세요.' }, { status: 400 });
    }

    if (refundAmount !== undefined && (typeof refundAmount !== 'number' || refundAmount <= 0)) {
      return NextResponse.json({ error: '환불 금액이 올바르지 않습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: participant, error: participantError } = await adminClient
      .from('cobuy_participants')
      .select('id, cobuy_session_id, payment_key, payment_status, payment_amount, total_quantity')
      .eq('id', participantId)
      .single();

    if (participantError || !participant) {
      return NextResponse.json({ error: '참여자를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (participant.payment_status !== 'completed') {
      return NextResponse.json(
        { error: '결제 완료 상태의 참여자만 환불할 수 있습니다.' },
        { status: 400 }
      );
    }

    if (!participant.payment_key) {
      return NextResponse.json(
        { error: '결제 키가 없어 환불을 처리할 수 없습니다.' },
        { status: 400 }
      );
    }

    if (refundAmount !== undefined && participant.payment_amount && refundAmount > participant.payment_amount) {
      return NextResponse.json(
        { error: '환불 금액이 결제 금액을 초과할 수 없습니다.' },
        { status: 400 }
      );
    }

    const isFullRefund = refundAmount === undefined || refundAmount === participant.payment_amount;

    const refundResult = await refundToss(
      participant.payment_key,
      reason,
      isFullRefund ? undefined : refundAmount
    );

    const updateData: Record<string, unknown> = {};
    if (isFullRefund) {
      updateData.payment_status = 'refunded';
    }

    const { data: updatedParticipant, error: updateError } = await adminClient
      .from('cobuy_participants')
      .update(updateData)
      .eq('id', participantId)
      .select()
      .single();

    if (isFullRefund) {
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

    if (updateError) {
      console.error('Participant update error after refund:', updateError);
      return NextResponse.json({
        data: updatedParticipant,
        warning: '환불은 처리되었으나 상태 업데이트에 실패했습니다.',
        refundResult,
      });
    }

    return NextResponse.json({
      data: updatedParticipant,
      refundResult,
      isFullRefund,
    });
  } catch (error) {
    console.error('CoBuy refund error:', error);
    const message = error instanceof Error ? error.message : '환불 처리 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
