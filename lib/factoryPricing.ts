import type {
  FactoryPricingModel,
  FactoryPrintMethodPricing,
  PrintSize,
} from '@/types/types';

export const FACTORY_PRINT_SIZES: PrintSize[] = ['10x10', 'A4', 'A3'];

export interface FactoryPricingRowInput {
  print_method_id: string;
  size: PrintSize;
  pricing_model: FactoryPricingModel;
  unit_price?: number | null;
  base_price?: number | null;
  base_quantity?: number | null;
  additional_price_per_piece?: number | null;
  is_active?: boolean;
  note?: string | null;
}

export function isPrintSize(value: unknown): value is PrintSize {
  return value === '10x10' || value === 'A4' || value === 'A3';
}

export function isPricingModel(value: unknown): value is FactoryPricingModel {
  return value === 'flat' || value === 'bulk';
}

export interface ValidatedPricingRow {
  print_method_id: string;
  size: PrintSize;
  pricing_model: FactoryPricingModel;
  unit_price: number | null;
  base_price: number | null;
  base_quantity: number | null;
  additional_price_per_piece: number | null;
  is_active: boolean;
  note: string | null;
}

export function validatePricingRow(input: unknown): ValidatedPricingRow | { error: string } {
  if (!input || typeof input !== 'object') {
    return { error: '단가 행 형식이 올바르지 않습니다.' };
  }
  const row = input as Record<string, unknown>;
  if (typeof row.print_method_id !== 'string' || !row.print_method_id) {
    return { error: '인쇄기법 ID가 필요합니다.' };
  }
  if (!isPrintSize(row.size)) {
    return { error: '사이즈는 10x10/A4/A3 중 하나여야 합니다.' };
  }
  if (!isPricingModel(row.pricing_model)) {
    return { error: 'pricing_model은 flat 또는 bulk여야 합니다.' };
  }

  const toNumber = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const unit_price = toNumber(row.unit_price);
  const base_price = toNumber(row.base_price);
  const base_quantity_raw = toNumber(row.base_quantity);
  const base_quantity = base_quantity_raw === null ? null : Math.round(base_quantity_raw);
  const additional_price_per_piece = toNumber(row.additional_price_per_piece);

  if (row.pricing_model === 'flat') {
    if (unit_price === null || unit_price < 0) {
      return { error: 'flat 단가는 0 이상의 unit_price가 필요합니다.' };
    }
  } else {
    if (base_price === null || base_price < 0) {
      return { error: 'bulk 단가는 base_price가 필요합니다.' };
    }
    if (base_quantity === null || base_quantity <= 0) {
      return { error: 'bulk 단가는 양의 base_quantity가 필요합니다.' };
    }
    if (additional_price_per_piece === null || additional_price_per_piece < 0) {
      return { error: 'bulk 단가는 additional_price_per_piece가 필요합니다.' };
    }
  }

  return {
    print_method_id: row.print_method_id,
    size: row.size,
    pricing_model: row.pricing_model,
    unit_price: row.pricing_model === 'flat' ? unit_price : null,
    base_price: row.pricing_model === 'bulk' ? base_price : null,
    base_quantity: row.pricing_model === 'bulk' ? base_quantity : null,
    additional_price_per_piece:
      row.pricing_model === 'bulk' ? additional_price_per_piece : null,
    is_active: typeof row.is_active === 'boolean' ? row.is_active : true,
    note: typeof row.note === 'string' ? row.note : null,
  };
}

/**
 * Calculates the total factory cost for a given pricing row and quantity.
 * - flat: unit_price * quantity
 * - bulk: base_price covers first base_quantity units;
 *         each additional unit adds additional_price_per_piece.
 */
export function calculateFactoryAmount(
  row: Pick<
    FactoryPrintMethodPricing,
    'pricing_model' | 'unit_price' | 'base_price' | 'base_quantity' | 'additional_price_per_piece'
  >,
  quantity: number
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (row.pricing_model === 'flat') {
    if (row.unit_price === null || row.unit_price === undefined) return null;
    return Math.round(row.unit_price * quantity);
  }
  if (row.pricing_model === 'bulk') {
    if (
      row.base_price === null || row.base_price === undefined ||
      row.base_quantity === null || row.base_quantity === undefined ||
      row.additional_price_per_piece === null || row.additional_price_per_piece === undefined
    ) return null;
    const extra = Math.max(0, quantity - row.base_quantity);
    return Math.round(row.base_price + extra * row.additional_price_per_piece);
  }
  return null;
}
