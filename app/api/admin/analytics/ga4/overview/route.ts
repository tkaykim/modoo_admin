import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { campaigns, revenue, funnel, traffic } from '@/lib/ga4/reports';
import { createAdminClient } from '@/lib/supabase-admin';

// DB 실매출 (KST 기준 최근 N일). order_profit_summary 정의와 동일: payment 완료 & 취소/환불 제외.
async function fetchDbRevenue(days: number): Promise<{
  total: number;
  transactions: number;
  byDate: { date: string; totalRevenue: number; transactions: number }[];
}> {
  const kstNow = new Date(Date.now() + 9 * 60 * 60000);
  const startKst = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() - days));
  const sinceIso = new Date(startKst.getTime() - 9 * 60 * 60000).toISOString();

  const admin = createAdminClient();
  const rows: { total_amount: number | null; payment_status: string | null; order_status: string | null; created_at: string }[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from('orders')
      .select('total_amount, payment_status, order_status, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  const byDateMap = new Map<string, { totalRevenue: number; transactions: number }>();
  let total = 0;
  let transactions = 0;
  for (const o of rows) {
    const confirmed = o.payment_status === 'completed' && o.order_status !== 'cancelled';
    if (!confirmed) continue;
    const kst = new Date(new Date(o.created_at).getTime() + 9 * 60 * 60000);
    const key = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`;
    const cur = byDateMap.get(key) ?? { totalRevenue: 0, transactions: 0 };
    cur.totalRevenue += Number(o.total_amount ?? 0);
    cur.transactions += 1;
    byDateMap.set(key, cur);
    total += Number(o.total_amount ?? 0);
    transactions += 1;
  }
  const byDate = [...byDateMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { total, transactions, byDate };
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RevenueRow = { date: string; sessionSourceMedium: string; totalRevenue: number; transactions: number; purchaseRevenue: number; averagePurchaseRevenue: number };
type TrafficRow = { date: string; sessionSourceMedium: string; sessions: number; totalUsers: number; screenPageViews: number; engagementRate: number };
type CampaignRow = { sessionSource: string; sessionMedium: string; sessionCampaignName: string; sessions: number; totalUsers: number; conversions: number; totalRevenue: number };

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(365, Number(searchParams.get('days') ?? 30)));

    const [campaignsRows, revenueRows, funnelRows, trafficRows, dbRevenue] = await Promise.all([
      campaigns(days),
      revenue(days),
      funnel(days),
      traffic(days),
      fetchDbRevenue(days),
    ]);

    const cs = campaignsRows as unknown as CampaignRow[];
    const rs = revenueRows as unknown as RevenueRow[];
    const ts = trafficRows as unknown as TrafficRow[];

    const totalSessions = cs.reduce((s, r) => s + Number(r.sessions || 0), 0);
    const totalUsers = cs.reduce((s, r) => s + Number(r.totalUsers || 0), 0);
    const totalRevenue = rs.reduce((s, r) => s + Number(r.totalRevenue || 0), 0);
    const totalTransactions = rs.reduce((s, r) => s + Number(r.transactions || 0), 0);
    const paidSessions = cs.filter((r) => r.sessionMedium === 'paid').reduce((s, r) => s + Number(r.sessions || 0), 0);
    const organicSessions = cs.filter((r) => r.sessionMedium === 'organic').reduce((s, r) => s + Number(r.sessions || 0), 0);

    const revenueByDateMap = new Map<string, { totalRevenue: number; transactions: number }>();
    for (const r of rs) {
      const cur = revenueByDateMap.get(r.date) ?? { totalRevenue: 0, transactions: 0 };
      cur.totalRevenue += Number(r.totalRevenue || 0);
      cur.transactions += Number(r.transactions || 0);
      revenueByDateMap.set(r.date, cur);
    }
    const revenueByDate = [...revenueByDateMap.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const trafficDailyMap = new Map<string, { sessions: number; totalUsers: number; screenPageViews: number }>();
    for (const r of ts) {
      const cur = trafficDailyMap.get(r.date) ?? { sessions: 0, totalUsers: 0, screenPageViews: 0 };
      cur.sessions += Number(r.sessions || 0);
      cur.totalUsers += Number(r.totalUsers || 0);
      cur.screenPageViews += Number(r.screenPageViews || 0);
      trafficDailyMap.set(r.date, cur);
    }
    const trafficDaily = [...trafficDailyMap.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      data: {
        range: { days },
        campaigns: campaignsRows,
        revenueByDate,
        dbRevenueByDate: dbRevenue.byDate,
        funnel: funnelRows,
        trafficDaily,
        summary: {
          totalSessions,
          totalUsers,
          totalRevenue,
          totalTransactions,
          dbRevenue: dbRevenue.total,
          dbTransactions: dbRevenue.transactions,
          paidSessions,
          organicSessions,
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    const stack = e instanceof Error ? e.stack : undefined;
    console.error('[ga4/overview] error:', e);
    return NextResponse.json({ error: msg, stack }, { status: 500 });
  }
}
