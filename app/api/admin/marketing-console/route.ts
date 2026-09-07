import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  fetchAccountSummary,
  fetchAdInsights,
  fetchAdSetInsights,
  fetchAdSets,
  fetchAdsWithCreatives,
  fetchCampaigns,
  type MetaAd,
  type MetaAdInsight,
  type MetaAdSet,
  type MetaAdSetInsight,
  type MetaCampaign,
  type MetaCreative,
} from '@/lib/meta-ads';

import { naverSpend } from '@/lib/analytics/marketing-spend';
import { channelOf, isConfirmedMarketingOrder, metaPurchaseMetrics, creativeVerdict, reportingRange, ratio, cachedMarketingRead } from '@/lib/analytics/marketing-metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type OrderRow = {
  id: string;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  total_amount: number | null;
  payment_status: string | null;
  order_status: string | null;
  created_at: string;
  utm_source?: string | null;
};

type CreativeRow = {
  adId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaignId: string | null;
  campaignName: string;
  adSetId: string | null;
  adSetName: string;
  imageUrl: string | null;
  imageHash: string | null;
  mediaType: 'image' | 'video' | 'dynamic' | 'unknown';
  hasVideo: boolean;
  message: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  frequency: number;
  purchases: number | null;
  purchaseValue: number | null;
  roas: number | null;
  verdict: 'winner' | 'watch' | 'kill' | 'fresh';
  reason: string;
};

type AdSetRow = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaignId: string | null;
  campaignName: string;
  dailyBudget: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  roas: number | null;
};

type Recommendation = {
  id: string;
  kind: 'pause_ad' | 'activate_ad' | 'adset_budget' | 'video_brief' | 'review';
  priority: 'high' | 'medium' | 'low';
  title: string;
  targetName: string;
  targetId?: string;
  reason: string;
  expectedImpact: string;
  actionLabel: string;
  action?: {
    type: 'pause_ad' | 'activate_ad' | 'adset_budget';
    targetId: string;
    dailyBudget?: number;
  };
  brief?: string;
};

