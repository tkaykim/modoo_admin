import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * 공장 정산 주기 설정 (super_admin 전용).
 * manufacturers.payment_cycle / payment_day / payment_memo 만 변경 — 고객 결제와 무관.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !isSuperAdmin(profile.role)) {
      return NextResponse.json({ error: '권한이 필요합니다.' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const factoryId = payload?.factoryId;
    if (!factoryId) return NextResponse.json({ error: '공장 ID가 필요합니다.' }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (payload?.paymentCycle !== undefined) {
      const validCycles = ['monthly', 'weekly', 'per_order', 'manual'];
      if (!validCycles.includes(payload.paymentCycle)) {
        return NextResponse.json({ error: '유효하지 않은 정산 주기입니다.' }, { status: 400 });
      }
      update.payment_cycle = payload.paymentCycle;
    }
    if (payload?.paymentDay !== undefined) {
      const d = payload.paymentDay;
      update.payment_day = d === null || d === '' ? null : Number(d);
    }
    if (payload?.paymentMemo !== undefined) {
      update.payment_memo = payload.paymentMemo || null;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('manufacturers').update(update).eq('id', factoryId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { id: factoryId } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '처리에 실패했습니다.' }, { status: 500 });
  }
}
