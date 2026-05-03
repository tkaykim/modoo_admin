export interface PricingInfo {
  unitPrice: number;
  totalPrice: number;
  note?: string;
}

export function getPricingInfo(qty: number): PricingInfo | null {
  if (qty < 20) return null; // 1~19: 성수기 제작불가
  if (qty <= 30) return { unitPrice: Math.round(1800000 / qty), totalPrice: 1800000, note: '(고정가)' };
  if (qty <= 50) return { unitPrice: 58000, totalPrice: qty * 58000 };
  if (qty <= 70) return { unitPrice: 56000, totalPrice: qty * 56000 };
  return { unitPrice: 53000, totalPrice: qty * 53000 };
}
