/** Meta Graph API 호출 — 광고비/캠페인/광고별 인사이트 */

const API = 'https://graph.facebook.com';

export interface MetaAction {
  action_type: string;
  value: string;
}

export interface MetaAdInsight {
  ad_name?: string;
  campaign_name?: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  reach?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  purchase_roas?: { action_type: string; value: string }[];
  date_start: string;
  date_stop: string;
}

function getEnv() {
  const version = process.env.META_GRAPH_API_VERSION || 'v21.0';
  const acct = process.env.META_AD_ACCOUNT_ID;
  const token = process.env.META_ACCESS_TOKEN;
  if (!acct || !token) throw new Error('Meta env missing');
  return { version, acct, token };
}

function urlEncodeRange(from: string, to: string): string {
  return encodeURIComponent(JSON.stringify({ since: from, until: to }));
}

const FIELDS_BASE = 'spend,impressions,clicks,ctr,cpc,reach,actions,action_values,purchase_roas';

export async function fetchMetaCampaignInsights(from: string, to: string): Promise<MetaAdInsight[]> {
  const { version, acct, token } = getEnv();
  const url = `${API}/${version}/${acct}/insights?level=campaign&fields=campaign_name,${FIELDS_BASE}&time_range=${urlEncodeRange(from, to)}&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta campaign insights ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data ?? [];
}

export async function fetchMetaAdInsights(from: string, to: string): Promise<MetaAdInsight[]> {
  const { version, acct, token } = getEnv();
  const url = `${API}/${version}/${acct}/insights?level=ad&fields=ad_name,${FIELDS_BASE}&time_range=${urlEncodeRange(from, to)}&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta ad insights ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data ?? [];
}

/** action_type별 값 추출 헬퍼 */
export function pickAction(arr: MetaAction[] | undefined, type: string): number {
  if (!arr) return 0;
  const m = arr.find((a) => a.action_type === type);
  return m ? parseFloat(m.value) : 0;
}

export function pickRoas(insight: MetaAdInsight): number {
  const r = insight.purchase_roas?.find((a) => a.action_type === 'omni_purchase');
  return r ? parseFloat(r.value) : 0;
}

/** 인사이트를 표준 요약으로 가공 */
export interface InsightSummary {
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  reach: number;
  atc: number;       // add_to_cart
  ic: number;        // initiate_checkout
  purchase: number;  // omni_purchase
  purchaseValue: number;
  roas: number;
}

export function summarize(insight: MetaAdInsight, nameField: 'ad_name' | 'campaign_name' | 'auto' = 'auto'): InsightSummary {
  const name =
    nameField === 'ad_name'
      ? insight.ad_name ?? '-'
      : nameField === 'campaign_name'
        ? insight.campaign_name ?? '-'
        : insight.ad_name ?? insight.campaign_name ?? '-';
  return {
    name,
    spend: parseFloat(insight.spend ?? '0'),
    impressions: parseFloat(insight.impressions ?? '0'),
    clicks: parseFloat(insight.clicks ?? '0'),
    ctr: parseFloat(insight.ctr ?? '0'),
    cpc: parseFloat(insight.cpc ?? '0'),
    reach: parseFloat(insight.reach ?? '0'),
    atc: pickAction(insight.actions, 'omni_add_to_cart'),
    ic: pickAction(insight.actions, 'omni_initiated_checkout'),
    purchase: pickAction(insight.actions, 'omni_purchase'),
    purchaseValue: pickAction(insight.action_values, 'omni_purchase'),
    roas: pickRoas(insight),
  };
}

/** 광고별 funnel rate + leak 진단 태깅
 *
 *  clicks → ATC → IC → Purchase 단계별 conversion %를 계산하고,
 *  계정 평균 대비 50% 이하로 떨어진 단계를 leak 위치로 표시한다.
 *
 *  태그:
 *  - landing_page    : CTR 보통/높음인데 ATC율 평균의 절반 이하 → 광고→랜딩 ↓
 *  - option_step     : ATC율 OK인데 IC율 평균의 절반 이하 → 옵션 선택 단계 막힘
 *  - checkout_step   : IC율 OK인데 Purchase율 평균의 절반 이하 → 결제 단계 막힘
 *  - creative_weak   : CTR 자체가 평균의 절반 이하
 *  - high_spend_low_roas : spend 비중 30%↑ + ROAS < 1.0
 *  - healthy         : 모든 단계 평균 이상
 */
