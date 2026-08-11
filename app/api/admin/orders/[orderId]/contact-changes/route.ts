import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * 주문 연락처·성함 수정 이력 조회.
 *
 * 주문 상세에서 "이 번호가 원래 뭐였는지"를 즉시 확인하려는 용도다.
 * 원본 전화번호가 그대로 보여야 되돌리기·CS 확인이 가능해서 마스킹하지 않는다.
 * 대신 관리자(isAdminLike)만 볼 수 있게 막는다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await params;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || !isAdminLike(profile.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('order_contact_changes')
      .select('id, field, old_value, new_value, reason, changed_by_email, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ changes: data ?? [] });
  } catch (err) {
    console.error('[admin/orders/contact-changes] error:', err);
    return NextResponse.json({ error: '이력을 불러오지 못했습니다.' }, { status: 500 });
  }
}
