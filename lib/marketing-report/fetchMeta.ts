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
