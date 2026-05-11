import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) for (const l of readFileSync(envPath,'utf8').split(/\r?\n/)) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2]; }
const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
const { GoogleAuth } = await import('google-auth-library');
const auth = new GoogleAuth({ credentials: { type:'authorized_user', client_id:process.env.GA4_OAUTH_CLIENT_ID, client_secret:process.env.GA4_OAUTH_CLIENT_SECRET, refresh_token:process.env.GA4_OAUTH_REFRESH_TOKEN }, scopes:['https://www.googleapis.com/auth/analytics.readonly']});
const client = new BetaAnalyticsDataClient({ auth });
const property = `properties/${process.env.GA4_MODOO_APP_PROPERTY_ID}`;

async function rpt(name, body) {
  const [r] = await client.runReport({ property, ...body });
  return { name, rows: (r.rows ?? []).map(row => ({ d: row.dimensionValues?.map(v=>v.value), m: row.metricValues?.map(v=>v.value) })) };
}

const out = {};
out.overall_7d = await rpt('overall_7d', {
  dateRanges:[{startDate:'7daysAgo',endDate:'today'}],
  metrics:[{name:'sessions'},{name:'totalUsers'},{name:'engagementRate'},{name:'transactions'},{name:'purchaseRevenue'}],
});
out.sourceMedium_7d = await rpt('sourceMedium_7d', {
  dateRanges:[{startDate:'7daysAgo',endDate:'today'}],
  dimensions:[{name:'sessionSourceMedium'}],
  metrics:[{name:'sessions'},{name:'totalUsers'},{name:'transactions'},{name:'purchaseRevenue'}],
  orderBys:[{metric:{metricName:'sessions'},desc:true}],
  limit: 15,
});
out.meta_30d = await rpt('meta_30d', {
  dateRanges:[{startDate:'30daysAgo',endDate:'today'}],
  dimensions:[{name:'sessionSourceMedium'},{name:'sessionCampaignName'}],
  metrics:[{name:'sessions'},{name:'transactions'},{name:'purchaseRevenue'}],
  dimensionFilter:{ filter:{ fieldName:'sessionSource', stringFilter:{ matchType:'PARTIAL_REGEXP', value:'(facebook|instagram|fb|ig|meta)' }}},
  orderBys:[{metric:{metricName:'sessions'},desc:true}],
  limit: 30,
});
out.daily_7d = await rpt('daily_7d', {
  dateRanges:[{startDate:'7daysAgo',endDate:'today'}],
  dimensions:[{name:'date'}],
  metrics:[{name:'sessions'},{name:'transactions'},{name:'purchaseRevenue'}],
  orderBys:[{dimension:{dimensionName:'date'}}],
});

console.log(JSON.stringify(out, null, 2));
