/** Supabase modoo — 실제 결제 + 마진 */

import { createAdminClient } from '@/lib/supabase-admin';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type ProfitRow = {
  order_id: string;
  created_at?: string;
  order_status: string | null;
  net_revenue: number | string | null;
  total_item_cost: number | string | null;
  total_print_cost: number | string | null;
  gross_profit: number | string | null;
};

type OrderStatusRow = {
  id: string;
  payment_status: string | null;
  order_status: string | null;
};

export interface OrderSummary {
  orders: number;
  revenue: number;
  itemCost: number;
  printCost: number;
  grossProfit: number;
  marginPct: number;
}

export interface DailyOrderRow {
  day: string;
  orders: number;
  revenue: number;
  grossProfit: number;
}

export interface TopProductRow {
  product_title: string;
  brand: string | null;
  orders: number;
  quantity: number;
  revenue: number;
}

type ManufacturerRef = { name: string | null };

type TopProductItemRow = {
  product_title: string | null;
  quantity: number | string | null;
  price_per_item: number | string | null;
  product?: {
    manufacturer?: ManufacturerRef | ManufacturerRef[] | null;
  } | null;
};

type AdAttributedOrderRow = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  total_amount: number | string | null;
};

function toAmount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function getManufacturerName(row: TopProductItemRow): string | null {
  const manufacturer = row.product?.manufacturer;
  if (Array.isArray(manufacturer)) return manufacturer[0]?.name ?? null;
  return manufacturer?.name ?? null;
}

async function filterPaidProfitRows(supabase: SupabaseAdmin, rows: ProfitRow[]): Promise<ProfitRow[]> {
  if (rows.length === 0) return [];

  const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))];
  const statuses = new Map<string, OrderStatusRow>();
  const chunkSize = 500;

  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('orders')
      .select('id,payment_status,order_status')
      .in('id', chunk);

    if (error) throw error;

    for (const order of (data ?? []) as OrderStatusRow[]) {
      statuses.set(order.id, order);
    }
  }

  return rows.filter((row) => {
    const order = statuses.get(row.order_id);
    const orderStatus = order?.order_status ?? row.order_status;
    return order?.payment_status === 'completed' && orderStatus !== 'cancelled';
  });
}

/** 기간 합산 매출/마진 */
export async function fetchOrderSummary(from: string, to: string): Promise<OrderSummary> {
  const supabase = createAdminClient();
  // order_profit_summary view 사용 — UA backfill + 인쇄비 포함
  const { data, error } = await supabase
    .from('order_profit_summary')
    .select('order_id,order_status,net_revenue,total_item_cost,total_print_cost,gross_profit')
    .gte('created_at', `${from}T00:00:00+09:00`)
    .lt('created_at', toExclusiveDate(to))
    .neq('order_status', 'cancelled');
  if (error) throw error;
  const rows = await filterPaidProfitRows(supabase, ((data ?? []) as ProfitRow[]));
  const sum = (k: keyof Pick<ProfitRow, 'net_revenue' | 'total_item_cost' | 'total_print_cost' | 'gross_profit'>): number =>
    rows.reduce((s, r) => s + toAmount(r[k]), 0);
  const revenue = sum('net_revenue');
  const itemCost = sum('total_item_cost');
  const printCost = sum('total_print_cost');
  const grossProfit = sum('gross_profit');
  return {
    orders: rows.length,
    revenue,
    itemCost,
    printCost,
    grossProfit,
    marginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
  };
}

