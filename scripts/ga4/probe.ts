// 일회성 분석용 — 깊은 진단 쿼리들. funnel을 device/source/page별로 쪼갠다.
import { getGa4, getProperty } from '@/lib/ga4/client';

const ga4 = getGa4();
const PROPERTY = getProperty();

const DAYS = 90;
const dateRange = { startDate: `${DAYS}daysAgo`, endDate: 'today' };

const EVENTS = ['view_item', 'editor_open', 'design_complete', 'add_to_cart', 'begin_checkout', 'purchase'];

async function eventsByDevice() {
  const [resp] = await ga4.runReport({
    property: PROPERTY,
    dateRanges: [dateRange],
    dimensions: [{ name: 'eventName' }, { name: 'deviceCategory' }],
    metrics: [{ name: 'totalUsers' }, { name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', inListFilter: { values: EVENTS } },
    },
    limit: 100,
  });
  return (resp.rows ?? []).map((r) => ({
    event: r.dimensionValues?.[0]?.value,
    device: r.dimensionValues?.[1]?.value,
    users: Number(r.metricValues?.[0]?.value ?? 0),
    count: Number(r.metricValues?.[1]?.value ?? 0),
  }));
}

async function funnelBySource() {
  const [resp] = await ga4.runReport({
    property: PROPERTY,
    dateRanges: [dateRange],
    dimensions: [{ name: 'eventName' }, { name: 'sessionSourceMedium' }],
    metrics: [{ name: 'totalUsers' }, { name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', inListFilter: { values: EVENTS } },
    },
    limit: 500,
  });
  return (resp.rows ?? []).map((r) => ({
    event: r.dimensionValues?.[0]?.value,
    source: r.dimensionValues?.[1]?.value,
    users: Number(r.metricValues?.[0]?.value ?? 0),
    count: Number(r.metricValues?.[1]?.value ?? 0),
  }));
}

async function exitPagesAfterEditor() {
  const [resp] = await ga4.runReport({
    property: PROPERTY,
    dateRanges: [dateRange],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'userEngagementDuration' },
      { name: 'bounceRate' },
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { matchType: 'CONTAINS', value: '/editor' },
      },
    },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 30,
  });
  return (resp.rows ?? []).map((r) => ({
    page: r.dimensionValues?.[0]?.value,
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
    pageviews: Number(r.metricValues?.[1]?.value ?? 0),
    engagementSec: Number(r.metricValues?.[2]?.value ?? 0),
    bounceRate: Number(r.metricValues?.[3]?.value ?? 0),
  }));
}

async function checkoutCartPages() {
  const [resp] = await ga4.runReport({
    property: PROPERTY,
    dateRanges: [dateRange],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'screenPageViews' },
    ],
    dimensionFilter: {
      orGroup: {
        expressions: [
          { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/cart' } } },
          { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/checkout' } } },
          { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: '/toss' } } },
        ],
      },
    },
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 50,
  });
  return (resp.rows ?? []).map((r) => ({
    page: r.dimensionValues?.[0]?.value,
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
    users: Number(r.metricValues?.[1]?.value ?? 0),
    pageviews: Number(r.metricValues?.[2]?.value ?? 0),
  }));
}

async function designActionBreakdown() {
  const [resp] = await ga4.runReport({
    property: PROPERTY,
    dateRanges: [dateRange],
    dimensions: [{ name: 'eventName' }, { name: 'customEvent:action' }],
    metrics: [{ name: 'totalUsers' }, { name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'design_action' } },
    },
    limit: 50,
  });
  return (resp.rows ?? []).map((r) => ({
    event: r.dimensionValues?.[0]?.value,
    action: r.dimensionValues?.[1]?.value || '(none)',
    users: Number(r.metricValues?.[0]?.value ?? 0),
    count: Number(r.metricValues?.[1]?.value ?? 0),
  }));
}

(async () => {
  console.log('=== EVENTS BY DEVICE ===');
  console.log(JSON.stringify(await eventsByDevice(), null, 2));
  console.log('\n=== FUNNEL BY SOURCE/MEDIUM ===');
  console.log(JSON.stringify(await funnelBySource(), null, 2));
  console.log('\n=== EDITOR PAGES ===');
  console.log(JSON.stringify(await exitPagesAfterEditor(), null, 2));
  console.log('\n=== CART/CHECKOUT/TOSS PAGES ===');
  console.log(JSON.stringify(await checkoutCartPages(), null, 2));
  console.log('\n=== DESIGN_ACTION BREAKDOWN ===');
  try {
    console.log(JSON.stringify(await designActionBreakdown(), null, 2));
  } catch (e: any) {
    console.log('(custom dimension not registered:', e?.message, ')');
  }
})().catch((e) => {
  console.error('probe error:', e?.message || e);
  process.exit(1);
});
