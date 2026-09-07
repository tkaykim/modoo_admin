import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedMarketingRead, channelOf, creativeVerdict, isConfirmedMarketingOrder, mapConcurrent, metaPurchaseMetrics, ratio, reportingDays, reportingRange } from './marketing-metrics';

test('paid source requires exact source and paid medium; substring sources are never Meta', () => {
  assert.equal(channelOf('naver', 'organic'), '네이버 자연');
  assert.equal(channelOf('NAVER', 'CPC'), '네이버 검색광고');
  assert.equal(channelOf('instagram', 'paid_social'), 'Meta 광고');
  assert.equal(channelOf('facebook', 'social'), 'SNS 자연');
  assert.equal(channelOf('organic', 'paid'), '기타');
  assert.equal(channelOf('google', 'cpc'), '기타');
  assert.equal(channelOf(null, 'paid'), '직접·자연');
});

test('confirmed revenue excludes pending, cancellations, refunds and both test markers', () => {
  const paid = { payment_status: 'completed', order_status: 'completed' };
  assert.equal(isConfirmedMarketingOrder(paid), true);
  assert.equal(isConfirmedMarketingOrder({ ...paid, payment_status: 'pending' }), false);
  assert.equal(isConfirmedMarketingOrder({ ...paid, order_status: 'cancelled' }), false);
  assert.equal(isConfirmedMarketingOrder({ ...paid, payment_status: 'refunded' }), false);
  assert.equal(isConfirmedMarketingOrder({ ...paid, order_status: 'refunded' }), false);
  assert.equal(isConfirmedMarketingOrder({ ...paid, utm_campaign: 'grp-E2E-test' }), false);
  assert.equal(isConfirmedMarketingOrder({ ...paid, id: 'ORD-E2E-123' }), false);
});

test('Meta aliases represent one purchase: 37 is never added into 148', () => {
  const types = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'];
  const m = metaPurchaseMetrics({ spend: '100000', actions: types.map((action_type) => ({ action_type, value: '37' })), action_values: types.map((action_type) => ({ action_type, value: '3178000' })) });
  assert.equal(m.purchases, 37);
  assert.equal(m.purchaseValue, 3178000);
  assert.equal(m.roas, 31.78);
});

test('explicit zero stays zero, count and value cannot silently come from different scopes', () => {
  const row = { spend: '100', actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '0' }, { action_type: 'purchase', value: '9' }], action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '0' }, { action_type: 'purchase', value: '900' }] };
  assert.equal(metaPurchaseMetrics(row).roas, 0);
  assert.equal(metaPurchaseMetrics(row).purchases, 0);
  assert.equal(metaPurchaseMetrics({ ...row, action_values: [{ action_type: 'purchase', value: '900' }] }).purchaseValue, null);
  assert.equal(metaPurchaseMetrics(row, 'unknown_scope').roas, null);
  assert.equal(metaPurchaseMetrics().roas, null);
  assert.equal(metaPurchaseMetrics({}).purchases, null);
});

test('ratio distinguishes a known zero numerator, absent spend, and a zero denominator', () => {
  assert.equal(ratio(0, 100), 0);
  assert.equal(ratio(100, null), null);
  assert.equal(ratio(null, 100), null);
  assert.equal(ratio(100, 0), null);
  assert.equal(ratio(100, Infinity), null);
  assert.equal(ratio(300 + 700, 100 + 400), 2);
});

test('default ad range ends yesterday in KST, including UTC date boundary', () => {
  const r = reportingRange(new URLSearchParams('days=14'), new Date('2026-09-06T15:00:00Z'));
  assert.equal(r.since, '2026-08-24');
  assert.equal(r.until, '2026-09-06');
  assert.equal(r.toExclusive, '2026-09-06T15:00:00.000Z');
  assert.equal(r.incomplete, false);
  assert.equal(reportingDays(r.since, r.until).length, 14);
});

test('explicit today clips DB at asOf, future is omitted and all elapsed zero dates remain', () => {
  const r = reportingRange(new URLSearchParams('since=2026-09-01&until=2026-09-30'), new Date('2026-09-06T03:00:00Z'));
  assert.equal(r.until, '2026-09-06');
  assert.equal(r.toExclusive, '2026-09-06T03:00:00.000Z');
  assert.equal(r.incomplete, true);
  assert.deepEqual(reportingDays(r.since, r.until), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
  for (const query of ['days=NaN', 'days=0', 'days=999', 'since=2026-02-30&until=2026-03-01', 'since=2026-09-07&until=2026-09-06']) {
    assert.throws(() => reportingRange(new URLSearchParams(query), new Date('2026-09-06T03:00:00Z')));
  }
});

test('CTR cannot produce winners and short or missing conversion data does not generate verdicts', () => {
  const base = { spend: 50000, effectiveStatus: 'ACTIVE', roas: 350, purchases: 3 };
  assert.equal(creativeVerdict(base, 7).verdict, 'watch');
  assert.equal(creativeVerdict({ ...base, roas: null }, 30).verdict, 'watch');
  assert.equal(creativeVerdict({ ...base, purchases: null }, 30).verdict, 'watch');
  assert.equal(creativeVerdict({ ...base, purchases: 0, roas: 0 }, 30).verdict, 'kill');
  assert.equal(creativeVerdict(base, 14).verdict, 'winner');
});

test('provider work is bounded and output order is preserved', async () => {
  let active = 0; let peak = 0;
  const result = await mapConcurrent([1, 2, 3, 4, 5], 2, async (value) => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--; return value * 2;
  });
  assert.equal(peak, 2);
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
});

test('cache shares reads, bypass refreshes, and failures never become a successful zero', async () => {
  let calls = 0;
  const read = async () => ++calls;
  const [a, b] = await Promise.all([cachedMarketingRead('test:success', read), cachedMarketingRead('test:success', read)]);
  assert.equal(a.value, 1); assert.equal(b.value, 1); assert.equal(calls, 1);
  assert.equal((await cachedMarketingRead('test:success', read, true)).value, 2);
  await assert.rejects(cachedMarketingRead('test:failure', async () => { throw new Error('offline'); }));
  assert.equal((await cachedMarketingRead('test:failure', async () => 5)).value, 5);
});
