import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * 공장 지급 관리 API (super_admin 전용).
 *
 * 읽고/쓰는 것은 order_items의 공장 지급 필드(factory_amount, factory_payment_status,
 * factory_payment_date, factory_price_locked)뿐 — 고객 결제/주문총액과 무관하다.
 *
 * GET: 공장별 지급 집계 + 품목 목록.
 * PATCH: 선택 품목 지급 상태/지급일 일괄 변경.
 */

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요합니다.', status: 401 };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !isSuperAdmin(profile.role)) {
    return { ok: false as const, error: '권한이 필요합니다.', status: 403 };
  }
  return { ok: true as const, userId: user.id };
}

export async function GET(request: Request) {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // pending | completed | all (기본 all)
    const factoryId = searchParams.get('factoryId');

    const admin = createAdminClient();

    let q = admin
      .from('order_items')
      .select(
        'id, order_id, product_title, design_title, quantity, factory_amount, factory_status, factory_payment_status, factory_payment_date, factory_price_locked, assigned_manufacturer_id, deadline, created_at'
      )
      .not('assigned_manufacturer_id', 'is', null)
      .gt('factory_amount', 0)
      .order('deadline', { ascending: true, nullsFirst: false });

    if (factoryId) q = q.eq('assigned_manufacturer_id', factoryId);
    if (status === 'pending') q = q.or('factory_payment_status.is.null,factory_payment_status.eq.pending');
    else if (status === 'completed') q = q.eq('factory_payment_status', 'completed');

    const { data: items, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 공장명 별도 조회(조인 의존 회피)
    const factoryIds = [...new Set((items || []).map((i) => i.assigned_manufacturer_id).filter(Boolean))] as string[];
    const nameById = new Map<string, string>();
    if (factoryIds.length > 0) {
      const { data: mfgs } = await admin.from('manufacturers').select('id, name').in('id', factoryIds);
      for (const m of mfgs || []) nameById.set(m.id, m.name);
    }

    // 공장별 집계
    const byFactory = new Map<
      string,
      { factory_id: string; factory_name: string; pending_amount: number; pending_count: number; paid_amount: number; paid_count: number; total_count: number }
    >();
    const enriched = (items || []).map((it) => {
      const fid = it.assigned_manufacturer_id as string;
      const fname = nameById.get(fid) || '(미지정 공장)';
      if (!byFactory.has(fid)) {
        byFactory.set(fid, { factory_id: fid, factory_name: fname, pending_amount: 0, pending_count: 0, paid_amount: 0, paid_count: 0, total_count: 0 });
      }
      const g = byFactory.get(fid)!;
      g.total_count++;
      const amt = Number(it.factory_amount || 0);
      if (it.factory_payment_status === 'completed') {
        g.paid_amount += amt;
        g.paid_count++;
      } else {
        g.pending_amount += amt;
        g.pending_count++;
      }
      return { ...it, factory_name: fname };
    });

    const summary = Array.from(byFactory.values()).sort((a, b) => b.pending_amount - a.pending_amount);
    return NextResponse.json({ data: { items: enriched, summary } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const payload = await request.json().catch(() => null);
    const orderItemIds: string[] = Array.isArray(payload?.orderItemIds) ? payload.orderItemIds : [];
    const newStatus = payload?.factoryPaymentStatus;
    const paymentDate = payload?.factoryPaymentDate; // 'YYYY-MM-DD' | null | undefined

    if (orderItemIds.length === 0) {
      return NextResponse.json({ error: '대상 항목이 없습니다.' }, { status: 400 });
    }
    const valid = ['pending', 'completed', 'cancelled'];
    if (!valid.includes(newStatus)) {
      return NextResponse.json({ error: '유효하지 않은 지급 상태입니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const update: Record<string, unknown> = {
      factory_payment_status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === 'completed') {
      // 지급 완료: 지급일 기록(미지정 시 오늘)
      update.factory_payment_date = paymentDate || new Date().toISOString().slice(0, 10);
    } else if (newStatus === 'pending') {
      update.factory_payment_date = null;
    } else if (paymentDate !== undefined) {
      update.factory_payment_date = paymentDate;
    }

    const { error } = await admin.from('order_items').update(update).in('id', orderItemIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: { updated: orderItemIds.length } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '처리에 실패했습니다.' }, { status: 500 });
  }
}
