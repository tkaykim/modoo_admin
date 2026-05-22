/** Supabase modoo — 실제 결제 + 마진 */

import { createAdminClient } from '@/lib/supabase-admin';

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

/** 기간 합산 매출/마진 */
export async function fetchOrderSummary(from: string, to: string): Promise<OrderSummary> {
  const supabase = createAdminClient();
  // order_profit_summary view 사용 — UA backfill + 인쇄비 포함
  const { data, error } = await supabase
    .from('order_profit_summary')
    .select('net_revenue,total_item_cost,total_print_cost,gross_profit')
    .gte('created_at', `${from}T00:00:00+09:00`)
    .lt('created_at', toExclusiveDate(to))
    .not('order_status', 'in', '(cancelled,refunded)');
  if (error) throw error;
  const rows = data ?? [];
  const sum = (k: keyof typeof rows[0]): number => rows.reduce((s, r) => s + parseFloat((r[k] as any) ?? '0'), 0);
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
    .select('created_at,net_revenue,gross_profit')
    .gte('created_at', `${from}T00:00:00+09:00`)
    .lt('created_at', toExclusiveDate(to))
    .not('order_status', 'in', '(cancelled,refunded)');
  if (error) throw error;
  // KST 일자별 집계
  const byDay = new Map<string, { orders: number; revenue: number; profit: number }>();
  for (const r of data ?? []) {
    const kst = new Date(new Date(r.created_at as string).getTime() + 9 * 3600_000);
    const day = kst.toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { orders: 0, revenue: 0, profit: 0 };
    cur.orders += 1;
    cur.revenue += parseFloat((r.net_revenue as any) ?? '0');
    cur.profit += parseFloat((r.gross_profit as any) ?? '0');
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
    for (const it of items ?? []) {
      const title = (it as any).product_title ?? '-';
      const qty = parseInt((it as any).quantity ?? '0', 10);
      const price = parseFloat((it as any).price_per_item ?? '0');
      const brand =
        (it as any).product?.manufacturer?.name ??
        ((it as any).product?.manufacturer && Array.isArray((it as any).product.manufacturer)
          ? (it as any).product.manufacturer[0]?.name
          : null);
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

/** UTM 기반 광고 매출 (utm_source IS NOT NULL) */
export async function fetchAdAttributedRevenue(from: string, to: string): Promise<{
  utm_source: string;
  utm_content: string | null;
  orders: number;
  revenue: number;
}[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .select('utm_source,utm_content,total_amount')
    .gte('created_at', `${from}T00:00:00+09:00`)
    .lt('created_at', toExclusiveDate(to))
    .eq('payment_status', 'completed')
    .not('utm_source', 'is', null);
  if (error) throw error;
  const byKey = new Map<string, { utm_source: string; utm_content: string | null; orders: number; revenue: number }>();
  for (const o of data ?? []) {
    const k = `${o.utm_source}::${o.utm_content ?? ''}`;
    const cur = byKey.get(k) ?? { utm_source: o.utm_source ?? '', utm_content: o.utm_content ?? null, orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += parseFloat((o.total_amount as any) ?? '0');
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
