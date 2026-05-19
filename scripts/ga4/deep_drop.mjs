import { readFileSync, existsSync } from 'node:fs';
if (existsSync('./.env.local')) for (const l of readFileSync('./.env.local','utf8').split(/\r?\n/)) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2]; }
const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
const { GoogleAuth } = await import('google-auth-library');
const auth = new GoogleAuth({ credentials: { type:'authorized_user', client_id:process.env.GA4_OAUTH_CLIENT_ID, client_secret:process.env.GA4_OAUTH_CLIENT_SECRET, refresh_token:process.env.GA4_OAUTH_REFRESH_TOKEN }, scopes:['https://www.googleapis.com/auth/analytics.readonly']});
const client = new BetaAnalyticsDataClient({ auth });
const property = `properties/${process.env.GA4_MODOO_APP_PROPERTY_ID}`;
const rpt = async (n, b) => { const [r]=await client.runReport({property,...b}); return {n, rows:(r.rows??[]).map(x=>({d:x.dimensionValues?.map(v=>v.value),m:x.metricValues?.map(v=>v.value)}))}; };
const out={};
out.dc_yesterday_by_source = await rpt('dc_by_source', { dateRanges:[{startDate:'yesterday',endDate:'yesterday'}], dimensions:[{name:'sessionSourceMedium'},{name:'eventName'}], metrics:[{name:'eventCount'},{name:'totalUsers'}], dimensionFilter:{filter:{fieldName:'eventName',inListFilter:{values:['design_complete','add_to_cart','begin_checkout','purchase','checkout_intent','view_cart']}}} });
out.dc_yesterday_by_returning = await rpt('dc_by_returning', { dateRanges:[{startDate:'yesterday',endDate:'yesterday'}], dimensions:[{name:'newVsReturning'},{name:'eventName'}], metrics:[{name:'eventCount'}], dimensionFilter:{filter:{fieldName:'eventName',inListFilter:{values:['design_complete','add_to_cart','begin_checkout','purchase']}}} });
out.pages_yesterday = await rpt('pages_yesterday', { dateRanges:[{startDate:'yesterday',endDate:'yesterday'}], dimensions:[{name:'pagePath'}], metrics:[{name:'screenPageViews'},{name:'totalUsers'},{name:'userEngagementDuration'}], orderBys:[{metric:{metricName:'screenPageViews'},desc:true}], limit:25 });
out.today_returning = await rpt('today_returning', { dateRanges:[{startDate:'today',endDate:'today'}], dimensions:[{name:'newVsReturning'}], metrics:[{name:'sessions'},{name:'totalUsers'},{name:'transactions'}] });
console.log(JSON.stringify(out,null,1));
