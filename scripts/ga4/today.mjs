import { readFileSync, existsSync } from 'node:fs';
const envPath = './.env.local';
if (existsSync(envPath)) for (const l of readFileSync(envPath,'utf8').split(/\r?\n/)) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2]; }
const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
const { GoogleAuth } = await import('google-auth-library');
const auth = new GoogleAuth({ credentials: { type:'authorized_user', client_id:process.env.GA4_OAUTH_CLIENT_ID, client_secret:process.env.GA4_OAUTH_CLIENT_SECRET, refresh_token:process.env.GA4_OAUTH_REFRESH_TOKEN }, scopes:['https://www.googleapis.com/auth/analytics.readonly']});
const client = new BetaAnalyticsDataClient({ auth });
const property = `properties/${process.env.GA4_MODOO_APP_PROPERTY_ID}`;
const [overall] = await client.runReport({ property, dateRanges:[{startDate:'today',endDate:'today'}], metrics:[{name:'sessions'},{name:'totalUsers'},{name:'engagementRate'},{name:'transactions'},{name:'purchaseRevenue'}]});
const [src] = await client.runReport({ property, dateRanges:[{startDate:'today',endDate:'today'}], dimensions:[{name:'sessionSourceMedium'}], metrics:[{name:'sessions'},{name:'transactions'},{name:'purchaseRevenue'}], orderBys:[{metric:{metricName:'sessions'},desc:true}], limit:10});
console.log(JSON.stringify({overall: overall.rows, src: src.rows}, null, 2));
