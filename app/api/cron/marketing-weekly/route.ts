import { NextRequest, NextResponse } from 'next/server';
import { sendGmailEmail } from '@/lib/gmail';
import { automationPing } from '@/lib/automation-ping';
import { fetchMetaAdInsights, summarize, diagnoseLeaks, type InsightSummary } from '@/lib/marketing-report/fetchMeta';
import {
  fetchGA4Overall,
  fetchGA4Channels,
  fetchGA4Funnel,
  fetchGA4LandingPages,
  fetchGA4DeviceBreakdown,
  fetchGA4NewVsReturning,
} from '@/lib/marketing-report/fetchGA4';
import {
  fetchOrderSummary,
  fetchDailyRevenue,
  fetchTopProducts,
  fetchAdAttributedRevenue,
} from '@/lib/marketing-report/fetchSupabase';
import { fetchClarityReport } from '@/lib/marketing-report/fetchClarity';
import { buildNarrative } from '@/lib/marketing-report/narrative';
// Gemini polish 비활성 — 환각 이슈 (route는 marketing-daily 주석 참조).
import { buildWeeklyHtml, type WeeklyData } from '@/lib/marketing-report/buildHtml';
import { lastWeekRangeKst } from '@/lib/marketing-report/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

// 매주 일요일 KST 23:00 = UTC 14:00 일요일 → vercel.json cron "0 14 * * 0"
// 지난 주(월~일) 데이터로 보고서 생성
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
    const { from, to } = lastWeekRangeKst();
    const prevFromDate = new Date(from + 'T00:00:00Z');
    prevFromDate.setUTCDate(prevFromDate.getUTCDate() - 7);
    const prevToDate = new Date(to + 'T00:00:00Z');
    prevToDate.setUTCDate(prevToDate.getUTCDate() - 7);
    const prevFrom = prevFromDate.toISOString().slice(0, 10);
    const prevTo = prevToDate.toISOString().slice(0, 10);

    const [
      adInsights,
      ga4Overall,
      ga4Channels,
      ga4Funnel,
      ga4Landing,
      ga4Devices,
      ga4Cohort,
      supaSummary,
      prevSupaSummary,
      daily,
      topProducts,
      adAttributed,
      clarity,
    ] = await Promise.all([
      fetchMetaAdInsights(from, to).catch((e) => { console.error('[marketing-weekly] Meta failed:', e); return []; }),
      fetchGA4Overall(from, to).catch((e) => { console.error('[marketing-weekly] GA4 overall failed:', e); return { sessions: 0, totalUsers: 0, engagementRate: 0, transactions: 0, purchaseRevenue: 0 }; }),
      fetchGA4Channels(from, to, 10).catch((e) => { console.error('[marketing-weekly] GA4 channels failed:', e); return []; }),
      fetchGA4Funnel(from, to).catch((e) => { console.error('[marketing-weekly] GA4 funnel failed:', e); return []; }),
      fetchGA4LandingPages(from, to, 10).catch((e) => { console.error('[marketing-weekly] GA4 landing failed:', e); return []; }),
      fetchGA4DeviceBreakdown(from, to).catch((e) => { console.error('[marketing-weekly] GA4 device failed:', e); return []; }),
      fetchGA4NewVsReturning(from, to).catch((e) => { console.error('[marketing-weekly] GA4 cohort failed:', e); return []; }),
      fetchOrderSummary(from, to).catch((e) => { console.error('[marketing-weekly] Supabase summary failed:', e); return { orders: 0, revenue: 0, itemCost: 0, printCost: 0, grossProfit: 0, marginPct: 0 }; }),
      fetchOrderSummary(prevFrom, prevTo).catch(() => ({ orders: 0, revenue: 0, itemCost: 0, printCost: 0, grossProfit: 0, marginPct: 0 })),
      fetchDailyRevenue(from, to).catch((e) => { console.error('[marketing-weekly] Daily revenue failed:', e); return []; }),
      fetchTopProducts(from, to, 10).catch((e) => { console.error('[marketing-weekly] Top products failed:', e); return []; }),
      fetchAdAttributedRevenue(from, to).catch((e) => { console.error('[marketing-weekly] Ad attributed failed:', e); return []; }),
      // weekly: Clarity API 최대 3일 — 주간 전체는 못 받지만 최근 3일 신호로 진단 보조
      fetchClarityReport(3).catch((e) => { console.error('[marketing-weekly] Clarity failed:', e); return null; }),
    ]);

    const ads: InsightSummary[] = adInsights.map((i) => summarize(i, 'ad_name'));
    const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
    const totalPurchase = ads.reduce((s, a) => s + a.purchase, 0);
    const totalPurchaseValue = ads.reduce((s, a) => s + a.purchaseValue, 0);
    const metaRoas = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;
    const realRoas = totalSpend > 0 ? supaSummary.revenue / totalSpend : 0;

    const leak = diagnoseLeaks(ads);

    const narrative = buildNarrative({
      supa: supaSummary,
      prevSupa: prevSupaSummary,
      metaSpend: totalSpend,
      realRoas,
      ads: leak.perAd,
      ga4Overall,
      ga4Funnel,
      ga4Devices,
      ga4Cohort,
      clarity: clarity ?? undefined,
    });

    const data: WeeklyData = {
      from,
      to,
      prevFrom,
      prevTo,
      meta: { spend: totalSpend, purchase: totalPurchase, purchaseValue: totalPurchaseValue, metaRoas, ads, leak },
      ga4: {
        overall: ga4Overall,
        channels: ga4Channels,
        funnel: ga4Funnel,
        landing: ga4Landing,
        devices: ga4Devices,
        cohort: ga4Cohort,
      },
      supa: { summary: supaSummary, daily, topProducts, adAttributed },
      prevSupa: prevSupaSummary,
      clarity,
      narrative,
    };

    const html = buildWeeklyHtml(data);
    const subject = `[모두의유니폼] 주간 리포트 ${from}~${to} · 매출 ${supaSummary.revenue.toLocaleString('ko-KR')}원 · ${supaSummary.orders}건`;
    const text = `${from}~${to} 매출 ${supaSummary.revenue.toLocaleString()}원 / ${supaSummary.orders}건. 광고비 ${totalSpend.toLocaleString()}원 / 실제 ROAS ${realRoas.toFixed(2)}×. HTML 본문 참고.`;

    const sent = await sendGmailEmail({
      to: [{ email: RECIPIENT }],
      subject,
      text,
      html,
    });

    await automationPing({ key: 'modoo:marketing-weekly', title: '마케팅 주간 보고 (메일)', triggerDesc: '일 23:00 KST', source: 'modoo_admin /api/cron/marketing-weekly', detail: { sent, revenue: supaSummary.revenue, orders: supaSummary.orders } });
    return NextResponse.json({ ok: true, sent, range: { from, to }, revenue: supaSummary.revenue, orders: supaSummary.orders, narrative });
  } catch (err) {
    console.error('[marketing-weekly] failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
