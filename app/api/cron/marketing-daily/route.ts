import { NextRequest, NextResponse } from 'next/server';
import { sendGmailEmail } from '@/lib/gmail';
import { fetchMetaAdInsights, summarize, type InsightSummary } from '@/lib/marketing-report/fetchMeta';
import { fetchGA4Overall, fetchGA4Channels } from '@/lib/marketing-report/fetchGA4';
import {
  fetchOrderSummary,
  fetchTopProducts,
  fetchAdAttributedRevenue,
} from '@/lib/marketing-report/fetchSupabase';
import { buildDailyHtml, type DailyData } from '@/lib/marketing-report/buildHtml';
import { daysAgoKst } from '@/lib/marketing-report/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 매일 KST 23:00 = UTC 14:00 — vercel.json cron schedule "0 14 * * *"
// 어제 KST 00:00~23:59 데이터로 보고서 생성
const RECIPIENT = process.env.MARKETING_REPORT_TO || 'tommy062166@gmail.com';

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get('authorization') ?? '';
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === secret;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }
  try {
    const yesterday = daysAgoKst(1);
    const dayBefore = daysAgoKst(2);

    // 병렬 fetch
    const [adInsights, ga4Overall, ga4Channels, supaSummary, prevSupaSummary, topProducts, adAttributed] = await Promise.all([
      fetchMetaAdInsights(yesterday, yesterday).catch((e) => {
        console.error('[marketing-daily] Meta failed:', e);
        return [];
      }),
      fetchGA4Overall(yesterday, yesterday).catch((e) => {
        console.error('[marketing-daily] GA4 overall failed:', e);
        return { sessions: 0, totalUsers: 0, engagementRate: 0, transactions: 0, purchaseRevenue: 0 };
      }),
      fetchGA4Channels(yesterday, yesterday, 10).catch((e) => {
        console.error('[marketing-daily] GA4 channels failed:', e);
        return [];
      }),
      fetchOrderSummary(yesterday, yesterday).catch((e) => {
        console.error('[marketing-daily] Supabase summary failed:', e);
        return { orders: 0, revenue: 0, itemCost: 0, printCost: 0, grossProfit: 0, marginPct: 0 };
      }),
      fetchOrderSummary(dayBefore, dayBefore).catch(() => ({
        orders: 0,
        revenue: 0,
        itemCost: 0,
        printCost: 0,
        grossProfit: 0,
        marginPct: 0,
      })),
      fetchTopProducts(yesterday, yesterday, 5).catch((e) => {
        console.error('[marketing-daily] Top products failed:', e);
        return [];
      }),
      fetchAdAttributedRevenue(yesterday, yesterday).catch((e) => {
        console.error('[marketing-daily] Ad attributed failed:', e);
        return [];
      }),
    ]);

    const ads: InsightSummary[] = adInsights.map((i) => summarize(i, 'ad_name'));
    const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
    const totalImpr = ads.reduce((s, a) => s + a.impressions, 0);
    const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
    const totalAtc = ads.reduce((s, a) => s + a.atc, 0);
    const totalIc = ads.reduce((s, a) => s + a.ic, 0);
    const totalPurchase = ads.reduce((s, a) => s + a.purchase, 0);
    const totalPurchaseValue = ads.reduce((s, a) => s + a.purchaseValue, 0);
    const ctr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const metaRoas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

    const icValue = ads.reduce((s, a) => {
      // initiated_checkout value 별도 추출 어려움 → 일단 0. 향후 action_values에서 추출 가능.
      return s;
    }, 0);

    const data: DailyData = {
      date: yesterday,
      prevDate: dayBefore,
      meta: {
        spend: totalSpend,
        impressions: totalImpr,
        clicks: totalClicks,
        ctr,
        cpc,
        atc: totalAtc,
        ic: totalIc,
        icValue,
        purchase: totalPurchase,
        purchaseValue: totalPurchaseValue,
        metaRoas,
        ads,
      },
      ga4: { overall: ga4Overall, channels: ga4Channels },
      supa: { summary: supaSummary, topProducts, adAttributed },
      prevSupa: prevSupaSummary,
    };

    const html = buildDailyHtml(data);
    const subject = `[모두의유니폼] 일일 리포트 ${yesterday} · 매출 ${supaSummary.revenue.toLocaleString('ko-KR')}원 · ${supaSummary.orders}건`;
    const text = `${yesterday} 매출 ${supaSummary.revenue.toLocaleString()}원 / ${supaSummary.orders}건. 광고비 ${totalSpend.toLocaleString()}원 / 실제 ROAS ${totalSpend > 0 ? (supaSummary.revenue / totalSpend).toFixed(2) : '–'}×. HTML 본문 참고.`;

    const sent = await sendGmailEmail({
      to: [{ email: RECIPIENT }],
      subject,
      text,
      html,
    });

    return NextResponse.json({ ok: true, sent, date: yesterday, revenue: supaSummary.revenue, orders: supaSummary.orders });
  } catch (err) {
    console.error('[marketing-daily] failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
