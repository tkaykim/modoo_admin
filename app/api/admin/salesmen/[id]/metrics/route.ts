import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';
import { periodToRange, type GradeLevelRow, type SalesmanProfile } from '@/lib/salesmen';

interface MonthlyPoint {
  period: string;
  revenue: number;
  commission: number;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const url = new URL(req.url);
  const monthsParam = Number(url.searchParams.get('months') ?? '12');
  const months = Math.min(36, Math.max(1, monthsParam));

  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from('salesman_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: '영업사원을 찾을 수 없습니다.' }, { status: 404 });
  const sp = profile as SalesmanProfile;

  const now = new Date();
  const periods: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    periods.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const rangeStart = periodToRange(periods[0]).start;
  const rangeEnd = periodToRange(periods[periods.length - 1]).end;

  const [{ data: orders }, { data: gradeLevels }, { data: teams }, { data: malls }] = await Promise.all([
    admin
      .from('orders')
      .select('total_amount, created_at')
      .eq('salesman_id', id)
      .gte('created_at', rangeStart)
      .lt('created_at', rangeEnd),
    admin.from('salesman_grade_levels').select('level, commission_rate'),
    admin.from('teams').select('id, name').eq('salesman_id', id),
    admin
      .from('partner_malls')
      .select('id, slug, status')
      .eq('salesman_id', id),
  ]);

  const rate =
    ((gradeLevels ?? []) as GradeLevelRow[]).find((g) => g.level === sp.grade)?.commission_rate ?? 0;

  const revenueMap = new Map<string, number>();
  for (const o of (orders ?? []) as Array<{ total_amount: number | null; created_at: string }>) {
    const d = new Date(o.created_at);
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    revenueMap.set(period, (revenueMap.get(period) ?? 0) + Number(o.total_amount ?? 0));
  }

  const monthly: MonthlyPoint[] = periods.map((period) => {
    const revenue = revenueMap.get(period) ?? 0;
    return { period, revenue, commission: Math.floor(revenue * Number(rate)) };
  });

  return NextResponse.json({
    profile: sp,
    commission_rate: Number(rate),
    monthly,
    teams: teams ?? [],
    partner_malls: malls ?? [],
    active_team_count: (teams ?? []).length,
    active_partner_mall_count: ((malls ?? []) as Array<{ status: string | null }>).filter(
      (m) => !m.status || m.status === 'active'
    ).length,
  });
}
