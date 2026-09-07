import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateSeries,summarizeOrders,resolveRange,type ListedOrder} from './aggregations';
import {bucketKeys,kstIso,trendRange,calendarComparison,weekStart,validateYmd,bucketKey,lastBucketComparison} from './time';
import {revenueState} from './revenue';
const asOf='2026-09-06T06:00:00.000Z';
const order=(patch:Partial<ListedOrder>={}):ListedOrder=>({id:'ORD-real',created_at:'2026-09-05T01:00:00.000Z',paid_at:'2026-09-06T01:00:00.000Z',total_amount:10000,payment_status:'completed',order_status:'delivered',...patch});
const range={fromIso:kstIso('2026-09-01'),toIso:kstIso('2026-10-01')};
test('future excluded; genuine intervening and trailing zero days retained',()=>{
  const rows=aggregateSeries([order()],range,'day','created_at',asOf,kstIso('2026-01-01'));
  assert.equal(rows.length,6);assert.equal(rows[0].confirmed_revenue,0);assert.equal(rows[4].confirmed_revenue,10000);
  assert.equal(rows[5].confirmed_revenue,0);assert.equal(rows[5].partial,true);assert.equal(rows[4].partial,false);
});
test('week uses Monday through Sunday including cross year',()=>{
  assert.equal(weekStart('2026-09-06'),'2026-08-31');assert.equal(weekStart('2026-09-07'),'2026-09-07');
  assert.equal(weekStart('2026-01-01'),'2025-12-29');
  assert.equal(bucketKey('2026-09-06T15:00:00Z','week'),'2026-09-07');
});
test('one partial month produces one visible point with same KPI sum',()=>{
  const rows=aggregateSeries([order()],{fromIso:kstIso('2026-09-01'),toIso:kstIso('2026-09-07')},'month','created_at',asOf,kstIso('2026-01-01'));
  assert.equal(rows.length,1);assert.equal(rows[0].confirmed_revenue,10000);assert.equal(rows[0].partial,true);
});
test('custom partial first/last buckets do not include orders outside selection',()=>{
  const rows=aggregateSeries([order(),order({created_at:'2026-09-01T01:00:00Z'}),order({created_at:asOf})],{fromIso:kstIso('2026-09-03'),toIso:kstIso('2026-09-07')},'week','created_at',asOf,kstIso('2026-01-01'));
  assert.equal(rows.length,1);assert.equal(rows[0].confirmed_revenue,10000);assert.equal(rows[0].partial,true);
});
test('gross = retained + refund; refunds dominate cancellation without double subtraction',()=>{
  const list=[order(),order({payment_status:'refunded',order_status:'cancelled',total_amount:5000}),order({payment_status:'pending',total_amount:99999}),order({order_status:'cancelled',total_amount:7000})];
  const s=summarizeOrders(list);assert.equal(s.confirmed_revenue,10000);assert.equal(s.paid_revenue,15000);assert.equal(s.refunded_amount,5000);assert.equal(s.cancelled_amount,7000);assert.equal(s.paid_count,1);
  assert.equal(revenueState({payment_status:'completed',order_status:'refunded'}),'refunded');
});
test('paid date moves revenue without falling back missing paid_at; tests excluded',()=>{
  const rows=aggregateSeries([order(),order({id:'ORD-E2E-1'}),order({paid_at:null}),order({utm_campaign:'grp-E2E-demo'})],range,'day','paid_at',asOf,kstIso('2026-01-01'));
  assert.equal(rows[4].confirmed_revenue,0);assert.equal(rows[5].confirmed_revenue,10000);
});
test('before source coverage is unavailable, within source is real zero',()=>{
  const rows=aggregateSeries([],range,'day','created_at',asOf,kstIso('2026-09-03'));
  assert.equal(rows[0].available,false);assert.equal(rows[2].available,true);assert.equal(rows[2].confirmed_revenue,0);
});
test('daily/weekly/monthly trend defaults contain requested bucket count',()=>{
  for(const [g,n] of [['day',30],['week',12],['month',12]] as const){const r=trendRange(g,n,0,false,new Date(asOf));assert.equal(bucketKeys(kstIso(r.fromYmd),asOf,g).length,n);}
  assert.equal(trendRange('month',12,0,true,new Date(asOf)).toYmd,'2026-09-01');
});
test('calendar month actual vs common elapsed completed days',()=>{
  assert.deepEqual(calendarComparison('2026-09-01','2026-10-01',new Date(asOf)),{current:{fromYmd:'2026-09-01',toYmd:'2026-09-06'},previous:{fromYmd:'2026-08-01',toYmd:'2026-08-06'}});
  assert.equal(calendarComparison('2026-09-01','2026-10-01',new Date('2026-10-02')).previous.fromYmd,'2026-08-01');
});
test('validation rejects invalid calendar dates, empty and reversed range; bounded hours',()=>{
  assert.equal(validateYmd('2026-02-30'),false);assert.equal(validateYmd('2024-02-29'),true);
  assert.throws(()=>resolveRange('custom','','2026-09-01'),RangeError);
  assert.throws(()=>resolveRange('custom','2026-09-06','2026-09-01'),RangeError);
  assert.throws(()=>bucketKeys(kstIso('2026-01-01'),kstIso('2026-06-01'),'hour'),RangeError);
  assert.deepEqual(bucketKeys(kstIso('2026-09-07'),asOf,'day'),[]);
});
test('KST results independent of host timezone, exact end exclusive',()=>{
  const previous=process.env.TZ;
  try {for(const tz of ['UTC','Asia/Seoul','America/Los_Angeles']){process.env.TZ=tz;assert.equal(bucketKey('2026-09-05T15:00:00Z','day'),'2026-09-06');assert.deepEqual(bucketKeys(kstIso('2026-09-01'),kstIso('2026-09-03'),'day'),['2026-09-01','2026-09-02']);}}
  finally {process.env.TZ=previous;}
});
test('last partial bucket compares equal elapsed hours and preserves calendar full months',()=>{
  const day=lastBucketComparison(range.fromIso,asOf,'day')!;
  assert.equal(day.current.fromIso,kstIso('2026-09-06'));assert.equal(day.previous.fromIso,kstIso('2026-09-05'));
  assert.equal(day.previous.toIso,'2026-09-05T06:00:00.000Z');
  const week=lastBucketComparison(kstIso('2026-08-01'),asOf,'week')!;
  assert.equal(week.current.fromIso,kstIso('2026-08-31'));assert.equal(week.previous.fromIso,kstIso('2026-08-24'));
  const month=lastBucketComparison(kstIso('2026-08-01'),kstIso('2026-10-01'),'month')!;
  assert.equal(month.previous.fromIso,kstIso('2026-08-01'));assert.equal(month.previous.toIso,kstIso('2026-09-01'));
});
test('shorter previous month clamps comparison current only, empty overlap returns null',()=>{
  const pair=lastBucketComparison(kstIso('2026-03-01'),kstIso('2026-03-31'),'month')!;
  assert.equal(pair.previous.toIso,kstIso('2026-03-01'));assert.equal(pair.current.toIso,kstIso('2026-03-29'));
  assert.equal(lastBucketComparison(kstIso('2026-03-30'),kstIso('2026-03-31'),'month'),null);
});
