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
