import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { createAdminClient } from '@/lib/supabase-admin';
import { fetchAccountSummary, fetchInsightsDaily } from '@/lib/meta-ads';
import { previousPeriodYmd, todayKstYmd } from '@/lib/analytics/period';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

// KST 'YYYY-MM-DD' 00:00 → UTC ISO
function kstYmdToUtcIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00+09:00`).toISOString();
}
// to(exclusive) → Meta until(inclusive) = to - 1일
function prevDayYmd(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function kstDateKey(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}

type OrderRow = { total_amount: number | null; payment_status: string | null; order_status: string | null; created_at: string };

// DB 실매출 (KST [from, to)). order_profit_summary 정의와 동일: 결제완료 & 취소 제외.
async function dbRevenueRange(admin: SupabaseClient, fromYmd: string, toYmd: string) {
  const sinceIso = kstYmdToUtcIso(fromYmd);
  const untilIso = kstYmdToUtcIso(toYmd);
  const rows: OrderRow[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from('orders')
      .select('total_amount,payment_status,order_status,created_at')
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const b = (data ?? []) as OrderRow[];
    rows.push(...b);
    if (b.length < PAGE) break;
    from += PAGE;
  }
  let total = 0;
  let orders = 0;
  const byDate = new Map<string, number>();
  for (const o of rows) {
    if (!(o.payment_status === 'completed' && o.order_status !== 'cancelled')) continue;
    const amt = Number(o.total_amount ?? 0);
    total += amt;
    orders += 1;
    const k = kstDateKey(o.created_at);
    byDate.set(k, (byDate.get(k) ?? 0) + amt);
  }
  return { total, orders, byDate };
}

type Metrics = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpc: number;
  revenue: number;
  orders: number;
  roas: number; // 전체 실매출 ÷ 광고비 × 100 (광고 단독 귀속 아님)
};

async function computeMetrics(
  admin: SupabaseClient,
  fromYmd: string,
  toYmd: string,
): Promise<{ metrics: Metrics; byDate: Map<string, number>; metaError: string | null }> {
  const since = fromYmd;
  // Meta until(inclusive)은 미래로 못 가므로 오늘로 클램프. since>until(전부 미래)이면 Meta 생략.
  const untilRaw = prevDayYmd(toYmd);
  const today = todayKstYmd();
  const until = untilRaw > today ? today : untilRaw;
  const metaApplicable = since <= until;
  let metaError: string | null = null;
  let summary = { spend: 0, impressions: 0, clicks: 0, reach: 0 };
  const [summaryRes, db] = await Promise.all([
    metaApplicable
      ? fetchAccountSummary(since, until).catch((e: unknown) => {
          metaError = e instanceof Error ? e.message : 'Meta API error';
          return null;
        })
      : Promise.resolve(null),
    dbRevenueRange(admin, fromYmd, toYmd),
  ]);
  if (summaryRes) summary = summaryRes;
  const ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;
  const cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0;
  const roas = summary.spend > 0 ? (db.total / summary.spend) * 100 : 0;
  return {
    metrics: {
      spend: summary.spend,
      impressions: summary.impressions,
      clicks: summary.clicks,
      reach: summary.reach,
      ctr,
      cpc,
      revenue: db.total,
      orders: db.orders,
      roas,
    },
    byDate: db.byDate,
    metaError,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const fromYmd = searchParams.get('from') || '';
    const toYmd = searchParams.get('to') || '';
    if (!YMD.test(fromYmd) || !YMD.test(toYmd) || fromYmd >= toYmd) {
      return NextResponse.json({ error: 'from/to (YYYY-MM-DD, from<to exclusive) 필요' }, { status: 400 });
    }

    const admin = createAdminClient();
    const prev = previousPeriodYmd({ fromYmd, toYmd, bucket: 'day', label: '', atCurrent: false });
    const today = todayKstYmd();
    const dailyUntilRaw = prevDayYmd(toYmd);
    const dailyUntil = dailyUntilRaw > today ? today : dailyUntilRaw;

    const [cur, prv, metaDaily] = await Promise.all([
      computeMetrics(admin, fromYmd, toYmd),
      computeMetrics(admin, prev.fromYmd, prev.toYmd),
      fromYmd <= dailyUntil ? fetchInsightsDaily(fromYmd, dailyUntil).catch(() => []) : Promise.resolve([]),
    ]);

    // 일자별 광고비(Meta) + 실매출(DB) 병합
    const spendByDate = new Map<string, number>();
    for (const r of metaDaily) {
      spendByDate.set(r.date_start, (spendByDate.get(r.date_start) ?? 0) + Number(r.spend || 0));
    }
    const allDates = Array.from(new Set([...spendByDate.keys(), ...cur.byDate.keys()])).sort();
    const daily = allDates.map((date) => ({
      date,
      spend: Math.round(spendByDate.get(date) ?? 0),
      revenue: Math.round(cur.byDate.get(date) ?? 0),
    }));

    return NextResponse.json({
      data: {
        range: { from: fromYmd, to: toYmd },
        current: cur.metrics,
        previous: prv.metrics,
        daily,
        metaError: cur.metaError,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    console.error('[ad-efficiency] error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
