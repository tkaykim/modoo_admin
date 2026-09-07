import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { createRequire } from 'node:module';
import { NextRequest } from 'next/server';

// Route boundary tests isolate external services; no credentials or live writes.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Module = require('node:module') as any;
const originalLoad = Module._load;
let failCurrent = false;
let failPrevious = false;
let failDaily = false;
let failDb = false;
let spend = 100;
const admin = { from() {
  const query = {
    select() { return query; }, gte() { return query; }, lt() { return query; }, order() { return query; },
    async range() {
      return failDb ? { data: null, error: { message: 'DB unavailable' } } : { error: null, data: [
        { id: 'paid', total_amount: 1000, payment_status: 'completed', order_status: 'confirmed', created_at: '2024-02-02T01:00:00Z' },
        { id: 'refund', total_amount: 500, payment_status: 'completed', order_status: 'refunded', created_at: '2024-02-02T01:00:00Z' },
        { id: 'ORD-E2E-test', total_amount: 9999, payment_status: 'completed', order_status: 'confirmed', created_at: '2024-02-02T01:00:00Z' },
      ] };
    },
  };
  return query;
} };
Module._load = function(request: string, ...args: unknown[]) {
  if (request.includes('require-marketing-access')) return { requireMarketingAccess: async () => ({ user: { id: 'test' } }) };
  if (request.includes('supabase-admin')) return { createAdminClient: () => admin };
  if (request.endsWith('meta-ads')) return {
    fetchAccountSummary: async (since: string) => {
      if (since === '2024-02-01' ? failCurrent : failPrevious) throw new Error('Meta unavailable');
      return { spend, impressions: 100, clicks: 10, reach: 50 };
    },
    fetchInsightsDaily: async () => {
      if (failDaily) throw new Error('Daily unavailable');
      return [{ date_start: '2024-02-02', spend: String(spend) }];
    },
  };
  return originalLoad.call(this, request, ...args);
};
const { GET } = require('../../app/api/admin/analytics/ad-efficiency/route');
after(() => { Module._load = originalLoad; });
async function get(from = '2024-02-01', to = '2024-03-01') {
  const response = await GET(new NextRequest(`https://example.test/api/admin/analytics/ad-efficiency?from=${from}&to=${to}`));
  return { status: response.status, body: await response.json() };
}
function reset() { failCurrent = false; failPrevious = false; failDaily = false; failDb = false; spend = 100; }

test('Meta detail uses calendar month, valid paid orders and all past days', async () => {
  reset();
  const { status, body: { data } } = await get();
  assert.equal(status, 200);
  assert.deepEqual(data.previousRange, { from: '2024-01-01', to: '2024-02-01' });
  assert.equal(data.daily.length, 29);
  assert.equal(data.daily[0].spend, 0);
  assert.equal(data.daily[0].revenue, 0);
  assert.equal(data.current.revenue, 1000);
  assert.equal(data.current.orders, 1);
  assert.equal(data.current.roas, 1000);
  assert.equal(data.daily.reduce((sum: number, d: { revenue: number }) => sum + d.revenue, 0), data.current.revenue);
  assert.ok(data.generatedAt);
});

test('summary failures preserve unknown and expose previous failures', async () => {
  reset(); failCurrent = true; failPrevious = true;
  const { body: { data } } = await get();
  assert.equal(data.current.spend, null);
  assert.equal(data.current.roas, null);
  assert.equal(data.current.ctr, null);
  assert.equal(data.current.revenue, 1000);
  assert.equal(data.previous.spend, null);
  assert.ok(data.metaError);
  assert.ok(data.previousMetaError);
  assert.equal(data.daily[1].spend, 100);
});

test('daily failures never silently become zero spend', async () => {
  reset(); failDaily = true;
  const { body: { data } } = await get();
  assert.ok(data.dailyMetaError);
  assert.equal(data.current.spend, 100);
  assert.ok(data.daily.every((d: { spend: null }) => d.spend === null));
});

test('successful zero spend remains zero but its ratio is undefined', async () => {
  reset(); spend = 0;
  const { body: { data } } = await get();
  assert.equal(data.current.spend, 0);
  assert.equal(data.current.roas, null);
  assert.equal(data.metaError, null);
});

test('DB failures block revenue and dependent metrics without hiding Meta', async () => {
  reset(); failDb = true;
  const { body: { data } } = await get();
  assert.equal(data.current.revenue, null);
  assert.equal(data.current.roas, null);
  assert.equal(data.current.spend, 100);
  assert.ok(data.dbError);
  assert.ok(data.previousDbError);
  assert.ok(data.daily.every((d: { revenue: null }) => d.revenue === null));
});

test('invalid dates reject and future periods create no zero points', async () => {
  reset();
  assert.equal((await get('2024-02-30', '2024-03-02')).status, 400);
  const { body: { data } } = await get('2099-01-01', '2099-02-01');
  assert.equal(data.hasCompleteDays, false);
  assert.deepEqual(data.daily, []);
  assert.equal(data.current.revenue, null);
});

test('a shorter previous month limits comparison without truncating actual current dates', async () => {
  reset();
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(value?: string | number) { super(value ?? '2024-03-31T06:00:00Z'); }
    static now() { return RealDate.parse('2024-03-31T06:00:00Z'); }
  } as DateConstructor;
  try {
    const { body: { data } } = await get('2024-03-01', '2024-04-01');
    assert.deepEqual(data.effectiveRange, { from: '2024-03-01', to: '2024-03-31' });
    assert.deepEqual(data.comparisonRange, { from: '2024-03-01', to: '2024-03-30' });
    assert.deepEqual(data.previousRange, { from: '2024-02-01', to: '2024-03-01' });
    assert.equal(data.daily.length, 30);
    assert.equal(data.daily.at(-1).date, '2024-03-30');
    assert.ok(data.comparisonCurrent);
  } finally { globalThis.Date = RealDate; }
});

test('calendar-year comparison preserves January 1 across leap years', () => {
  const { calendarComparison } = require('./time');
  const complete = calendarComparison('2025-01-01', '2026-01-01', new Date('2026-05-01T00:00:00Z'));
  assert.deepEqual(complete.previous, { fromYmd: '2024-01-01', toYmd: '2025-01-01' });
  const partial = calendarComparison('2026-01-01', '2027-01-01', new Date('2026-09-06T00:00:00Z'));
  assert.deepEqual(partial.previous, { fromYmd: '2025-01-01', toYmd: '2025-09-06' });
});
