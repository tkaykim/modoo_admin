import type {
  FactoryPricingModel,
  FactoryPrintMethodPricing,
} from '@/types/types';

/**
 * Suggested labels for the size dropdown — admin can still type any string.
 * Includes common square sizes and the customer-facing canonical labels.
 */
export const SUGGESTED_SIZE_LABELS: string[] = [
  '10x10', '15x15', '20x20', '25x25', '28x28',
  '30x30', '35x35', '40x40', '45x45',
  'A4', 'A3',
];

export interface FactoryPricingRowInput {
  print_method_id: string;
  size: string;
  max_width_cm?: number | null;
  max_height_cm?: number | null;
  pricing_model: FactoryPricingModel;
  unit_price?: number | null;
  base_price?: number | null;
  base_quantity?: number | null;
  additional_price_per_piece?: number | null;
  is_active?: boolean;
  note?: string | null;
}

export function isPricingModel(value: unknown): value is FactoryPricingModel {
  return value === 'flat' || value === 'bulk';
}

export interface ValidatedPricingRow {
  print_method_id: string;
  size: string;
  max_width_cm: number | null;
  max_height_cm: number | null;
  pricing_model: FactoryPricingModel;
  unit_price: number | null;
  base_price: number | null;
  base_quantity: number | null;
  additional_price_per_piece: number | null;
  is_active: boolean;
  note: string | null;
}

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function validatePricingRow(input: unknown): ValidatedPricingRow | { error: string } {
  if (!input || typeof input !== 'object') {
    return { error: '단가 행 형식이 올바르지 않습니다.' };
  }
  const row = input as Record<string, unknown>;
  if (typeof row.print_method_id !== 'string' || !row.print_method_id) {
    return { error: '인쇄기법 ID가 필요합니다.' };
  }
  const sizeRaw = typeof row.size === 'string' ? row.size.trim() : '';
  if (!sizeRaw) {
    return { error: '사이즈 라벨이 필요합니다.' };
  }
  if (sizeRaw.length > 32) {
    return { error: '사이즈 라벨은 32자 이내여야 합니다.' };
  }
  if (!isPricingModel(row.pricing_model)) {
    return { error: 'pricing_model은 flat 또는 bulk여야 합니다.' };
  }

  const max_width_cm = toNumber(row.max_width_cm);
  const max_height_cm = toNumber(row.max_height_cm);
  if (max_width_cm !== null && max_width_cm <= 0) {
    return { error: 'max_width_cm은 0보다 커야 합니다.' };
  }
  if (max_height_cm !== null && max_height_cm <= 0) {
    return { error: 'max_height_cm은 0보다 커야 합니다.' };
  }

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
    size: sizeRaw,
    max_width_cm,
    max_height_cm,
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
 * Calculates total factory cost for a pricing row + quantity.
 * - flat: unit_price * quantity
 * - bulk: base_price for first base_quantity units; each additional unit adds additional_price_per_piece.
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

/**
 * Pick the best pricing row for an artwork of (width_cm × height_cm).
 *
 * Matching policy — ROTATION-AWARE:
 *   An artwork fits into a pricing row's bounding box if it fits in EITHER
 *   orientation. Practically: short side ≤ short side, long side ≤ long side.
 *   This matches reality (A4 paper can be used portrait or landscape) and
 *   means an A4 (21×29.7) row covers any artwork whose dimensions both fit
 *   when rotated 90° if necessary.
 *
 * Among all fitting rows, choose the one with the smallest area — the
 * tightest ceiling. Ties broken by smallest long side, then row id.
 *
 * Returns null when no row can cover the artwork.
 */
export function findMatchingPricingByDimensions<T extends Pick<
  FactoryPrintMethodPricing,
  'max_width_cm' | 'max_height_cm' | 'is_active'
>>(
  rows: T[],
  artwork_width_cm: number,
  artwork_height_cm: number
): T | null {
  if (!Number.isFinite(artwork_width_cm) || artwork_width_cm <= 0) return null;
  if (!Number.isFinite(artwork_height_cm) || artwork_height_cm <= 0) return null;

  const artShort = Math.min(artwork_width_cm, artwork_height_cm);
  const artLong = Math.max(artwork_width_cm, artwork_height_cm);

  const candidates = rows
    .filter((r) => r.is_active !== false)
    .filter((r) => r.max_width_cm !== null && r.max_height_cm !== null)
    .filter((r) => {
      const w = r.max_width_cm as number;
      const h = r.max_height_cm as number;
      const rowShort = Math.min(w, h);
      const rowLong = Math.max(w, h);
      return artShort <= rowShort && artLong <= rowLong;
    });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const areaA = (a.max_width_cm ?? 0) * (a.max_height_cm ?? 0);
    const areaB = (b.max_width_cm ?? 0) * (b.max_height_cm ?? 0);
    if (areaA !== areaB) return areaA - areaB;
    const longA = Math.max(a.max_width_cm ?? 0, a.max_height_cm ?? 0);
    const longB = Math.max(b.max_width_cm ?? 0, b.max_height_cm ?? 0);
    return longA - longB;
  });

  return candidates[0];
}

/**
 * Convenience: parse a "WxH" or "WxH cm" size label into rough dimensions.
 * Used as a fallback to seed max_width_cm/max_height_cm when admin only
 * types a label. Returns null if not parseable.
 */
export function parseSizeLabelToCm(label: string): { width: number; height: number } | null {
  const m = label.trim().match(/^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { width: w, height: h };
}
