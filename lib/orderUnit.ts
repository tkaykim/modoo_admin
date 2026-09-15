/**
 * 주문 품목 수량 단위.
 *
 * 의류는 "벌", 가방·모자 같은 패션잡화는 "개"로 센다.
 * 분류가 비어 있는 제품은 대부분 의류라서 "벌"로 본다.
 * 새 굿즈 분류가 생기면 GOODS_CATEGORIES 에 추가한다.
 */
const GOODS_CATEGORIES = new Set(['패션잡화']);

export type OrderUnit = '벌' | '개';

export function getOrderItemUnit(category: string | null | undefined): OrderUnit {
  return category && GOODS_CATEGORIES.has(category.trim()) ? '개' : '벌';
}

/**
 * 주문 전체를 한 단위로 부를 때 쓴다.
 * 의류와 잡화가 섞이면 "벌"이 틀린 말이 되므로 "개"로 통일한다.
 */
export function getCommonOrderUnit(categories: Array<string | null | undefined>): OrderUnit {
  if (categories.length === 0) return '벌';
  return categories.every((category) => getOrderItemUnit(category) === '벌') ? '벌' : '개';
}
