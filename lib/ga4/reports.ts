import { getGa4, getProperty } from './client';
import { FUNNEL_STEPS } from './events';

const dateRange = (days: number) => ({
  startDate: `${days}daysAgo`,
  endDate: 'today',
});

type Row = Record<string, string | number>;

const flatten = (rows: any[] | null | undefined, dims: string[], mets: string[]): Row[] =>
  (rows ?? []).map((r) => {
    const out: Row = {};
    dims.forEach((d, i) => (out[d] = r.dimensionValues?.[i]?.value ?? ''));
    mets.forEach((m, i) => {
      const v = r.metricValues?.[i]?.value ?? '0';
      out[m] = /^[0-9.]+$/.test(v) ? Number(v) : v;
    });
    return out;
  });

export async function traffic(days: number) {
  const dims = ['date', 'sessionSourceMedium'];
  const mets = ['sessions', 'totalUsers', 'screenPageViews', 'engagementRate'];
  const [resp] = await getGa4().runReport({
    property: getProperty(),
    dateRanges: [dateRange(days)],
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }],
    limit: 500,
  });
  return flatten(resp.rows, dims, mets);
}

export async function topPages(days: number) {
  const dims = ['pagePath', 'pageTitle'];
  const mets = ['screenPageViews', 'totalUsers', 'averageSessionDuration'];
  const [resp] = await getGa4().runReport({
    property: getProperty(),
    dateRanges: [dateRange(days)],
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 30,
  });
  return flatten(resp.rows, dims, mets);
}

export async function campaigns(days: number) {
  const dims = ['sessionSource', 'sessionMedium', 'sessionCampaignName'];
  const mets = ['sessions', 'totalUsers', 'conversions', 'totalRevenue'];
  const [resp] = await getGa4().runReport({
    property: getProperty(),
    dateRanges: [dateRange(days)],
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 100,
  });
  return flatten(resp.rows, dims, mets);
}

export async function events(days: number, eventName?: string) {
  const dims = ['eventName'];
  const mets = ['eventCount', 'totalUsers', 'eventValue'];
  const [resp] = await getGa4().runReport({
    property: getProperty(),
    dateRanges: [dateRange(days)],
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    dimensionFilter: eventName
      ? {
          filter: {
            fieldName: 'eventName',
            stringFilter: { matchType: 'EXACT', value: eventName },
          },
        }
      : undefined,
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 200,
  });
  return flatten(resp.rows, dims, mets);
}

export async function realtime() {
  const dims = ['country'];
  const mets = ['activeUsers'];
  const [resp] = await getGa4().runRealtimeReport({
    property: getProperty(),
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
  });
  const rows = flatten(resp.rows, dims, mets);
  const total = rows.reduce((s, r) => s + Number(r.activeUsers || 0), 0);
  return { total, byCountry: rows };
}

export async function revenue(days: number) {
  const dims = ['date', 'sessionSourceMedium'];
  const mets = ['totalRevenue', 'transactions', 'purchaseRevenue', 'averagePurchaseRevenue'];
  const [resp] = await getGa4().runReport({
    property: getProperty(),
    dateRanges: [dateRange(days)],
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }],
    limit: 500,
  });
  return flatten(resp.rows, dims, mets);
}

export async function funnel(days: number) {
  const eventList = FUNNEL_STEPS.map((s) => s.event);
  const [resp] = await getGa4().runReport({
    property: getProperty(),
    dateRanges: [dateRange(days)],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: eventList },
      },
    },
  });
  const flat = flatten(resp.rows, ['eventName'], ['eventCount', 'totalUsers']);
  const byEvent = Object.fromEntries(flat.map((r) => [r.eventName as string, r]));
  const top = byEvent[FUNNEL_STEPS[0].event];
  const baseUsers = Number(top?.totalUsers ?? 0);
  return FUNNEL_STEPS.map((s) => {
    const r = byEvent[s.event];
    const users = Number(r?.totalUsers ?? 0);
    const count = Number(r?.eventCount ?? 0);
    return {
      step: s.name,
      event: s.event,
      users,
      eventCount: count,
      conversionFromTopPct: baseUsers > 0 ? Number(((users / baseUsers) * 100).toFixed(2)) : 0,
    };
  });
}
