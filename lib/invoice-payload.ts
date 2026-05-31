import type { InvoiceItem } from '@/types/types';

export function normalizeInvoiceItems(raw: InvoiceItem[]): InvoiceItem[] {
  return raw.map((i) => {
    const quantity = Math.max(1, Number(i.quantity) || 1);
    const unit_price = Math.max(0, Number(i.unit_price) || 0);
    return {
      ...i,
      name: String(i.name ?? '').trim(),
      quantity,
      unit_price,
      amount: quantity * unit_price,
      spec: i.spec?.trim() || '',
      remarks: i.remarks?.trim() || '',
      month: i.month?.trim() || '',
      day: i.day?.trim() || '',
    };
  });
}

export function computeInvoiceTotals(includeVat: boolean, items: InvoiceItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const vatAmount = includeVat ? Math.round(subtotal * 0.1) : 0;
  const totalAmount = subtotal + vatAmount;
  return { subtotal, vatAmount, totalAmount };
}

/**
 * 부가세 처리를 입력 기준(vatMode)에 따라 계산.
 *  - 'none'      : 부가세 없음 (거래명세서 VAT 미포함)
 *  - 'exclusive' : 입력 금액 = 공급가액 → 부가세 10% 가산 (기존 거래명세서 VAT 포함과 동일)
 *  - 'inclusive' : 입력 금액 = VAT 포함 합계 → 공급가액=합계/1.1, 부가세=합계-공급가액 (B2C 표시가→세금계산서)
 * 세금계산서/현금영수증은 보통 'inclusive'(주문 표시가가 부가세 포함이므로).
 */
export function computeInvoiceTotalsByMode(items: InvoiceItem[], vatMode: 'none' | 'exclusive' | 'inclusive') {
  const sum = items.reduce((s, item) => s + item.amount, 0);
  if (vatMode === 'none') {
    return { subtotal: sum, vatAmount: 0, totalAmount: sum };
  }
  if (vatMode === 'inclusive') {
    const subtotal = Math.round(sum / 1.1);
    return { subtotal, vatAmount: sum - subtotal, totalAmount: sum };
  }
  // exclusive
  const vatAmount = Math.round(sum * 0.1);
  return { subtotal: sum, vatAmount, totalAmount: sum + vatAmount };
}
