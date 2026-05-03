/** Matches public.orders.orders_order_category_check */
export type OrderCategoryValue = 'cobuy' | 'regular' | 'salesman_direct' | null | undefined;

export function orderCategoryLabel(cat: OrderCategoryValue): string {
  if (cat === 'cobuy') return '공동구매';
  if (cat === 'salesman_direct') return '영업 직판';
  return '일반';
}

export function orderCategoryBadgeClass(cat: OrderCategoryValue): string {
  if (cat === 'cobuy') return 'bg-purple-100 text-purple-800';
  if (cat === 'salesman_direct') return 'bg-emerald-100 text-emerald-800';
  return 'bg-gray-100 text-gray-700';
}

/** 공유 주문 페이지 — 일반만 '주문' 접미 사용 */
export function orderCategoryLabelShare(cat: OrderCategoryValue): string {
  if (cat === 'cobuy') return '공동구매';
  if (cat === 'salesman_direct') return '영업 직판';
  return '일반 주문';
}
