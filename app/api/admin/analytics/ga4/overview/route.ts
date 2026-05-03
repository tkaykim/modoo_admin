import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { campaigns, revenue, funnel, traffic } from '@/lib/ga4/reports';

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

    const [campaignsRows, revenueRows, funnelRows, trafficRows] = await Promise.all([
      campaigns(days),
      revenue(days),
      funnel(days),
      traffic(days),
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
        funnel: funnelRows,
        trafficDaily,
        summary: {
          totalSessions,
          totalUsers,
          totalRevenue,
          totalTransactions,
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
