/** GA4 Data API 호출 — 세션/채널/전환 + funnel/landing/device/cohort (cron 일일 리포트용) */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { GoogleAuth } from 'google-auth-library';
import { FUNNEL_STEPS } from '@/lib/ga4/events';

function getClient(): BetaAnalyticsDataClient {
  const clientId = process.env.GA4_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GA4_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GA4_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error('GA4 OAuth env missing');
  const auth = new GoogleAuth({
    credentials: { type: 'authorized_user', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken },
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  return new BetaAnalyticsDataClient({ auth });
}

function property(): string {
  const id = process.env.GA4_MODOO_APP_PROPERTY_ID;
  if (!id) throw new Error('GA4_MODOO_APP_PROPERTY_ID missing');
  return `properties/${id}`;
}

export interface GA4Overall {
  sessions: number;
  totalUsers: number;
  engagementRate: number;
  transactions: number;
  purchaseRevenue: number;
}

export interface GA4ChannelRow {
  channel: string;
  sessions: number;
  transactions: number;
  purchaseRevenue: number;
}

export async function fetchGA4Overall(from: string, to: string): Promise<GA4Overall> {
  const client = getClient();
  const [r] = await client.runReport({
    property: property(),
    dateRanges: [{ startDate: from, endDate: to }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'engagementRate' },
      { name: 'transactions' },
      { name: 'purchaseRevenue' },
    ],
  });
  const m = r.rows?.[0]?.metricValues ?? [];
  return {
    sessions: parseFloat(m[0]?.value ?? '0'),
    totalUsers: parseFloat(m[1]?.value ?? '0'),
    engagementRate: parseFloat(m[2]?.value ?? '0'),
    transactions: parseFloat(m[3]?.value ?? '0'),
    purchaseRevenue: parseFloat(m[4]?.value ?? '0'),
  };
}

export async function fetchGA4Channels(from: string, to: string, limit = 10): Promise<GA4ChannelRow[]> {
  const client = getClient();
  const [r] = await client.runReport({
    property: property(),
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'sessionSourceMedium' }],
    metrics: [{ name: 'sessions' }, { name: 'transactions' }, { name: 'purchaseRevenue' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: limit,
  });
  return (r.rows ?? []).map((row) => ({
    channel: row.dimensionValues?.[0]?.value ?? '-',
    sessions: parseFloat(row.metricValues?.[0]?.value ?? '0'),
    transactions: parseFloat(row.metricValues?.[1]?.value ?? '0'),
    purchaseRevenue: parseFloat(row.metricValues?.[2]?.value ?? '0'),
  }));
}

/** ─── 진단용 디테일 리포트 (cron 일일/주간) ────────────────────────── */

export interface GA4FunnelStep {
  step: string;
  event: string;
  users: number;          // totalUsers
  eventCount: number;
  conversionFromTopPct: number;     // 첫 단계 대비
  conversionFromPrevPct: number;    // 직전 단계 대비 — drop-off 보기
}

export interface GA4LandingRow {
  pagePath: string;
  sessions: number;
  engagementRate: number;       // 0~1
  conversions: number;
}

export interface GA4DeviceRow {
  device: string;               // desktop/mobile/tablet
  sessions: number;
  transactions: number;
  purchaseRevenue: number;
  conversionRate: number;       // transactions / sessions
}

export interface GA4NewReturningRow {
  cohort: string;               // 'new' | 'returning'
  sessions: number;
  transactions: number;
  purchaseRevenue: number;
  conversionRate: number;
}

/** funnel: view_item → editor_open → design_complete → add_to_cart → begin_checkout → purchase */
export async function fetchGA4Funnel(from: string, to: string): Promise<GA4FunnelStep[]> {
  const client = getClient();
  const eventList = FUNNEL_STEPS.map((s) => s.event);
  const [r] = await client.runReport({
    property: property(),
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', inListFilter: { values: eventList as string[] } },
    },
  });
  const byEvent = new Map<string, { users: number; count: number }>();
  for (const row of r.rows ?? []) {
    byEvent.set(row.dimensionValues?.[0]?.value ?? '', {
      count: parseFloat(row.metricValues?.[0]?.value ?? '0'),
      users: parseFloat(row.metricValues?.[1]?.value ?? '0'),
    });
  }
  const baseUsers = byEvent.get(FUNNEL_STEPS[0].event)?.users ?? 0;
  let prevUsers = baseUsers;
  return FUNNEL_STEPS.map((s, i) => {
    const v = byEvent.get(s.event) ?? { users: 0, count: 0 };
    const fromTop = baseUsers > 0 ? (v.users / baseUsers) * 100 : 0;
    const fromPrev = i === 0 ? 100 : prevUsers > 0 ? (v.users / prevUsers) * 100 : 0;
    prevUsers = v.users;
    return {
      step: s.name,
      event: s.event,
      users: v.users,
      eventCount: v.count,
      conversionFromTopPct: Number(fromTop.toFixed(2)),
      conversionFromPrevPct: Number(fromPrev.toFixed(2)),
    };
  });
}

/** 랜딩 페이지 TOP — 세션·engagement·전환 */
export async function fetchGA4LandingPages(from: string, to: string, limit = 10): Promise<GA4LandingRow[]> {
  const client = getClient();
  const [r] = await client.runReport({
    property: property(),
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: [{ name: 'sessions' }, { name: 'engagementRate' }, { name: 'conversions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit,
  });
  return (r.rows ?? []).map((row) => ({
    pagePath: row.dimensionValues?.[0]?.value ?? '-',
    sessions: parseFloat(row.metricValues?.[0]?.value ?? '0'),
    engagementRate: parseFloat(row.metricValues?.[1]?.value ?? '0'),
    conversions: parseFloat(row.metricValues?.[2]?.value ?? '0'),
  }));
}

/** 디바이스별 — 모바일/데스크탑 전환율 갭이 정량적 신호 */
export async function fetchGA4DeviceBreakdown(from: string, to: string): Promise<GA4DeviceRow[]> {
  const client = getClient();
  const [r] = await client.runReport({
    property: property(),
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [{ name: 'sessions' }, { name: 'transactions' }, { name: 'purchaseRevenue' }],
  });
  return (r.rows ?? []).map((row) => {
    const sessions = parseFloat(row.metricValues?.[0]?.value ?? '0');
    const transactions = parseFloat(row.metricValues?.[1]?.value ?? '0');
    return {
      device: row.dimensionValues?.[0]?.value ?? '-',
      sessions,
      transactions,
      purchaseRevenue: parseFloat(row.metricValues?.[2]?.value ?? '0'),
      conversionRate: sessions > 0 ? (transactions / sessions) * 100 : 0,
    };
  });
}

/** 신규 vs 재방문 — 'newVsReturning' dimension */
export async function fetchGA4NewVsReturning(from: string, to: string): Promise<GA4NewReturningRow[]> {
  const client = getClient();
  const [r] = await client.runReport({
    property: property(),
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'newVsReturning' }],
    metrics: [{ name: 'sessions' }, { name: 'transactions' }, { name: 'purchaseRevenue' }],
  });
  return (r.rows ?? []).map((row) => {
    const sessions = parseFloat(row.metricValues?.[0]?.value ?? '0');
    const transactions = parseFloat(row.metricValues?.[1]?.value ?? '0');
    return {
      cohort: row.dimensionValues?.[0]?.value ?? '-',
      sessions,
      transactions,
      purchaseRevenue: parseFloat(row.metricValues?.[2]?.value ?? '0'),
      conversionRate: sessions > 0 ? (transactions / sessions) * 100 : 0,
    };
  });
}