export interface AdLeakDiagnosis {
  name: string;
  spend: number;
  spendShare: number;       // 0~1 — 전체 spend 대비 비중
  ctr: number;
  atcRate: number;          // atc / clicks
  icRate: number;           // ic / atc
  purchaseRate: number;     // purchase / ic
  roas: number;
  tags: string[];
  primaryIssue: string;     // 사람이 읽기 좋은 한 줄 진단
}

export function diagnoseLeaks(ads: InsightSummary[]): { perAd: AdLeakDiagnosis[]; siteAvg: { ctr: number; atcRate: number; icRate: number; purchaseRate: number } } {
  const active = ads.filter((a) => a.spend > 0 && a.clicks > 0);
  if (active.length === 0) {
    return { perAd: [], siteAvg: { ctr: 0, atcRate: 0, icRate: 0, purchaseRate: 0 } };
  }
  const totalSpend = active.reduce((s, a) => s + a.spend, 0);

  // 가중 평균 (impression/click 기반) — 단순 산술 평균 X
  const totalImpr = active.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = active.reduce((s, a) => s + a.clicks, 0);
  const totalAtc = active.reduce((s, a) => s + a.atc, 0);
  const totalIc = active.reduce((s, a) => s + a.ic, 0);
  const totalPurch = active.reduce((s, a) => s + a.purchase, 0);

  const siteAvg = {
    ctr: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
    atcRate: totalClicks > 0 ? (totalAtc / totalClicks) * 100 : 0,
    icRate: totalAtc > 0 ? (totalIc / totalAtc) * 100 : 0,
    purchaseRate: totalIc > 0 ? (totalPurch / totalIc) * 100 : 0,
  };

  const perAd: AdLeakDiagnosis[] = active.map((a) => {
    const atcRate = a.clicks > 0 ? (a.atc / a.clicks) * 100 : 0;
    const icRate = a.atc > 0 ? (a.ic / a.atc) * 100 : 0;
    const purchaseRate = a.ic > 0 ? (a.purchase / a.ic) * 100 : 0;
    const spendShare = totalSpend > 0 ? a.spend / totalSpend : 0;

    const tags: string[] = [];
    const half = (avg: number) => avg * 0.5;

    if (siteAvg.ctr > 0 && a.ctr < half(siteAvg.ctr)) tags.push('creative_weak');
    if (a.ctr >= half(siteAvg.ctr) && siteAvg.atcRate > 0 && atcRate < half(siteAvg.atcRate) && a.clicks >= 20) {
      tags.push('landing_page');
    }
    if (atcRate >= half(siteAvg.atcRate) && siteAvg.icRate > 0 && icRate < half(siteAvg.icRate) && a.atc >= 5) {
      tags.push('option_step');
    }
    if (icRate >= half(siteAvg.icRate) && siteAvg.purchaseRate > 0 && purchaseRate < half(siteAvg.purchaseRate) && a.ic >= 3) {
      tags.push('checkout_step');
    }
    if (spendShare >= 0.3 && a.roas < 1.0) tags.push('high_spend_low_roas');
    if (tags.length === 0) tags.push('healthy');

    const issueMap: Record<string, string> = {
      creative_weak: '광고 자체가 안 끌림 (CTR 평균 ½ 미만)',
      landing_page: '클릭은 받지만 장바구니 못 감 — 랜딩 페이지 문제',
      option_step: '장바구니까지 옴, 옵션 선택에서 막힘',
      checkout_step: '결제 시작했는데 완료 못 함 — 결제 단계 문제',
      high_spend_low_roas: `예산 비중 ${(spendShare * 100).toFixed(0)}%인데 ROAS ${a.roas.toFixed(2)}× — 예산 재분배 검토`,
      healthy: '정상',
    };
    const primary = tags[0];
    return {
      name: a.name,
      spend: a.spend,
      spendShare,
      ctr: a.ctr,
      atcRate,
      icRate,
      purchaseRate,
      roas: a.roas,
      tags,
      primaryIssue: issueMap[primary] ?? primary,
    };
  });

  perAd.sort((a, b) => b.spend - a.spend);
  return { perAd, siteAvg };
}

/** 광고계정 잔액 (참고용, 보고서엔 표시하지 않음) */
export async function fetchMetaBalance(): Promise<number | null> {
  try {
    const { version, acct, token } = getEnv();
    const url = `${API}/${version}/${acct}?fields=balance&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return parseFloat(json.balance ?? '0');
  } catch {
    return null;
  }
}
