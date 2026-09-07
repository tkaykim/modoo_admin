export type RevenueOrder = { payment_status: string | null; order_status: string | null };
export function revenueState(o: RevenueOrder): 'paid' | 'refunded' | 'cancelled' | 'pending' {
  if (o.payment_status === 'refunded' || o.order_status === 'refunded') return 'refunded';
  if (o.order_status === 'cancelled') return 'cancelled';
  if (o.payment_status === 'completed') return 'paid';
  return 'pending';
}
export function isTestOrder(o: {id?: string | null; utm_campaign?: string | null}): boolean {
  return /^ORD-E2E/i.test(o.id ?? '') || /^grp-E2E/i.test(o.utm_campaign ?? '');
}
