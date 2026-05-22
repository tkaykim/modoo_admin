/** GA4 Data API 호출 — 세션/채널/전환 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { GoogleAuth } from 'google-auth-library';

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
