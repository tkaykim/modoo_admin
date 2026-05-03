import { SupabaseClient } from '@supabase/supabase-js';

export type RangePreset = 'this_week' | 'this_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom';

export type DateRange = {
  fromIso: string;
  toIso: string;
};

const KST_OFFSET_MIN = 9 * 60;

function nowKst(): Date {
  const now = new Date();
  return new Date(now.getTime() + (KST_OFFSET_MIN - -now.getTimezoneOffset()) * 60000);
}

function kstStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function kstStartOfMonth(d: Date): Date {
  const x = kstStartOfDay(d);
  x.setDate(1);
  return x;
}

function kstStartOfWeekMonday(d: Date): Date {
  const x = kstStartOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function kstQuarterStart(d: Date, q: 1 | 2 | 3 | 4): Date {
  return new Date(d.getFullYear(), (q - 1) * 3, 1);
}

function kstQuarterEndExclusive(d: Date, q: 1 | 2 | 3 | 4): Date {
  return new Date(d.getFullYear(), q * 3, 1);
}

export function resolveRange(
  preset: RangePreset,
  fromParam?: string | null,
  toParam?: string | null,
): DateRange {
  if (preset === 'custom' && fromParam && toParam) {
    return { fromIso: new Date(fromParam).toISOString(), toIso: new Date(toParam).toISOString() };
  }

  const now = nowKst();
  let from: Date;
  let to: Date;

  switch (preset) {
    case 'this_week':
      from = kstStartOfWeekMonday(now);
      to = new Date(from);
      to.setDate(to.getDate() + 7);
      break;
    case 'this_month': {
      from = kstStartOfMonth(now);
      to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
      break;
    }
    case 'q1':
    case 'q2':
    case 'q3':
    case 'q4': {
      const q = Number(preset.slice(1)) as 1 | 2 | 3 | 4;
      from = kstQuarterStart(now, q);
      to = kstQuarterEndExclusive(now, q);
      break;
    }
    default:
      from = kstStartOfMonth(now);
      to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  }

  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export type AnalyticsPayload = {
  range: { from: string; to: string; preset: RangePreset };
  visitors: { unique_sessions: number; pageviews: number; note?: string };
  orders: {
    total_count: number;
    paid_count: number;
    paid_revenue: number;
    refunded_count: number;
    refunded_amount: number;
    cancelled_count: number;
    cancelled_amount: number;
    confirmed_revenue: number;
  };
  orders_by_source: {
    homepage: { count: number; paid_revenue: number };
    external: { count: number; paid_revenue: number };
    other: { count: number; paid_revenue: number };
  };
  inquiries_by_source: {
    dashboard: number;
    chatbot: number;
    kakao: number;
  };
  daily_series: Array<{
    date: string;
    visitors: number;
    paid_revenue: number;
    refunded_amount: number;
    cancelled_amount: number;
    confirmed_revenue: number;
    order_count: number;
  }>;
};

type ListedOrder = {
  id: string;
  total_amount: number | null;
  payment_status: string | null;
  order_status: string | null;
  created_at: string;
};

async function fetchOrdersInRange(admin: SupabaseClient, range: DateRange): Promise<ListedOrder[]> {
  const PAGE = 1000;
  const out: ListedOrder[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from('orders')
      .select('id, total_amount, payment_status, order_status, created_at')
      .gte('created_at', range.fromIso)
      .lt('created_at', range.toIso)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ListedOrder[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function fetchVisitorEvents(admin: SupabaseClient, range: DateRange) {
  const PAGE = 1000;
  const out: Array<{ session_id: string | null; occurred_at: string }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from('analytics_events')
      .select('session_id, occurred_at')
      .eq('event_type', 'pageview')
      .gte('occurred_at', range.fromIso)
      .lt('occurred_at', range.toIso)
      .range(from, from + PAGE - 1);
    if (error) {
      if ((error as { code?: string }).code === '42P01') return [];
      throw new Error(error.message);
    }
    const rows = (data ?? []) as Array<{ session_id: string | null; occurred_at: string }>;
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function countInquiriesByTable(admin: SupabaseClient, table: string, range: DateRange) {
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte('created_at', range.fromIso)
    .lt('created_at', range.toIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countRealDashboardInquiries(admin: SupabaseClient, range: DateRange) {
  const { count, error } = await admin
    .from('inquiries')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', range.fromIso)
    .lt('created_at', range.toIso)
    .or('is_admin.is.null,is_admin.eq.false');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function classifyOrderSource(id: string): 'homepage' | 'external' | 'other' {
  if (id.startsWith('ORD-') || id.startsWith('COBUY-')) return 'homepage';
  if (id.startsWith('ORDER-')) return 'external';
  return 'other';
}

function kstDayKey(iso: string): string {
  const d = new Date(iso);
  const utcMs = d.getTime();
  const kst = new Date(utcMs + 9 * 60 * 60000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDailyKeys(range: DateRange): string[] {
  const start = new Date(new Date(range.fromIso).getTime() + 9 * 60 * 60000);
  const end = new Date(new Date(range.toIso).getTime() + 9 * 60 * 60000);
  const keys: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur < stop) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    keys.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys;
}

export async function buildAnalyticsPayload(
  admin: SupabaseClient,
  preset: RangePreset,
  range: DateRange,
): Promise<AnalyticsPayload> {
  const [orders, visitorEvents, dashboardInquiries, chatbotInquiries] = await Promise.all([
    fetchOrdersInRange(admin, range),
    fetchVisitorEvents(admin, range),
    countRealDashboardInquiries(admin, range),
    countInquiriesByTable(admin, 'chatbot_inquiries', range),
  ]);

  const isCancelled = (o: ListedOrder) => o.order_status === 'cancelled';
  const isPaid = (o: ListedOrder) => o.payment_status === 'completed' && !isCancelled(o);
  const isRefunded = (o: ListedOrder) => o.payment_status === 'refunded';

  const paidOrders = orders.filter(isPaid);
  const sumPaid = paidOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const paidCount = paidOrders.length;
  const refunded = orders.filter(isRefunded);
  const refundedAmount = refunded.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const cancelled = orders.filter(isCancelled);
  const cancelledAmount = cancelled.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);

  const bySource = { homepage: { count: 0, paid_revenue: 0 }, external: { count: 0, paid_revenue: 0 }, other: { count: 0, paid_revenue: 0 } };
  for (const o of orders) {
    const cls = classifyOrderSource(o.id);
    bySource[cls].count += 1;
    if (isPaid(o)) bySource[cls].paid_revenue += Number(o.total_amount ?? 0);
  }

  const uniqueSessions = new Set(visitorEvents.map((e) => e.session_id).filter((s): s is string => !!s)).size;

  const keys = buildDailyKeys(range);
  const daily = new Map<string, { visitors: Set<string>; paid_revenue: number; refunded_amount: number; cancelled_amount: number; order_count: number }>();
  keys.forEach((k) => daily.set(k, { visitors: new Set(), paid_revenue: 0, refunded_amount: 0, cancelled_amount: 0, order_count: 0 }));

  for (const e of visitorEvents) {
    const k = kstDayKey(e.occurred_at);
    const slot = daily.get(k);
    if (slot && e.session_id) slot.visitors.add(e.session_id);
  }
  for (const o of orders) {
    const k = kstDayKey(o.created_at);
    const slot = daily.get(k);
    if (!slot) continue;
    slot.order_count += 1;
    if (isPaid(o)) slot.paid_revenue += Number(o.total_amount ?? 0);
    if (isRefunded(o)) slot.refunded_amount += Number(o.total_amount ?? 0);
    if (isCancelled(o)) slot.cancelled_amount += Number(o.total_amount ?? 0);
  }

  const daily_series = keys.map((k) => {
    const s = daily.get(k)!;
    return {
      date: k,
      visitors: s.visitors.size,
      paid_revenue: s.paid_revenue,
      refunded_amount: s.refunded_amount,
      cancelled_amount: s.cancelled_amount,
      confirmed_revenue: s.paid_revenue - s.refunded_amount,
      order_count: s.order_count,
    };
  });

  return {
    range: { from: range.fromIso, to: range.toIso, preset },
    visitors: {
      unique_sessions: uniqueSessions,
      pageviews: visitorEvents.length,
      note: visitorEvents.length === 0 ? '아직 트래킹 이벤트가 수집되지 않았습니다. modoo_app에 PageviewTracker 연결 후 집계됩니다.' : undefined,
    },
    orders: {
      total_count: orders.length,
      paid_count: paidCount,
      paid_revenue: sumPaid,
      refunded_count: refunded.length,
      refunded_amount: refundedAmount,
      cancelled_count: cancelled.length,
      cancelled_amount: cancelledAmount,
      confirmed_revenue: sumPaid - refundedAmount,
    },
    orders_by_source: bySource,
    inquiries_by_source: {
      dashboard: dashboardInquiries,
      chatbot: chatbotInquiries,
      kakao: 0,
    },
    daily_series,
  };
}
