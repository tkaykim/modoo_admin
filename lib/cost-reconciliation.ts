export type CashAllocation = {
  case_key: string;
  transaction_key: string;
  direction: 'receipt' | 'cost' | 'refund';
  amount_gross: number | string;
  is_estimate: boolean;
  reason: string;
};

export type LegacyCostAdjustment = {
  case_key: string;
  amount_gross: number | string;
  cost_class: 'customer_compensation' | 'customer_refund' | 'other';
  is_estimate: boolean;
  reason: string;
};

// Observed cash movement is not accrual revenue, completed-order cost, or profit.
export function summarizeLegacyCash(rows: CashAllocation[], adjustments: LegacyCostAdjustment[] = []) {
  const result = { receipt: 0, cost: 0, refund: 0, estimatedCost: 0, evidenceCost: 0, cashDifference: 0 };
  for (const row of rows) {
    const value = Number(row.amount_gross);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid cash allocation');
    result[row.direction] += value;
    if (row.direction === 'cost' && row.is_estimate) result.estimatedCost += value;
  }
  for (const adjustment of adjustments) {
    const value = Number(adjustment.amount_gross);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid legacy cost adjustment');
    result.cost += value;
    result.evidenceCost += value;
    if (adjustment.is_estimate) result.estimatedCost += value;
  }
  result.cashDifference = result.receipt - result.cost - result.refund;
  return result;
}
