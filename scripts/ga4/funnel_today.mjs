import { readFileSync, existsSync } from 'node:fs';
const envPath = './.env.local';
if (existsSync(envPath)) for (const l of readFileSync(envPath,'utf8').split(/\r?\n/)) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2]; }
const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
const { GoogleAuth } = await import('google-auth-library');
const auth = new GoogleAuth({ credentials: { type:'authorized_user', client_id:process.env.GA4_OAUTH_CLIENT_ID, client_secret:process.env.GA4_OAUTH_CLIENT_SECRET, refresh_token:process.env.GA4_OAUTH_REFRESH_TOKEN }, scopes:['https://www.googleapis.com/auth/analytics.readonly']});
const client = new BetaAnalyticsDataClient({ auth });
const property = `properties/${process.env.GA4_MODOO_APP_PROPERTY_ID}`;
const rpt = async (name, body) => { const [r] = await client.runReport({ property, ...body }); return { name, rows: (r.rows ?? []).map(row => ({ d: row.dimensionValues?.map(v=>v.value), m: row.metricValues?.map(v=>v.value) })) }; };

const out = {};
out.events_today = await rpt('events_today', { dateRanges:[{startDate:'today',endDate:'today'}], dimensions:[{name:'eventName'}], metrics:[{name:'eventCount'},{name:'totalUsers'}], orderBys:[{metric:{metricName:'eventCount'},desc:true}], limit:20 });
out.landing_today = await rpt('landing_today', { dateRanges:[{startDate:'today',endDate:'today'}], dimensions:[{name:'landingPagePlusQueryString'}], metrics:[{name:'sessions'},{name:'engagementRate'},{name:'transactions'}], orderBys:[{metric:{metricName:'sessions'},desc:true}], limit:10 });
out.device_today = await rpt('device_today', { dateRanges:[{startDate:'today',endDate:'today'}], dimensions:[{name:'deviceCategory'}], metrics:[{name:'sessions'},{name:'engagementRate'},{name:'transactions'}] });
out.hour_today = await rpt('hour_today', { dateRanges:[{startDate:'today',endDate:'today'}], dimensions:[{name:'hour'}], metrics:[{name:'sessions'},{name:'transactions'}], orderBys:[{dimension:{dimensionName:'hour'}}] });
console.log(JSON.stringify(out, null, 1));
