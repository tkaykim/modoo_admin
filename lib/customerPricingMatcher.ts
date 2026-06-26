/**
 * Customer pricing matcher — modoo_app과 1:1 동일 (parity copy).
 *
 * 고객 앱(modoo_app)과 관리자(modoo_admin)가 같은 도안에 절대 다른 사이즈
 * 카테고리·단가를 부여하면 안 되므로, 매칭 알고리즘을 양쪽이 공유한다.
 * (원형은 modoo_admin/lib/factoryPricing.ts. modoo_app으로 포팅됐다가
 *  여기로 역수입 — 추후 공통 lib 추출 고려.)
 *
 * 가격표 자체는 별개:
 *   - 고객가  → customer_print_method_pricing
 *   - 공장가  → factory_print_method_pricing
 * 이 파일은 어느 가격표든 받아 매칭만 수행한다 (순수 함수).
 */

export type CustomerPricingModel = 'flat' | 'bulk';

export interface CustomerPricingRow {
  id: string;
  print_method_id: string;
  size: string;
  max_width_cm: number | null;
  max_height_cm: number | null;
  pricing_model: CustomerPricingModel;
  unit_price: number | null;
  base_price: number | null;
  base_quantity: number | null;
  additional_price_per_piece: number | null;
  is_active: boolean;
}

/**
 * 도안 (width_cm × height_cm) 에 가장 알맞은 단가 행을 고른다.
 *
 * 매칭 정책 (modoo_app·modoo_admin 동일):
 *  - ROTATION-AWARE: 짧은변 ≤ 짧은변, 긴변 ≤ 긴변. A4(21×29.7)는 회전 시
 *    들어가는 모든 도안을 커버. 띠 모양(25×5)도 A4 매칭 성공.
 *  - 가장 작은 면적 우선 — 빠듯한 ceiling. 동률 시 짧은 긴변 우선.
 *  - 매칭 없으면 null. 호출자가 fallback 책임.
 *
 * 비활성 행과 dimension 미지정 행은 자동 제외.
 */
export function matchCustomerPricingByDimensions<T extends Pick<
  CustomerPricingRow,
  'max_width_cm' | 'max_height_cm' | 'is_active'
>>(
  rows: T[],
  artworkWidthCm: number,
  artworkHeightCm: number,
): T | null {
  if (!Number.isFinite(artworkWidthCm) || artworkWidthCm <= 0) return null;
  if (!Number.isFinite(artworkHeightCm) || artworkHeightCm <= 0) return null;

  const artShort = Math.min(artworkWidthCm, artworkHeightCm);
  const artLong = Math.max(artworkWidthCm, artworkHeightCm);

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
 * 매칭된 행의 단가를 수량에 곱해 총액을 낸다.
 * - flat: unit_price × quantity
 * - bulk: base_price + max(0, quantity - base_quantity) × additional_price_per_piece
 */
export function calculatePricingAmount(
  row: Pick<
    CustomerPricingRow,
    'pricing_model' | 'unit_price' | 'base_price' | 'base_quantity' | 'additional_price_per_piece'
  >,
  quantity: number,
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
    ) {
      return null;
    }
    const extra = Math.max(0, quantity - row.base_quantity);
    return Math.round(row.base_price + extra * row.additional_price_per_piece);
  }

  return null;
}

/**
 * 한 도안의 단가(1벌 기준)를 산정한다. 가격 계산은 항상 quantity=1 기준 단가.
 *
 * Fallback 정책 (대표님 결정):
 *   1. 회전 매칭 성공 → matched row의 unit_price 반환
 *   2. 매칭 실패 (A3 초과 등) → A3 행 강제 적용
 *   3. A3 행도 없음 → null. 호출자가 하드코드 최종 안전망 적용
 *
 * 절대 0이나 에러 throw 하지 않는다. 주문 자체는 무조건 진행 가능해야 함.
 */
export function pickUnitPriceForArtwork(
  rows: CustomerPricingRow[],
  artworkWidthCm: number,
  artworkHeightCm: number,
): { unitPrice: number; matchedRowId: string; matchType: 'exact' | 'a3_fallback' } | null {
  // 1) 회전 매칭
  const matched = matchCustomerPricingByDimensions(rows, artworkWidthCm, artworkHeightCm);
  if (matched && matched.pricing_model === 'flat' && matched.unit_price !== null) {
    return {
      unitPrice: Math.round(matched.unit_price),
      matchedRowId: matched.id,
      matchType: 'exact',
    };
  }

  // 2) A3 fallback — size 라벨이 정확히 'A3'인 행을 우선,
  //    없으면 max_width_cm/max_height_cm 둘 다 입력된 행 중 가장 큰 면적 행
  const a3ByLabel = rows.find(
    (r) => r.is_active !== false && r.size === 'A3' && r.pricing_model === 'flat' && r.unit_price !== null,
  );
  if (a3ByLabel && a3ByLabel.unit_price !== null) {
    return {
      unitPrice: Math.round(a3ByLabel.unit_price),
      matchedRowId: a3ByLabel.id,
      matchType: 'a3_fallback',
    };
  }

  const biggestFlat = rows
    .filter((r) => r.is_active !== false && r.pricing_model === 'flat' && r.unit_price !== null)
    .filter((r) => r.max_width_cm !== null && r.max_height_cm !== null)
    .sort((a, b) => (b.max_width_cm! * b.max_height_cm!) - (a.max_width_cm! * a.max_height_cm!))[0];

  if (biggestFlat && biggestFlat.unit_price !== null) {
    return {
      unitPrice: Math.round(biggestFlat.unit_price),
      matchedRowId: biggestFlat.id,
      matchType: 'a3_fallback',
    };
  }

  return null;
}