function numberOf(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function todayKstDate(): Date {
  const now = new Date(Date.now() + 9 * 60 * 60000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function ymd(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDays(dateYmd: string, days: number): string {
  const d = new Date(`${dateYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

function kstYmdToUtcIso(dateYmd: string): string {
  return new Date(`${dateYmd}T00:00:00+09:00`).toISOString();
}

async function fetchDbOrderMetrics(admin: SupabaseClient, since: string, until: string, cutoff?: string) {
  const rows: OrderRow[] = [];
  const page = 1000;
  let from = 0;
  const untilExclusive = addDays(until, 1);

  while (from < 200000) {
    const { data, error } = await admin
      .from('orders')
      .select('id,total_amount,payment_status,order_status,created_at,utm_source,utm_medium,utm_campaign')
      .gte('created_at', kstYmdToUtcIso(since))
      .lt('created_at', cutoff ?? kstYmdToUtcIso(untilExclusive))
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as OrderRow[];
    rows.push(...batch);
    if (batch.length < page) break;
    from += page;
  }

  if (from >= 200000) throw new Error('주문 조회 상한을 초과했습니다. 기간을 줄여 주세요.');
  let revenue = 0;
  let orders = 0;
  let metaRevenue = 0;
  let metaOrders = 0;

  for (const order of rows) {
    if (!isConfirmedMarketingOrder(order)) continue;
    const amount = numberOf(order.total_amount);
    revenue += amount;
    orders += 1;
    if (channelOf(order.utm_source, order.utm_medium) === 'Meta 광고') {
      metaRevenue += amount;
      metaOrders += 1;
    }
  }

  return { revenue, orders, metaRevenue, metaOrders };
}

function insightKey<T extends MetaAdInsight | MetaAdSetInsight>(rows: T[], idKey: keyof T): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const id = String(row[idKey] ?? '');
    if (id) map.set(id, row);
  }
  return map;
}

function creativeImageHashes(creative?: MetaCreative): string[] {
  const hashes = [
    creative?.image_hash,
    creative?.object_story_spec?.link_data?.image_hash,
    ...(creative?.asset_feed_spec?.images ?? []).map((image) => image.hash),
  ];
  return hashes.filter((hash): hash is string => Boolean(hash));
}

function creativeMessage(creative?: MetaCreative): string {
  return (
    creative?.object_story_spec?.link_data?.message ||
    creative?.object_story_spec?.video_data?.message ||
    creative?.asset_feed_spec?.bodies?.[0]?.text ||
    ''
  );
}

function creativeMedia(ad: MetaAd, imageUrl: string | null): Pick<CreativeRow, 'imageUrl' | 'imageHash' | 'hasVideo' | 'mediaType' | 'message'> {
  const creative = ad.creative;
  const imageHash = creativeImageHashes(creative)[0] ?? null;
  const hasVideo =
    Boolean(creative?.video_id) ||
    Boolean(creative?.object_story_spec?.video_data?.video_id) ||
    Boolean(creative?.asset_feed_spec?.videos?.length);
  const isDynamic =
    Boolean(creative?.asset_feed_spec?.images?.length) ||
    Boolean(creative?.asset_feed_spec?.videos?.length) ||
    Boolean(creative?.asset_feed_spec?.bodies?.length);
  return {
    imageUrl:
      imageUrl ||
      creative?.object_story_spec?.link_data?.picture ||
      creative?.object_story_spec?.video_data?.image_url ||
      creative?.thumbnail_url ||
      null,
    imageHash,
    hasVideo,
    mediaType: hasVideo ? 'video' : isDynamic ? 'dynamic' : imageHash ? 'image' : 'unknown',
    message: creativeMessage(creative),
  };
}

function buildCreativeRows(
  ads: MetaAd[],
  campaigns: MetaCampaign[],
  adSets: MetaAdSet[],
  insights: MetaAdInsight[],
  imageMap: Record<string, { url?: string; permalink_url?: string }>,
  days: number,
  purchaseType: string | null,
): CreativeRow[] {
  const campaignNameById = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  const adSetNameById = new Map(adSets.map((adSet) => [adSet.id, adSet.name]));
  const insightByAdId = insightKey(insights, 'ad_id');

  return ads.map((ad) => {
    const insight = insightByAdId.get(ad.id);
    const imageHash = creativeImageHashes(ad.creative)[0] ?? null;
    const fullImageUrl = imageHash ? imageMap[imageHash]?.url || imageMap[imageHash]?.permalink_url || null : null;
    const media = creativeMedia(ad, fullImageUrl);
    const spend = numberOf(insight?.spend);
    const clicks = numberOf(insight?.clicks);
    const impressions = numberOf(insight?.impressions);
    const metrics = metaPurchaseMetrics(insight, purchaseType);
    const base = {
      adId: ad.id,
      name: ad.name,
      status: ad.status,
      effectiveStatus: ad.effective_status || ad.status,
      campaignId: ad.campaign_id ?? null,
      campaignName: ad.campaign?.name || (ad.campaign_id ? campaignNameById.get(ad.campaign_id) : undefined) || '-',
      adSetId: ad.adset_id ?? null,
      adSetName: ad.adset?.name || (ad.adset_id ? adSetNameById.get(ad.adset_id) : undefined) || '-',
      ...media,
      spend,
      impressions,
      clicks,
      ctr: numberOf(insight?.impressions) > 0 ? numberOf(insight?.clicks) / numberOf(insight?.impressions) * 100 : null,
      cpc: ratio(spend, clicks),
      frequency: numberOf(insight?.frequency),
      purchases: metrics.purchases,
      purchaseValue: metrics.purchaseValue,
      roas: metrics.roas === null ? null : metrics.roas * 100,
    };
    const judged = creativeVerdict(base, days);
    return { ...base, ...judged };
  }).sort((a, b) => b.spend - a.spend);
}

function buildAdSetRows(
  adSets: MetaAdSet[],
  campaigns: MetaCampaign[],
  insights: MetaAdSetInsight[],
  purchaseType: string | null,
): AdSetRow[] {
  const campaignNameById = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  const insightByAdSetId = insightKey(insights, 'adset_id');
  return adSets.map((adSet) => {
    const insight = insightByAdSetId.get(adSet.id);
    const metrics = metaPurchaseMetrics(insight, purchaseType);
    const spend = numberOf(insight?.spend);
    const clicks = numberOf(insight?.clicks);
    return {
      id: adSet.id,
      name: adSet.name,
      status: adSet.status,
      effectiveStatus: adSet.effective_status || adSet.status,
      campaignId: adSet.campaign_id ?? null,
      campaignName: adSet.campaign_id ? campaignNameById.get(adSet.campaign_id) || '-' : '-',
      dailyBudget: numberOf(adSet.daily_budget),
      spend,
      impressions: numberOf(insight?.impressions),
      clicks,
      ctr: numberOf(insight?.impressions) > 0 ? numberOf(insight?.clicks) / numberOf(insight?.impressions) * 100 : null,
      cpc: ratio(spend, clicks),
      purchases: metrics.purchases,
      purchaseValue: metrics.purchaseValue,
      roas: metrics.roas === null ? null : metrics.roas * 100,
    };
  }).sort((a, b) => b.spend - a.spend);
}

function videoBriefFor(creative: CreativeRow): string {
  return [
    `소재명: ${creative.name}`,
    `핵심 메시지: ${creative.message || '단체복 제작 고민을 맡기면 견적·시안·제작까지 빠르게 정리해준다는 방향'}`,
    `영상 포맷: 9:16 릴스, 12~18초, 첫 2초에 "회사 워크샵 단체티 아직 못 정했다면" 문구 노출`,
    `구성: 문제 제기 → 제작 사례 컷 → 견적/시안/납기 안심 포인트 → 문의 CTA`,
    `성과 근거: CTR ${creative.ctr?.toFixed(2) ?? '계산 불가'}%, ROAS ${creative.roas?.toFixed(0) ?? '미수집'}%`,
  ].join('\n');
}

function buildRecommendations(creatives: CreativeRow[], adSets: AdSetRow[], days: number, incomplete: boolean): Recommendation[] {
  if (days < 14 || incomplete) return [{
    id: 'review:observation', kind: 'review', priority: 'low', title: '성과 판단 보류', targetName: '조회 기간',
    reason: '최소 14일의 완료된 자료가 필요합니다. 최근 유입 고객의 전환 관찰 기간도 별도로 확인하세요.',
    expectedImpact: '전환 지연·주문 규모·원가를 확인한 뒤 운영자가 판단합니다.', actionLabel: '확인 완료',
  }];
  const recommendations: Recommendation[] = [];
  const activeCreatives = creatives.filter((creative) => creative.effectiveStatus === 'ACTIVE');
  const pausedCreatives = creatives.filter((creative) => creative.status === 'PAUSED' || creative.effectiveStatus === 'PAUSED');

  for (const creative of activeCreatives.filter((item) => item.verdict === 'kill').slice(0, 4)) {
    recommendations.push({
      id: `pause_ad:${creative.adId}`,
      kind: 'pause_ad',
      priority: 'high',
      title: '성과 약한 소재 중단',
      targetName: creative.name,
      targetId: creative.adId,
      reason: creative.reason,
      expectedImpact: '예산 누수를 줄이고 위너 소재와 신규 테스트로 지출을 이동합니다.',
      actionLabel: '광고 중단',
      action: { type: 'pause_ad', targetId: creative.adId },
    });
  }

  for (const creative of pausedCreatives.filter((item) => item.name.includes('[신규]') || item.verdict === 'winner').slice(0, 3)) {
    recommendations.push({
      id: `activate_ad:${creative.adId}`,
      kind: 'activate_ad',
      priority: creative.name.includes('[신규]') ? 'medium' : 'low',
      title: creative.name.includes('[신규]') ? '신규 소재 소액 테스트' : '과거 위너 소재 재개',
      targetName: creative.name,
      targetId: creative.adId,
      reason: creative.name.includes('[신규]') ? '이미 광고관리자에 등록된 신규 소재라 검수 후 소액 테스트하기 좋습니다.' : creative.reason,
      expectedImpact: '메타가 위너에만 예산을 몰아주는 상황에서 새로운 학습 신호를 확보합니다.',
      actionLabel: '광고 재개',
      action: { type: 'activate_ad', targetId: creative.adId },
    });
  }

  for (const adSet of adSets.filter((item) => item.effectiveStatus === 'ACTIVE' && item.dailyBudget > 0 && item.spend >= 50000 && item.roas !== null && item.purchases !== null && item.purchases > 0 && item.roas >= 220).slice(0, 2)) {
    const nextBudget = Math.min(500000, Math.round(adSet.dailyBudget * 1.2 / 1000) * 1000);
    recommendations.push({
      id: `budget_up:${adSet.id}:${nextBudget}`,
      kind: 'adset_budget',
      priority: 'medium',
      title: '광고세트 예산 20% 증액',
      targetName: adSet.name,
      targetId: adSet.id,
      reason: `최근 ROAS ${adSet.roas?.toFixed(0) ?? '미수집'}%, 구매 ${adSet.purchases?.toFixed(0) ?? '미수집'}건으로 확장 후보입니다.`,
      expectedImpact: `일예산을 ₩${nextBudget.toLocaleString('ko-KR')}로 조정해 위너 학습량을 늘립니다.`,
      actionLabel: '예산 증액',
      action: { type: 'adset_budget', targetId: adSet.id, dailyBudget: nextBudget },
    });
  }

  for (const adSet of adSets.filter((item) => item.effectiveStatus === 'ACTIVE' && item.dailyBudget > 0 && item.spend >= 50000 && item.roas !== null && item.purchases !== null && item.roas > 0 && item.roas < 90).slice(0, 2)) {
    const nextBudget = Math.max(10000, Math.round(adSet.dailyBudget * 0.8 / 1000) * 1000);
    recommendations.push({
      id: `budget_down:${adSet.id}:${nextBudget}`,
      kind: 'adset_budget',
      priority: 'medium',
      title: '광고세트 예산 20% 감액',
      targetName: adSet.name,
      targetId: adSet.id,
      reason: `최근 ROAS ${adSet.roas?.toFixed(0) ?? '미수집'}%라 증액보다 방어가 필요합니다.`,
      expectedImpact: `일예산을 ₩${nextBudget.toLocaleString('ko-KR')}로 낮추고 신규 소재 테스트 여력을 확보합니다.`,
      actionLabel: '예산 감액',
      action: { type: 'adset_budget', targetId: adSet.id, dailyBudget: nextBudget },
    });
  }

  for (const creative of activeCreatives.filter((item) => item.verdict === 'winner' && !item.hasVideo).slice(0, 3)) {
    recommendations.push({
      id: `video_brief:${creative.adId}`,
      kind: 'video_brief',
      priority: 'low',
      title: '위닝 이미지 영상화',
      targetName: creative.name,
      targetId: creative.adId,
      reason: '이미지에서 유입 신호가 확인됐으므로 릴스/스토리 포맷으로 확장할 가치가 있습니다.',
      expectedImpact: '같은 메시지를 9:16 영상으로 바꿔 피드 외 지면을 넓힙니다.',
      actionLabel: '브리프 복사',
      brief: videoBriefFor(creative),
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'review:weekly',
      kind: 'review',
      priority: 'low',
      title: '성과 급변 없음',
      targetName: '이번 주 소재 묶음',
      reason: '즉시 중단·증액할 만큼 강한 신호가 없습니다.',
      expectedImpact: '상위 소재 2개는 유지하고 신규 시즌 소재를 소액으로 붙여 학습량을 확보합니다.',
      actionLabel: '확인 완료',
    });
  }

  return recommendations.slice(0, 10);
}

function buildWeeklyPlan() {
  const today = todayKstDate();
  const month = today.getUTCMonth() + 1;
  const july = month === 7;
  return {
    mainKeyword: july ? '회사 워크샵 단체티' : '단체복 빠른 제작',
    keywords: july
      ? ['회사 워크샵 단체티', 'MT 단체복', '행사 스태프 유니폼', '러닝크루 단체티', '카페 직원 단체복']
      : ['단체티 제작', '단체복 견적', '소량 단체복', '직원 유니폼', '행사 단체티'],
    angles: july
      ? ['휴가 전 워크샵·행사 일정 확정 수요를 잡기', '로고 시안과 납기 불안을 줄여주는 메시지', '실착 사진 기반 제작 사례를 전면에 두기']
      : ['견적 피로를 줄이는 원스톱 제작', '제작 사례 기반 신뢰 확보', '납기와 상담 속도 강조'],
    creativeRequests: [
      '위닝 이미지 1개를 9:16 영상으로 변환',
      '실제 제작 사례 사진 기반 정사각 이미지 2종 추가',
      '카페·워크샵·러닝크루 타깃별 첫 문장만 바꾼 변형 3종 테스트',
    ],
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    let range;
    try { range = reportingRange(searchParams, new Date(), 90); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
    const days = range.days;
    const admin = createAdminClient();

    const [insights, campaigns, adSets, ads, db, naver] = await Promise.all([
      cachedMarketingRead(`console:${process.env.META_AD_ACCOUNT_ID}:${range.since}:${range.until}`, async () => {
        const [accountSummary, adInsights, adSetInsights] = await Promise.all([
          fetchAccountSummary(range.since, range.until),
          fetchAdInsights(range.since, range.until),
          fetchAdSetInsights(range.since, range.until),
        ]);
        return { accountSummary, adInsights, adSetInsights };
      }, searchParams.has('refresh')),
      fetchCampaigns(),
      fetchAdSets(),
      fetchAdsWithCreatives(),
      fetchDbOrderMetrics(admin, range.since, range.until, range.toExclusive),
      naverSpend(range.since, range.until, searchParams.has('refresh')),
    ]);
    const { accountSummary, adInsights, adSetInsights } = insights.value;
    const totalSpend = naver.spend === null ? null : accountSummary.spend + naver.spend;

    const accountPurchases = metaPurchaseMetrics(accountSummary);
    // Full resolution images load separately when the creative tab opens.
    const creatives = buildCreativeRows(ads, campaigns, adSets, adInsights, {}, days, accountPurchases.purchaseType);
    const adSetRows = buildAdSetRows(adSets, campaigns, adSetInsights, accountPurchases.purchaseType);
    const recommendations = buildRecommendations(creatives, adSetRows, days, range.incomplete);

    const metaAttributedRevenue = accountPurchases.purchaseValue;
    const activeCampaigns = campaigns.filter((campaign) => campaign.effective_status === 'ACTIVE' || campaign.status === 'ACTIVE').length;
    const activeAds = creatives.filter((creative) => creative.effectiveStatus === 'ACTIVE').length;
    const pendingActions = recommendations.filter((recommendation) => recommendation.action).length;

    return NextResponse.json({
      data: {
        generatedAt: new Date().toISOString(),
        adsCollectedAt: insights.collectedAt,
        adsErrors: naver.error ? [naver.error] : [],
        naverCollectedAt: naver.collectedAt,
        range: { ...range, days },
        notes: [
          '주문 생성일 기준 현재 유효 결제금액이며 취소·환불·결제대기·테스트 주문은 제외합니다.',
          'MER = 전체 확정매출 ÷ Meta·네이버 총광고비이며, 이익률이 아닙니다.',
          'UTM 귀속 ROAS = Meta 유료 UTM 확정매출 ÷ Meta 광고비.',
          'Meta 보고 ROAS = 매체 귀속 구매가치 ÷ Meta 광고비.',
          'Meta 구매 수·가치는 웹 구매 기준을 우선해 같은 범위의 값 하나만 사용합니다.',
          '예산 판단에는 최근 유입 후 14·28일 관찰과 주문 규모·원가를 함께 확인하세요.',
        ],
        overview: {
          spend: accountSummary.spend,
          totalSpend,
          impressions: accountSummary.impressions,
          clicks: accountSummary.clicks,
          reach: accountSummary.reach,
          ctr: accountSummary.impressions > 0 ? (accountSummary.clicks / accountSummary.impressions) * 100 : null,
          cpc: ratio(accountSummary.spend, accountSummary.clicks),
          dbRevenue: db.revenue,
          dbOrders: db.orders,
          dbRoas: totalSpend !== null && totalSpend > 0 ? db.revenue / totalSpend : null,
          metaRevenue: metaAttributedRevenue,
          metaRoas: accountPurchases.roas === null ? null : accountPurchases.roas * 100,
          purchaseType: accountPurchases.purchaseType,
          utmMetaRoas: accountSummary.spend > 0 ? db.metaRevenue / accountSummary.spend * 100 : null,
          utmMetaRevenue: db.metaRevenue,
          utmMetaOrders: db.metaOrders,
          activeCampaigns,
          activeAds,
          pendingActions,
        },
        campaigns: campaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          effectiveStatus: campaign.effective_status || campaign.status,
          objective: campaign.objective || null,
        })),
        adSets: adSetRows,
        creatives,
        recommendations,
        weeklyPlan: buildWeeklyPlan(),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    console.error('[marketing-console] error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
