import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  featureDisabledResponse,
  isOrderAssignmentEnabled,
  requireAssignmentActor,
} from '@/lib/admin/orderAssignment';

/**
 * 배정 후보 직원 목록.
 *
 * super_admin 전용이다. 일반 admin 은 본인 claim 만 하므로 목록이 필요 없고,
 * 목록을 열어주면 타인 배정 UI 를 시도할 여지가 생긴다 (계획서 §26.4).
 */
export async function GET() {
  try {
    const auth = await requireAssignmentActor();
    if (auth.error) return auth.error;
    if (!isOrderAssignmentEnabled()) return featureDisabledResponse();

    if (!auth.actor.isSuper) {
      return NextResponse.json({ error: '슈퍼 관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('id, name, email')
      .eq('can_receive_orders', true)
      .order('name', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: { assignees: data ?? [] } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '배정 대상 목록을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
