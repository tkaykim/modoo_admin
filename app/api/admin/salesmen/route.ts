import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  GRADE_LEVELS,
  SALESMAN_STATUSES,
  currentYearMonth,
  periodToRange,
  type GradeLevelRow,
  type SalesmanProfile,
} from '@/lib/salesmen';

interface ListResponseItem extends SalesmanProfile {
  email: string | null;
  this_month_revenue: number;
  this_month_commission: number;
  active_team_count: number;
  active_partner_mall_count: number;
  mentor_display_name: string | null;
  last_revenue_period: string | null;
  inactive_months: number; // 마지막 매출 월 이후 경과 (0 = 이번 달 매출 있음)
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
  const q = url.searchParams.get('q')?.trim() ?? '';
  const status = url.searchParams.get('status') ?? 'all';
  const grade = url.searchParams.get('grade') ?? 'all';

  const admin = createAdminClient();

  let query = admin
    .from('salesman_profiles')
    .select('*', { count: 'exact' })
    .order('joined_at', { ascending: false });

  if (status !== 'all' && (SALESMAN_STATUSES as readonly string[]).includes(status)) {
    query = query.eq('status', status);
  }
  if (grade !== 'all' && (GRADE_LEVELS as string[]).includes(grade)) {
    query = query.eq('grade', grade);
  }
  if (q) {
    const escaped = q.replace(/[%,]/g, '');
    query = query.or(
      `display_name.ilike.%${escaped}%,salesman_code.ilike.%${escaped}%,phone.ilike.%${escaped}%`
    );
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: rows, count, error } = await query.range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const profiles = (rows ?? []) as SalesmanProfile[];
  if (profiles.length === 0) {
    return NextResponse.json({ data: [], total: 0, page, limit, totalPages: 0 });
  }

  const ids = profiles.map((p) => p.id);
  const userIds = profiles.map((p) => p.user_id);
  const mentorIds = Array.from(
    new Set(profiles.map((p) => p.mentor_id).filter((v): v is string => !!v))
  );
  const period = currentYearMonth();
  const { start, end } = periodToRange(period);

  const [
    { data: users },
    { data: gradeLevels },
    { data: monthlyOrders },
    { data: teamCounts },
    { data: mallCounts },
    { data: mentors },
    { data: lastRevenue },
  ] = await Promise.all([
    admin.from('profiles').select('id, email').in('id', userIds),
    admin
      .from('salesman_grade_levels')
      .select('level, commission_rate, label, monthly_revenue_threshold, display_order'),
    admin
      .from('orders')
      .select('salesman_id, total_amount')
      .in('salesman_id', ids)
      .gte('created_at', start)
      .lt('created_at', end),
    admin.from('teams').select('id, salesman_id').in('salesman_id', ids),
    admin
      .from('partner_malls')
      .select('id, salesman_id, status')
      .in('salesman_id', ids),
    mentorIds.length
      ? admin
          .from('salesman_profiles')
          .select('id, display_name')
          .in('id', mentorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null }> }),
    // 비활동 기간 산출용: 매출이 있었던 월 중 가장 최근
    admin
      .from('salesman_monthly_settlements')
      .select('salesman_id, settlement_period, gross_revenue')
      .in('salesman_id', ids)
      .gt('gross_revenue', 0)
      .order('settlement_period', { ascending: false }),
  ]);

  const emailByUser = new Map<string, string | null>();
  for (const u of (users ?? []) as Array<{ id: string; email: string | null }>) {
    emailByUser.set(u.id, u.email);
  }

  const rateByGrade = new Map<string, number>();
  for (const g of (gradeLevels ?? []) as GradeLevelRow[]) {
    rateByGrade.set(g.level, Number(g.commission_rate));
  }

  const revenueBySalesman = new Map<string, number>();
  for (const o of (monthlyOrders ?? []) as Array<{ salesman_id: string | null; total_amount: number | null }>) {
    if (!o.salesman_id) continue;
    revenueBySalesman.set(
      o.salesman_id,
      (revenueBySalesman.get(o.salesman_id) ?? 0) + Number(o.total_amount ?? 0)
    );
  }

  const teamCountBySalesman = new Map<string, number>();
  for (const t of (teamCounts ?? []) as Array<{ salesman_id: string | null }>) {
    if (!t.salesman_id) continue;
    teamCountBySalesman.set(t.salesman_id, (teamCountBySalesman.get(t.salesman_id) ?? 0) + 1);
  }

  const mallCountBySalesman = new Map<string, number>();
  for (const m of (mallCounts ?? []) as Array<{ salesman_id: string | null; status: string | null }>) {
    if (!m.salesman_id) continue;
    if (m.status && m.status !== 'active') continue;
    mallCountBySalesman.set(m.salesman_id, (mallCountBySalesman.get(m.salesman_id) ?? 0) + 1);
  }

  const mentorNameById = new Map<string, string | null>();
  for (const m of (mentors ?? []) as Array<{ id: string; display_name: string | null }>) {
    mentorNameById.set(m.id, m.display_name);
  }

  const lastPeriodBySalesman = new Map<string, string>();
  for (const r of (lastRevenue ?? []) as Array<{ salesman_id: string; settlement_period: string }>) {
    if (!lastPeriodBySalesman.has(r.salesman_id)) {
      lastPeriodBySalesman.set(r.salesman_id, r.settlement_period);
    }
  }

  const now = new Date();
  const monthsSince = (period: string | null): number => {
    if (!period) return Infinity;
    const [y, m] = period.split('-').map(Number);
    if (!y || !m) return Infinity;
    return (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
  };

  const data: ListResponseItem[] = profiles.map((p) => {
    const revenue = revenueBySalesman.get(p.id) ?? 0;
    const rate = rateByGrade.get(p.grade) ?? 0;
    const lastPeriod = lastPeriodBySalesman.get(p.id) ?? null;
    let inactive: number;
    if (revenue > 0) {
      inactive = 0;
    } else {
      const fromSettlement = monthsSince(lastPeriod);
      // 정산 기록이 전혀 없으면 가입일 기준
      if (!Number.isFinite(fromSettlement)) {
        const joined = new Date(p.joined_at);
        inactive =
          (now.getUTCFullYear() - joined.getUTCFullYear()) * 12 +
          (now.getUTCMonth() - joined.getUTCMonth());
      } else {
        inactive = fromSettlement;
      }
    }
    return {
      ...p,
      email: emailByUser.get(p.user_id) ?? null,
      this_month_revenue: revenue,
      this_month_commission: Math.floor(revenue * rate),
      active_team_count: teamCountBySalesman.get(p.id) ?? 0,
      active_partner_mall_count: mallCountBySalesman.get(p.id) ?? 0,
      mentor_display_name: p.mentor_id ? mentorNameById.get(p.mentor_id) ?? null : null,
      last_revenue_period: lastPeriod,
      inactive_months: Math.max(0, inactive),
    };
  });

  return NextResponse.json({
    data,
    total: count ?? data.length,
    page,
    limit,
    totalPages: Math.ceil((count ?? data.length) / limit),
  });
}
