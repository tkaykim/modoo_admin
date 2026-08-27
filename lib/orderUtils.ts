import type { OrderItem } from '@/types/types';

export interface VariantInfo {
  size_name?: string;
  color_name?: string;
  color_hex?: string;
  color_code?: string;
  quantity?: number;
}

function cleanText(value?: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function includesToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^0-9a-z])${escaped}(?=$|[^0-9a-z])`, 'i').test(text);
}

export function formatOrderSizeName(sizeName?: string | null, sizeCode?: string | null): string {
  const name = cleanText(sizeName);
  const code = cleanText(sizeCode);

  if (name && code && !includesToken(name, code)) return `${name} (${code})`;
  return name || code || '사이즈 미지정';
}

export function formatOrderColor(colorName?: string | null, colorCode?: string | null): string | null {
  const name = cleanText(colorName);
  const code = cleanText(colorCode);

  if (name && code) return `${name}(${code})`;
  return name || code;
}

export function extractVariants(item: OrderItem): VariantInfo[] {
  const opts = item.item_options;
  if (opts?.variants && Array.isArray(opts.variants) && opts.variants.length > 0) {
    return opts.variants as VariantInfo[];
  }
  return [
    {
      size_name: opts?.size_name as string | undefined,
      color_name: opts?.color_name as string | undefined,
      color_hex: opts?.color_hex as string | undefined,
      color_code: opts?.color_code as string | undefined,
      quantity: item.quantity,
    },
  ];
}

/** item_options(variants 배열 또는 단일)에서 직접 variant 추출 — OrderItem 전체가 아닌 raw 데이터용 */
export function extractVariantsFromOptions(
  itemOptions: OrderItem['item_options'] | undefined | null,
  totalQuantity: number
): VariantInfo[] {
  if (itemOptions?.variants && Array.isArray(itemOptions.variants) && itemOptions.variants.length > 0) {
    return itemOptions.variants as VariantInfo[];
  }
  return [
    {
      size_name: itemOptions?.size_name as string | undefined,
      color_name: itemOptions?.color_name as string | undefined,
      color_hex: itemOptions?.color_hex as string | undefined,
      color_code: itemOptions?.color_code as string | undefined,
      quantity: totalQuantity,
    },
  ];
}

export function getOrderItemColorLabel(
  item: Pick<OrderItem, 'quantity' | 'item_options'>
): string | null {
  const variants = extractVariantsFromOptions(item.item_options, item.quantity);
  const variantWithColor = variants.find((variant) =>
    cleanText(variant.color_name) || cleanText(variant.color_code)
  );

  return formatOrderColor(
    variantWithColor?.color_name ?? item.item_options?.color_name,
    variantWithColor?.color_code ?? item.item_options?.color_code,
  );
}

/** 사이즈별 수량을 "S x2, M x3" 형태의 요약 문자열로 반환 */
export function formatVariantsSummary(variants: VariantInfo[]): string {
  if (variants.length <= 1) {
    const v = variants[0];
    const label = v?.size_name || v?.color_name;
    const qty = v?.quantity || 0;
    return label ? `${label} x${qty}` : `${qty}`;
  }
  return variants
    .filter((v) => (v.quantity ?? 0) > 0)
    .map((v) => {
      const label = v.size_name || v.color_name || '';
      return label ? `${label} x${v.quantity}` : `x${v.quantity}`;
    })
    .join(', ');
}
