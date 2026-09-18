/**
 * 주문 단위 할인·쿠폰·추가금을 품목별로 나눠 "실결제 기준 벌당 단가"를 구한다.
 *
 * 배경: order_items.price_per_item 은 제품가 + 인쇄비 + 관리자 단가 조정까지만 담는다.
 * 쿠폰·관리자 할인·추가금·전체금액 직접입력 차액은 orders 에만 주문 단위로 저장된다.
 * 그래서 품목 줄에 저장 단가만 보여주면 할인이 빠진 금액이 된다.
 *
 * 규칙
 * - 배분 대상 금액 = orders.total_amount - delivery_fee (배송비는 품목 몫이 아니다).
 *   total_amount 를 쓰는 이유: 쿠폰·할인·추가금·"기타 조정"이 모두 여기에 최종 반영돼 있다.
 * - 각 품목의 정가 소계(단가 × 수량) 비율대로 나눈다.
 * - 원 단위로 떨어지도록 내림한 뒤, 남는 원은 소수점 이하가 큰 품목부터 1원씩 준다.
 *   그래서 품목별 실결제 소계의 합이 배분 대상 금액과 정확히 같다.
 * - 수량 0(고객 입력 대기) 품목은 배분하지 않는다.
 */

export interface PricedItem {
  id: string;
  unitPrice: number;
  quantity: number;
}

export interface EffectiveItemPrice {
  listSubtotal: number;
  effectiveSubtotal: number;
  effectiveUnitPrice: number;
}

export function getPaidForItems(totalAmount: number | null | undefined, deliveryFee: number | null | undefined): number {
  return Math.max(0, Math.round(Number(totalAmount ?? 0) - Number(deliveryFee ?? 0)));
}

export function allocateOrderAdjustments(items: PricedItem[], paidForItems: number): Map<string, EffectiveItemPrice> {
  const result = new Map<string, EffectiveItemPrice>();
  const priced = items
    .map((item) => ({
      id: item.id,
      quantity: Math.max(0, Number(item.quantity) || 0),
      listSubtotal: Math.max(0, Number(item.unitPrice) || 0) * Math.max(0, Number(item.quantity) || 0),
    }))
    .filter((item) => item.quantity > 0 && item.listSubtotal > 0);

  const listTotal = priced.reduce((sum, item) => sum + item.listSubtotal, 0);
  if (listTotal <= 0) return result;

  const target = Math.max(0, Math.round(paidForItems));
  const shares = priced.map((item) => {
    const exact = (item.listSubtotal * target) / listTotal;
    const floored = Math.floor(exact);
    return { ...item, floored, remainder: exact - floored };
  });

  let leftover = target - shares.reduce((sum, share) => sum + share.floored, 0);
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder || b.listSubtotal - a.listSubtotal);
  for (const share of byRemainder) {
    if (leftover <= 0) break;
    share.floored += 1;
    leftover -= 1;
  }

  for (const share of shares) {
    result.set(share.id, {
      listSubtotal: share.listSubtotal,
      effectiveSubtotal: share.floored,
      effectiveUnitPrice: Math.round(share.floored / share.quantity),
    });
  }
  return result;
}