/** 일별 매출 시계열 */
export async function fetchDailyRevenue(from: string, to: string): Promise<DailyOrderRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('order_profit_summary')
    .select('order_id,created_at,order_status,net_revenue,total_item_cost,total_print_cost,gross_profit')
    .gte('created_at', `${from}T00:00:00+09:00`)
    .lt('created_at', toExclusiveDate(to))
    .neq('order_status', 'cancelled');
  if (error) throw error;
  const rows = await filterPaidProfitRows(supabase, ((data ?? []) as ProfitRow[]));
  // KST 일자별 집계
  const byDay = new Map<string, { orders: number; revenue: number; profit: number }>();
  for (const r of rows) {
    const kst = new Date(new Date(r.created_at as string).getTime() + 9 * 3600_000);
    const day = kst.toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { orders: 0, revenue: 0, profit: 0 };
    cur.orders += 1;
    cur.revenue += toAmount(r.net_revenue);
    cur.profit += toAmount(r.gross_profit);
    byDay.set(day, cur);
  }
  return Array.from(byDay.entries())
    .map(([day, v]) => ({ day, orders: v.orders, revenue: v.revenue, grossProfit: v.profit }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** 기간 상품 매출 TOP N */
export async function fetchTopProducts(from: string, to: string, limit = 10): Promise<TopProductRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('exec_report_top_products', {
    p_from: from,
    p_to: to,
    p_limit: limit,
  });
  if (error) {
    // RPC 없으면 폴백: 직접 query
    const { data: items, error: e2 } = await supabase
      .from('order_items')
      .select('product_title, quantity, price_per_item, order:orders!inner(payment_status,created_at), product:products(manufacturer:manufacturers(name))')
      .gte('order.created_at', `${from}T00:00:00+09:00`)
      .lt('order.created_at', toExclusiveDate(to))
      .eq('order.payment_status', 'completed');
    if (e2) throw e2;
    // 집계
    const byKey = new Map<string, TopProductRow>();
    for (const it of (items ?? []) as TopProductItemRow[]) {
      const title = it.product_title ?? '-';
      const qty = Number.parseInt(String(it.quantity ?? '0'), 10);
      const price = toAmount(it.price_per_item);
      const brand = getManufacturerName(it);
      const k = `${brand ?? ''}::${title}`;
      const cur = byKey.get(k) ?? { product_title: title, brand: brand ?? null, orders: 0, quantity: 0, revenue: 0 };
      cur.orders += 1;
      cur.quantity += qty;
      cur.revenue += price * qty;
      byKey.set(k, cur);
    }
    return Array.from(byKey.values()).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
  }
  return (data ?? []) as TopProductRow[];
}

export interface AdAttributedRow {
  utm_source: string;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  orders: number;
  revenue: number;
}

/** UTM 기반 광고 매출 (utm_source IS NOT NULL) — 5필드 그룹화 */
export async function fetchAdAttributedRevenue(from: string, to: string): Promise<AdAttributedRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .select('utm_source,utm_medium,utm_campaign,utm_content,utm_term,total_amount')
    .gte('created_at', `${from}T00:00:00+09:00`)
    .lt('created_at', toExclusiveDate(to))
    .eq('payment_status', 'completed')
    .not('utm_source', 'is', null);
  if (error) throw error;
  const byKey = new Map<string, AdAttributedRow>();
  for (const o of (data ?? []) as AdAttributedOrderRow[]) {
    const k = `${o.utm_source}::${o.utm_medium ?? ''}::${o.utm_campaign ?? ''}::${o.utm_content ?? ''}::${o.utm_term ?? ''}`;
    const cur = byKey.get(k) ?? {
      utm_source: o.utm_source ?? '',
      utm_medium: o.utm_medium ?? null,
      utm_campaign: o.utm_campaign ?? null,
      utm_content: o.utm_content ?? null,
      utm_term: o.utm_term ?? null,
      orders: 0,
      revenue: 0,
    };
    cur.orders += 1;
    cur.revenue += toAmount(o.total_amount);
    byKey.set(k, cur);
  }
  return Array.from(byKey.values()).sort((a, b) => b.revenue - a.revenue);
}

function toExclusiveDate(toInclusive: string): string {
  // to 일자 포함 → 다음날 00:00 미만으로 변환
  const d = new Date(toInclusive + 'T00:00:00+09:00');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
