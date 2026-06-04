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

/** 정산 주기·지급일로 다음 지급 예정일(YYYY-MM-DD) 계산. per_order/manual은 null. */
function computeNextPaymentDate(cycle: string | null, day: number | null): string | null {
  const now = new Date();
  if (cycle === 'monthly') {
    const d = day && day >= 1 && day <= 31 ? day : 10;
    let t = new Date(now.getFullYear(), now.getMonth(), d);
    if (t.getTime() <= now.getTime()) t = new Date(now.getFullYear(), now.getMonth() + 1, d);
    return t.toISOString().slice(0, 10);
  }
  if (cycle === 'weekly') {
    const wd = day != null && day >= 0 && day <= 6 ? day : 5;
    const t = new Date(now);
    const diff = ((wd - now.getDay() + 7) % 7) || 7;
    t.setDate(now.getDate() + diff);
    return t.toISOString().slice(0, 10);
  }
  return null; // per_order, manual
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
    // status 필터는 목록에만 적용(집계는 항상 전체 기준) — 아래 JS에서 처리.

    const { data: items, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 공장 정보·정산 설정 별도 조회(조인 의존 회피)
    const factoryIds = [...new Set((items || []).map((i) => i.assigned_manufacturer_id).filter(Boolean))] as string[];
    const mfgById = new Map<string, { name: string; payment_cycle: string | null; payment_day: number | null; payment_memo: string | null }>();
    if (factoryIds.length > 0) {
      const { data: mfgs } = await admin
        .from('manufacturers')
        .select('id, name, payment_cycle, payment_day, payment_memo')
        .in('id', factoryIds);
      for (const m of mfgs || []) {
        mfgById.set(m.id, { name: m.name, payment_cycle: m.payment_cycle, payment_day: m.payment_day, payment_memo: m.payment_memo });
      }
    }

    // 공장별 집계 (+ 정산 주기·다음 지급예정일)
    type Sum = {
      factory_id: string; factory_name: string;
      payment_cycle: string; payment_day: number | null; payment_memo: string | null; next_payment_date: string | null;
      pending_amount: number; pending_count: number; paid_amount: number; paid_count: number; total_count: number;
    };
    const byFactory = new Map<string, Sum>();
    const enriched = (items || []).map((it) => {
      const fid = it.assigned_manufacturer_id as string;
      const mfg = mfgById.get(fid);
      const fname = mfg?.name || '(미지정 공장)';
      if (!byFactory.has(fid)) {
        const cycle = mfg?.payment_cycle || 'monthly';
        const dayVal = mfg?.payment_day ?? null;
        byFactory.set(fid, {
          factory_id: fid, factory_name: fname,
          payment_cycle: cycle, payment_day: dayVal, payment_memo: mfg?.payment_memo ?? null,
          next_payment_date: computeNextPaymentDate(cycle, dayVal),
          pending_amount: 0, pending_count: 0, paid_amount: 0, paid_count: 0, total_count: 0,
        });
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

    // 다음 지급 예정일 임박 순(없는 건 뒤로), 그 다음 미지급액 큰 순
    const summary = Array.from(byFactory.values()).sort((a, b) => {
      if (a.next_payment_date && b.next_payment_date) {
        if (a.next_payment_date !== b.next_payment_date) return a.next_payment_date < b.next_payment_date ? -1 : 1;
        return b.pending_amount - a.pending_amount;
      }
      if (a.next_payment_date) return -1;
      if (b.next_payment_date) return 1;
      return b.pending_amount - a.pending_amount;
    });

    // 목록만 상태 필터(집계 summary는 전체 기준 유지)
    const visibleItems =
      status === 'pending'
        ? enriched.filter((it) => it.factory_payment_status !== 'completed')
        : status === 'completed'
        ? enriched.filter((it) => it.factory_payment_status === 'completed')
        : enriched;

    return NextResponse.json({ data: { items: visibleItems, summary } });
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
