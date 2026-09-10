import type { Product, SavedDesign, PartnerMallProduct, CustomFont, LogoPlacement } from '@/types/types';
import { extractCustomFontsFromCanvasState } from '@/lib/font-contract';

export interface MallProductDraft {
  key: string;
  product: Product;
  display_name: string;
  canvas_state: Record<string, string>;
  logo_placements: Record<string, LogoPlacement>;
  preview_url: string | null;
  manufacturer_color_id: string | null;
  color_hex: string | null;
  color_name: string | null;
  color_code: string | null;
  price: number | null;
  custom_fonts: CustomFont[];
  ready: boolean;
}

// Keep every side, including sides no longer offered by the current product.
// Malformed input must fail visibly instead of silently becoming a blank design.
export function normalizeMallCanvas(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('디자인 데이터 형식이 올바르지 않습니다.');
  return Object.fromEntries(Object.entries(raw).map(([side, value]) => {
    const state = typeof value === 'string' ? JSON.parse(value) : value;
    if (!state || typeof state !== 'object' || !Array.isArray(state.objects)) throw new Error(`${side} 면의 디자인을 읽을 수 없습니다.`);
    return [side, JSON.stringify(state)];
  }));
}

export function extractMallFonts(canvas: Record<string, string>): CustomFont[] {
  const flattened: unknown[] = [];
  const visit = (objects: Record<string, unknown>[]) => {
    for (const obj of objects) {
      flattened.push(obj);
      if (Array.isArray(obj.objects)) visit(obj.objects as Record<string, unknown>[]);
    }
  };
  for (const state of Object.values(canvas)) visit(JSON.parse(state).objects);
  return extractCustomFontsFromCanvasState({ all: { objects: flattened } });
}

export function createMallDraft(product: Product, source?: SavedDesign | PartnerMallProduct): MallProductDraft {
  const canvas = normalizeMallCanvas(source?.canvas_state || {});
  const saved = source && 'color_selections' in source ? source as SavedDesign : undefined;
  const mall = source && 'partner_mall_id' in source ? source as PartnerMallProduct : undefined;
  const colors = saved?.color_selections as unknown as { productColor?: string; colorName?: string; manufacturerColorId?: string; colorCode?: string } | undefined;
  const states = Object.values(canvas).map(s => JSON.parse(s));
  return {
    key: crypto.randomUUID(), product,
    display_name: mall?.display_name || saved?.title || product.title,
    canvas_state: canvas, logo_placements: structuredClone(mall?.logo_placements || {}), preview_url: source?.preview_url || null,
    manufacturer_color_id: mall?.manufacturer_color_id || colors?.manufacturerColorId || null,
    color_hex: mall?.color_hex || colors?.productColor || states.find(s => s.productColor)?.productColor || null,
    color_name: mall?.color_name || colors?.colorName || null,
    color_code: mall?.color_code || colors?.colorCode || null,
    // Historical order/design prices are not current mall selling prices.
    price: mall?.price ?? null,
    custom_fonts: saved?.custom_fonts || [], ready: false,
  };
}

export function mallDraftPayload(draft: MallProductDraft) {
  if (!draft.display_name.trim()) throw new Error('상품명을 입력해주세요.');
  if (draft.price !== null && (!Number.isFinite(draft.price) || !Number.isInteger(draft.price) || draft.price < 0)) throw new Error('판매가는 0 이상의 정수로 입력해주세요.');
  return {
    product_id: draft.product.id, display_name: draft.display_name.trim(),
    canvas_state: normalizeMallCanvas(draft.canvas_state), logo_placements: draft.logo_placements,
    preview_url: draft.preview_url, manufacturer_color_id: draft.manufacturer_color_id,
    color_hex: draft.color_hex, color_name: draft.color_name, color_code: draft.color_code,
    price: draft.price,
  };
}
