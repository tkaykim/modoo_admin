import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { fetchCampaigns, fetchInsightsDaily, fetchAccountSummary, rangeFromDays } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(180, Number(searchParams.get('days') ?? 30)));
    const { since, until } = rangeFromDays(days);

    const [campaigns, insights, summary] = await Promise.all([
      fetchCampaigns(),
      fetchInsightsDaily(since, until),
      fetchAccountSummary(since, until),
    ]);

    // 캠페인 메타정보 맵
    const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

    // 캠페인 × 일자 → 평탄화된 row
    const dailyRows = insights.map((r) => ({
      date: r.date_start,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name ?? campaignMap.get(r.campaign_id)?.name ?? r.campaign_id,
      spend: Number(r.spend || 0),
      impressions: Number(r.impressions || 0),
      clicks: Number(r.clicks || 0),
      reach: Number(r.reach || 0),
      cpc: Number(r.cpc || 0),
      cpm: Number(r.cpm || 0),
      ctr: Number(r.ctr || 0),
    }));

    // 캠페인별 합산
    const byCampaignMap = new Map<string, {
      campaign_id: string;
      campaign_name: string;
      status: string;
      spend: number;
      impressions: number;
      clicks: number;
    }>();
    for (const r of dailyRows) {
      const cur = byCampaignMap.get(r.campaign_id) ?? {
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        status: campaignMap.get(r.campaign_id)?.effective_status ?? campaignMap.get(r.campaign_id)?.status ?? 'UNKNOWN',
        spend: 0,
        impressions: 0,
        clicks: 0,
      };
      cur.spend += r.spend;
      cur.impressions += r.impressions;
      cur.clicks += r.clicks;
      byCampaignMap.set(r.campaign_id, cur);
    }
    const byCampaign = [...byCampaignMap.values()].sort((a, b) => b.spend - a.spend);

    // 일자별 합산
    const dailyMap = new Map<string, { date: string; spend: number; impressions: number; clicks: number }>();
    for (const r of dailyRows) {
      const cur = dailyMap.get(r.date) ?? { date: r.date, spend: 0, impressions: 0, clicks: 0 };
      cur.spend += r.spend;
      cur.impressions += r.impressions;
      cur.clicks += r.clicks;
      dailyMap.set(r.date, cur);
    }
    const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      data: {
        range: { days, since, until },
        summary, // { spend, impressions, clicks, reach }
        byCampaign,
        daily,
        rowsCount: dailyRows.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    console.error('[meta/insights] error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
