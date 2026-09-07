import type { SupabaseClient } from '@supabase/supabase-js';
import { revenueState, isTestOrder } from './revenue';
import { bucketKey, bucketKeys, bucketStart, bucketEnd, bucketLabel, dayKey, kstIso, monthStart, weekStart, addDays, lastBucketComparison, type Grain } from './time';
export type Bucket = Grain;
export type DateBasis = 'created_at' | 'paid_at';
export type RangePreset = 'this_week' | 'this_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom';
export type DateRange = {fromIso: string; toIso: string};
export function resolveRange(preset: RangePreset, from?: string | null, to?: string | null): DateRange {
  if (preset === 'custom') {
    if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) throw new RangeError('시작일과 종료일이 필요합니다.');
    const range = {fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString()};
    if (range.fromIso >= range.toIso || Date.parse(to) - Date.parse(from) > 1100 * 86400000) throw new RangeError('조회 기간은 최대 3년입니다.');
    return range;
  }
  const today = dayKey();
  if (preset === 'this_week') {const start = weekStart(today); return {fromIso: kstIso(start), toIso: kstIso(addDays(start, 7))};}
  const q = /^q[1-4]$/.test(preset) ? Number(preset.slice(1)) : null;
  const start = q ? `${today.slice(0, 4)}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01` : monthStart(today);
  return {fromIso: kstIso(start), toIso: kstIso(monthStart(start, q ? 3 : 1))};
}
export type ListedOrder = {
  id: string; total_amount: number | null; payment_status: string | null; order_status: string | null;
  created_at: string; paid_at: string | null; utm_campaign?: string | null;
};
export async function fetchOrdersInRange(admin: SupabaseClient, range: DateRange, basis: DateBasis = 'created_at'): Promise<ListedOrder[]> {
  const out: ListedOrder[] = [];
  if (range.fromIso >= range.toIso) return out;
  for (let from = 0; ; from += 1000) {
    const {data, error} = await admin.from('orders').select('id,total_amount,payment_status,order_status,created_at,paid_at,utm_campaign')
      .gte(basis, range.fromIso).lt(basis, range.toIso).order(basis).order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ListedOrder[];
    out.push(...rows.filter(o => !isTestOrder(o)));
    if (rows.length < 1000) break;
    if (from >= 99000) throw new RangeError('주문이 많아 기간을 줄여야 합니다.');
  }
  return out;
}
export function summarizeOrders(orders: ListedOrder[]) {
  const result = {total_count: orders.length, paid_count: 0, paid_revenue: 0, refunded_count: 0, refunded_amount: 0, cancelled_count: 0, cancelled_amount: 0, confirmed_revenue: 0};
  for (const o of orders) {
    const amount = Number(o.total_amount ?? 0);
    switch (revenueState(o)) {
      case 'paid': result.paid_count++; result.confirmed_revenue += amount; result.paid_revenue += amount; break;
      case 'refunded': result.refunded_count++; result.refunded_amount += amount; result.paid_revenue += amount; break;
      case 'cancelled': result.cancelled_count++; result.cancelled_amount += amount; break;
    }
  }
  return result;
}
export type SeriesPoint = {
  date: string; label: string; from: string; to: string; partial: boolean; available: boolean;
  visitors: number | null; paid_revenue: number; refunded_amount: number; cancelled_amount: number;
  confirmed_revenue: number; order_count: number; paid_count: number;
};
type VisitorStats = {pageviews: number; unique_sessions: number; buckets: Record<string, number>; first_event_at: string | null};
export function aggregateSeries(orders: ListedOrder[], range: DateRange, grain: Grain, basis: DateBasis, asOf: string, firstOrder: string | null, visitors?: VisitorStats | null): SeriesPoint[] {
  const end = new Date(Math.min(Date.parse(range.toIso), Date.parse(asOf))).toISOString();
  const keys = bucketKeys(range.fromIso, end, grain);
  const grouped = new Map<string, ListedOrder[]>();
  for (const order of orders) {
    const at = order[basis];
    if (!at || Date.parse(at) < Date.parse(range.fromIso) || Date.parse(at) >= Date.parse(end) || isTestOrder(order)) continue;
    const key = bucketKey(at, grain);
    const rows = grouped.get(key) ?? []; rows.push(order); grouped.set(key, rows);
  }
  return keys.map(key => {
    const start = bucketStart(key, grain), stop = bucketEnd(key, grain);
    const from = start < range.fromIso ? range.fromIso : start;
    const to = stop > end ? end : stop;
    const summary = summarizeOrders(grouped.get(key) ?? []);
    return {date:key, label:bucketLabel(key,grain), from, to,
      partial: from !== start || to !== stop || (!!firstOrder && firstOrder > from && firstOrder < to),
      available: !!firstOrder && firstOrder < to,
      visitors: visitors?.first_event_at && visitors.first_event_at < to ? Number(visitors.buckets[key] ?? 0) : null,
      paid_revenue:summary.paid_revenue, refunded_amount:summary.refunded_amount, cancelled_amount:summary.cancelled_amount,
      confirmed_revenue:summary.confirmed_revenue, order_count:summary.total_count, paid_count:summary.paid_count};
  });
}
export type AnalyticsPayload = Awaited<ReturnType<typeof buildAnalyticsPayload>>;
export async function buildAnalyticsPayload(admin: SupabaseClient, preset: RangePreset, requested: DateRange, bucket: Bucket = 'day', basis: DateBasis = 'created_at', asOf = new Date().toISOString()) {
  const range = {fromIso: requested.fromIso, toIso: new Date(Math.max(Date.parse(requested.fromIso), Math.min(Date.parse(requested.toIso), Date.parse(asOf)))).toISOString()};
  bucketKeys(range.fromIso, range.toIso, bucket);
  const errors: string[] = [];
  const [orders, visitorsResult, firstResult, dashboard, chatbot, missing] = await Promise.all([
    fetchOrdersInRange(admin, range, basis),
    admin.rpc('admin_visitor_stats_v2', {p_from: range.fromIso, p_to: range.toIso, p_grain:bucket}),
    admin.from('orders').select('created_at').order('created_at').limit(1),
    admin.from('inquiries').select('id',{count:'exact',head:true}).gte('created_at',range.fromIso).lt('created_at',range.toIso).or('is_admin.is.null,is_admin.eq.false'),
    admin.from('chatbot_inquiries').select('id',{count:'exact',head:true}).gte('created_at',range.fromIso).lt('created_at',range.toIso),
    basis === 'paid_at' ? admin.from('orders').select('total_amount').is('paid_at',null).in('payment_status',['completed','refunded']).gte('created_at',range.fromIso).lt('created_at',range.toIso).limit(10000) : Promise.resolve({data:[],error:null}),
  ]);
  if (firstResult.error) throw new Error(firstResult.error.message);
  if (visitorsResult.error) errors.push('방문 데이터 조회 실패');
  if (dashboard.error || chatbot.error) errors.push('일부 문의 데이터 조회 실패');
  if (missing.error) errors.push('결제일 누락 점검 실패');
  const visitors = visitorsResult.error ? null : visitorsResult.data as VisitorStats;
  const firstOrder = (firstResult.data?.[0]?.created_at as string | undefined) ?? null;
  const bySource = {homepage:{count:0,paid_revenue:0},external:{count:0,paid_revenue:0},other:{count:0,paid_revenue:0}};
  for (const o of orders) {
    const source = /^(ORD-|COBUY-)/.test(o.id) ? 'homepage' : o.id.startsWith('ORDER-') ? 'external' : 'other';
    bySource[source].count++;
    if (revenueState(o) === 'paid') bySource[source].paid_revenue += Number(o.total_amount ?? 0);
  }
  async function comparison(steps = 1) {
    const pair = lastBucketComparison(range.fromIso, range.toIso, bucket, steps);
    if (!pair) return null;
    if (!firstOrder || Date.parse(firstOrder) >= Date.parse(pair.current.toIso)) return null;
    const subset = (rows: ListedOrder[], r: DateRange) => rows.filter(o=>o[basis] && Date.parse(o[basis]!) >= Date.parse(r.fromIso) && Date.parse(o[basis]!) < Date.parse(r.toIso));
    const prior = pair.previous.fromIso >= range.fromIso ? subset(orders,pair.previous) : await fetchOrdersInRange(admin,pair.previous,basis);
    const current = summarizeOrders(subset(orders,pair.current)).confirmed_revenue;
    const previous = summarizeOrders(prior).confirmed_revenue;
    const available = firstOrder !== null && firstOrder <= pair.previous.fromIso;
    return {...pair,currentRevenue:current,previousRevenue:available?previous:null,changePct:available&&previous>0?(current-previous)/previous*100:null};
  }
  const [previousComparison, weekdayComparison] = await Promise.all([comparison(),bucket==='day'?comparison(7):Promise.resolve(null)]);
  return {
    range:{from:range.fromIso,to:range.toIso,requestedTo:requested.toIso,preset}, bucket, basis, generatedAt:asOf,
    orders:summarizeOrders(orders), daily_series:aggregateSeries(orders, range, bucket, basis, asOf, firstOrder, visitors), orders_by_source:bySource,
    comparison:previousComparison,weekdayComparison,
    visitors:{unique_sessions:visitors?.first_event_at && visitors.first_event_at < range.toIso ? visitors.unique_sessions : null,pageviews:visitors?.first_event_at && visitors.first_event_at < range.toIso ? visitors.pageviews : null},
    inquiries_by_source:{dashboard:dashboard.error ? null : dashboard.count ?? 0,chatbot:chatbot.error ? null : chatbot.count ?? 0,kakao:null},
    quality:{errors,firstOrderAt:firstOrder,firstEventAt:visitors?.first_event_at ?? null,
      ordersAvailable:!!firstOrder && firstOrder < range.toIso,
      partialCoverage:!!firstOrder && firstOrder > range.fromIso || !!visitors?.first_event_at && visitors.first_event_at > range.fromIso,
      missingPaidAt:missing.error ? null : missing.data?.length ?? 0,
      missingPaidAtAmount:missing.error ? null : (missing.data ?? []).reduce((sum:number,o:{total_amount:unknown}) => sum + Number(o.total_amount ?? 0),0),
      historicalPaidAtApproximate:basis === 'paid_at' && Date.parse(range.fromIso) < Date.parse('2026-07-11T00:00:00+09:00')},
  };
}
