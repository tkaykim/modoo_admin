import { NextRequest, NextResponse } from 'next/server';
import { sendGmailEmail } from '@/lib/gmail';
import { automationPing } from '@/lib/automation-ping';
import { createAdminClient } from '@/lib/supabase-admin';
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
  fetchTopProducts,
  fetchAdAttributedRevenue,
} from '@/lib/marketing-report/fetchSupabase';
import { fetchClarityReport } from '@/lib/marketing-report/fetchClarity';
import { buildNarrative } from '@/lib/marketing-report/narrative';
// NOTE: Gemini polish는 광고명을 환각으로 변조한 사례 발생(2026-05-26: "감도높은유니폼"→"갸르데이션 더피").
// 룰 한국어 출력이 충분히 자연스러우므로 polish 비활성. polishWithGemini 함수 자체는 narrative.ts에 남겨둠.
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

    // 병렬 fetch — 각 fetcher 실패해도 나머지는 진행
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
      topProducts,
      adAttributed,
      clarity,
    ] = await Promise.all([
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
      fetchGA4Funnel(yesterday, yesterday).catch((e) => {
        console.error('[marketing-daily] GA4 funnel failed:', e);
        return [];
      }),
      fetchGA4LandingPages(yesterday, yesterday, 10).catch((e) => {
        console.error('[marketing-daily] GA4 landing failed:', e);
        return [];
      }),
      fetchGA4DeviceBreakdown(yesterday, yesterday).catch((e) => {
        console.error('[marketing-daily] GA4 device failed:', e);
        return [];
      }),
      fetchGA4NewVsReturning(yesterday, yesterday).catch((e) => {
        console.error('[marketing-daily] GA4 new/returning failed:', e);
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
      fetchClarityReport(1).catch((e) => {
        console.error('[marketing-daily] Clarity failed:', e);
        return null;
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
        icValue: 0,
        purchase: totalPurchase,
        purchaseValue: totalPurchaseValue,
        metaRoas,
        ads,
        leak,
      },
      ga4: {
        overall: ga4Overall,
        channels: ga4Channels,
        funnel: ga4Funnel,
        landing: ga4Landing,
        devices: ga4Devices,
        cohort: ga4Cohort,
      },
      supa: { summary: supaSummary, topProducts, adAttributed },
      prevSupa: prevSupaSummary,
      clarity,
      narrative,
    };

    // 마케팅 지표 보존 — 메일뿐 아니라 테이블에 저장(분석가·오케스트레이터가 읽어 재무와 통합 분석)
    try {
      const msb = createAdminClient();
      await msb.from('marketing_daily_metrics').upsert({
        date: yesterday,
        revenue: supaSummary.revenue, orders: supaSummary.orders, gross_profit: supaSummary.grossProfit, margin_pct: supaSummary.marginPct,
        ad_spend: totalSpend, impressions: totalImpr, clicks: totalClicks, ctr, cpc, meta_roas: metaRoas, real_roas: realRoas,
        sessions: ga4Overall.sessions, total_users: ga4Overall.totalUsers, engagement_rate: ga4Overall.engagementRate,
        narrative, updated_at: new Date().toISOString(),
      }, { onConflict: 'date' });
    } catch (e) {
      console.error('[marketing-daily] metrics persist failed:', e);
    }

    const html = buildDailyHtml(data);
    const subject = `[모두의유니폼] 일일 리포트 ${yesterday} · 매출 ${supaSummary.revenue.toLocaleString('ko-KR')}원 · ${supaSummary.orders}건`;
    const text = `${yesterday} 매출 ${supaSummary.revenue.toLocaleString()}원 / ${supaSummary.orders}건. 광고비 ${totalSpend.toLocaleString()}원 / 실제 ROAS ${realRoas.toFixed(2)}×. HTML 본문 참고.`;

    const sent = await sendGmailEmail({
      to: [{ email: RECIPIENT }],
      subject,
      text,
      html,
    });

    await automationPing({ key: 'modoo:marketing-daily', title: '마케팅 일일 보고 (GA4·Meta·Clarity 메일)', triggerDesc: '매일 23:00 KST', source: 'modoo_admin /api/cron/marketing-daily', detail: { sent, revenue: supaSummary.revenue, orders: supaSummary.orders } });

    return NextResponse.json({
      ok: true,
      sent,
      date: yesterday,
      revenue: supaSummary.revenue,
      orders: supaSummary.orders,
      narrative,
    });
  } catch (err) {
    console.error('[marketing-daily] failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
