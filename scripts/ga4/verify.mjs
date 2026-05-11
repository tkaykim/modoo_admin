// 인증/권한 검증용 최소 호출. dotenv 로드 후 minimal report 1건 실행.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
const { GoogleAuth } = await import('google-auth-library');

const auth = new GoogleAuth({
  credentials: {
    type: 'authorized_user',
    client_id: process.env.GA4_OAUTH_CLIENT_ID,
    client_secret: process.env.GA4_OAUTH_CLIENT_SECRET,
    refresh_token: process.env.GA4_OAUTH_REFRESH_TOKEN,
  },
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
});
const client = new BetaAnalyticsDataClient({ auth });
const property = `properties/${process.env.GA4_MODOO_APP_PROPERTY_ID}`;

try {
  const [resp] = await client.runReport({
    property,
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
  });
  console.log('OK:', JSON.stringify({
    rowCount: resp.rowCount,
    totals: resp.totals?.[0]?.metricValues?.map((v) => v.value),
  }));
} catch (e) {
  console.error('FAIL:', e.code, e.message);
  process.exit(1);
}
