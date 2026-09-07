import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { createAdminClient } from '@/lib/supabase-admin';
import { fetchAccountSummary, fetchInsightsDaily } from '@/lib/meta-ads';
import { addDays, calendarComparison, dayKey, kstIso, validateYmd } from '@/lib/analytics/time';
import { isTestOrder, revenueState } from '@/lib/analytics/revenue';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type OrderRow = { id: string; utm_campaign: string | null; total_amount: number | null; payment_status: string | null; order_status: string | null; created_at: string };
type Metrics = Record<'spend' | 'impressions' | 'clicks' | 'reach' | 'ctr' | 'cpc' | 'revenue' | 'orders' | 'roas', number | null>;
const emptyMetrics: Metrics = { spend: null, impressions: null, clicks: null, reach: null, ctr: null, cpc: null, revenue: null, orders: null, roas: null };
const message = (e: unknown) => e instanceof Error ? e.message : '데이터 조회 실패';

// 주문 생성일 기준 현재 유효 결제금액이며, 결제일/입금일 매출이 아니다.
async function dbRevenueRange(admin: SupabaseClient, fromYmd: string, toYmd: string) {
  let total = 0;
  let orders = 0;
  const byDate = new Map<string, number>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.from('orders')
      .select('id,utm_campaign,total_amount,payment_status,order_status,created_at')
      .gte('created_at', kstIso(fromYmd)).lt('created_at', kstIso(toYmd))
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as OrderRow[];
    for (const order of rows) {
      if (isTestOrder(order) || revenueState(order) !== 'paid') continue;
      const amount = Number(order.total_amount ?? 0);
      total += amount;
      orders += 1;
      const date = dayKey(order.created_at);
      byDate.set(date, (byDate.get(date) ?? 0) + amount);
    }
    if (rows.length < PAGE) break;
  }
  return { total, orders, byDate };
}

async function computeMetrics(admin: SupabaseClient, fromYmd: string, toYmd: string) {
  if (fromYmd >= toYmd) return { metrics: { ...emptyMetrics }, byDate: new Map<string, number>(), metaError: null as string | null, dbError: null as string | null };
  const [meta, db] = await Promise.allSettled([
    fetchAccountSummary(fromYmd, addDays(toYmd, -1)),
    dbRevenueRange(admin, fromYmd, toYmd),
  ]);
  const summary = meta.status === 'fulfilled' ? meta.value : null;
  const revenue = db.status === 'fulfilled' ? db.value : null;
  return {
    metrics: {
      spend: summary?.spend ?? null,
      impressions: summary?.impressions ?? null,
      clicks: summary?.clicks ?? null,
      reach: summary?.reach ?? null,
      ctr: summary && summary.impressions > 0 ? summary.clicks / summary.impressions * 100 : null,
      cpc: summary && summary.clicks > 0 ? summary.spend / summary.clicks : null,
      revenue: revenue?.total ?? null,
      orders: revenue?.orders ?? null,
      roas: summary && summary.spend > 0 && revenue ? revenue.total / summary.spend * 100 : null,
    } satisfies Metrics,
    byDate: revenue?.byDate ?? new Map<string, number>(),
    metaError: meta.status === 'rejected' ? message(meta.reason) : null,
    dbError: db.status === 'rejected' ? message(db.reason) : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;
    const { searchParams } = new URL(req.url);
    const fromYmd = searchParams.get('from') || '';
    const toYmd = searchParams.get('to') || '';
    if (!validateYmd(fromYmd) || !validateYmd(toYmd) || fromYmd >= toYmd || Date.parse(toYmd) - Date.parse(fromYmd) > 732 * 86400000) {
      return NextResponse.json({ error: '유효한 from/to 날짜와 최대 732일의 조회 기간이 필요합니다.' }, { status: 400 });
    }
    const asOf = new Date();
    const comparison = calendarComparison(fromYmd, toYmd, asOf);
    const today = dayKey(asOf);
    const currentRange = { fromYmd, toYmd: fromYmd >= today ? fromYmd : (toYmd < today ? toYmd : today) };
    const comparisonDiffers = comparison.current.fromYmd !== currentRange.fromYmd || comparison.current.toYmd !== currentRange.toYmd;
    const previousRange = comparison.previous;
    const hasCompleteDays = currentRange.fromYmd < currentRange.toYmd;
    const admin = createAdminClient();
    const [cur, prv, dailyResult, pairedCurrent] = await Promise.all([
      computeMetrics(admin, currentRange.fromYmd, currentRange.toYmd),
      computeMetrics(admin, previousRange.fromYmd, previousRange.toYmd),
      hasCompleteDays
        ? fetchInsightsDaily(currentRange.fromYmd, addDays(currentRange.toYmd, -1))
            .then(rows => ({ rows, error: null as string | null }))
            .catch((e: unknown) => ({ rows: [], error: message(e) }))
        : Promise.resolve({ rows: [], error: null as string | null }),
      comparisonDiffers ? computeMetrics(admin, comparison.current.fromYmd, comparison.current.toYmd) : Promise.resolve(null),
    ]);
    const spendByDate = new Map<string, number>();
    for (const row of dailyResult.rows) {
      spendByDate.set(row.date_start, (spendByDate.get(row.date_start) ?? 0) + Number(row.spend || 0));
    }
    const daily = [];
    for (let date = currentRange.fromYmd; date < currentRange.toYmd; date = addDays(date, 1)) {
      daily.push({
        date,
        spend: dailyResult.error ? null : Math.round(spendByDate.get(date) ?? 0),
        revenue: cur.dbError ? null : Math.round(cur.byDate.get(date) ?? 0),
      });
    }
    return NextResponse.json({ data: {
      range: { from: fromYmd, to: toYmd },
      effectiveRange: { from: currentRange.fromYmd, to: currentRange.toYmd },
      comparisonRange: { from: comparison.current.fromYmd, to: comparison.current.toYmd },
      previousRange: { from: previousRange.fromYmd, to: previousRange.toYmd },
      generatedAt: asOf.toISOString(),
      dateBasis: 'created_at',
      hasCompleteDays,
      current: cur.metrics,
      comparisonCurrent: (pairedCurrent ?? cur).metrics,
      comparisonCurrentError: pairedCurrent ? pairedCurrent.metaError || pairedCurrent.dbError : null,
      previous: prv.metrics,
      daily,
      metaError: cur.metaError,
      previousMetaError: prv.metaError,
      dailyMetaError: dailyResult.error,
      dbError: cur.dbError,
      previousDbError: prv.dbError,
    } });
  } catch (e) {
    console.error('[ad-efficiency] error:', e);
    return NextResponse.json({ error: message(e) }, { status: 500 });
  }
}
