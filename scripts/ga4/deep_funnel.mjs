import { readFileSync, existsSync } from 'node:fs';
if (existsSync('./.env.local')) for (const l of readFileSync('./.env.local','utf8').split(/\r?\n/)) { const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2]; }
const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
const { GoogleAuth } = await import('google-auth-library');
const auth = new GoogleAuth({ credentials: { type:'authorized_user', client_id:process.env.GA4_OAUTH_CLIENT_ID, client_secret:process.env.GA4_OAUTH_CLIENT_SECRET, refresh_token:process.env.GA4_OAUTH_REFRESH_TOKEN }, scopes:['https://www.googleapis.com/auth/analytics.readonly']});
const client = new BetaAnalyticsDataClient({ auth });
const property = `properties/${process.env.GA4_MODOO_APP_PROPERTY_ID}`;
const rpt = async (name, body) => { const [r] = await client.runReport({ property, ...body }); return { name, rows:(r.rows??[]).map(row=>({d:row.dimensionValues?.map(v=>v.value),m:row.metricValues?.map(v=>v.value)})) }; };
const out={};
// 어제 동일 퍼널 (비교용)
out.events_yesterday = await rpt('events_yesterday', { dateRanges:[{startDate:'yesterday',endDate:'yesterday'}], dimensions:[{name:'eventName'}], metrics:[{name:'eventCount'},{name:'totalUsers'}], orderBys:[{metric:{metricName:'eventCount'},desc:true}], limit:30 });
// 오늘 결제 관련 이벤트 모든 종류
out.checkout_events_today = await rpt('checkout_events_today', { dateRanges:[{startDate:'today',endDate:'today'}], dimensions:[{name:'eventName'}], metrics:[{name:'eventCount'},{name:'totalUsers'}], dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{matchType:'PARTIAL_REGEXP',value:'(checkout|payment|cart|purchase|order|toss|pay)'}}} });
// 오늘 begin_checkout 후 페이지 흐름
out.pages_after_begincheckout = await rpt('pages_today', { dateRanges:[{startDate:'today',endDate:'today'}], dimensions:[{name:'pagePath'}], metrics:[{name:'screenPageViews'},{name:'totalUsers'}], dimensionFilter:{filter:{fieldName:'pagePath',stringFilter:{matchType:'PARTIAL_REGEXP',value:'(checkout|payment|cart|pay|order|complete|success|fail)'}}}, orderBys:[{metric:{metricName:'screenPageViews'},desc:true}], limit:30 });
// 3일 daily 퍼널 비교
out.funnel_3d = await rpt('funnel_3d', { dateRanges:[{startDate:'3daysAgo',endDate:'today'}], dimensions:[{name:'date'},{name:'eventName'}], metrics:[{name:'eventCount'}], dimensionFilter:{filter:{fieldName:'eventName',inListFilter:{values:['session_start','view_item','add_to_cart','begin_checkout','purchase','checkout_intent','design_complete']}}}, orderBys:[{dimension:{dimensionName:'date'}}] });
console.log(JSON.stringify(out,null,1));
