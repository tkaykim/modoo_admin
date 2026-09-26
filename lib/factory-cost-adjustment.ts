import type { FactoryCostSource } from '@/types/types';

export function requiresFactoryCostReason(
  additionalAmount: number | string | null | undefined,
  source: FactoryCostSource | '' | null | undefined,
): boolean {
  const amount = Number(additionalAmount || 0);
  return amount !== 0 || source === 'manual' || source === 'negotiated' || source === 'override';
}
