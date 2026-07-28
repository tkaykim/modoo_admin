/**
 * Canvas utility functions for real-world scale conversions
 */

import * as fabric from 'fabric';

/**
 * Serialize canvas state to JSON string, excluding background images and guides
 * @param canvas - The fabric canvas to serialize
 * @param layerColors - Layer colors for the side
 * @param productColor - Product (single-image) color for the side
 * @returns JSON string of the canvas state
 */
export function serializeCanvasState(
  canvas: fabric.Canvas,
  layerColors: Record<string, string> = {},
  productColor?: string
): string {
  // Save user-added objects (exclude background product image, guides, and snap lines)
  const userObjects = canvas.getObjects().filter(obj => {
    // Exclude guide boxes and snap lines
    if (obj.excludeFromExport) return false;

    // Exclude the background product image by checking its ID
    // @ts-expect-error - Checking custom data property
    if (obj.data?.id === 'background-product-image') return false;

    return true;
  });

  // 저장 안전망: 아직 mm가 박제되지 않은 객체는 캘리브레이션 비율이 있을 때
  // 직렬화 직전에 박제한다 (admin 에디터에서 만든 주문이 mm 없이 저장되어
  // 시안 패널이 잘못된 환산 폴백으로 떨어지는 사고 방지 — 2026-06-12 085-CVT).
  {
    // @ts-expect-error - Custom property set by SingleSideCanvas calibration effect
    const native = (canvas.calibrationNativeMmPerPx as number | undefined) ?? 0;
    // @ts-expect-error - Custom property
    const sw = canvas.scaledImageWidth as number | undefined;
    // @ts-expect-error - Custom property
    const ow = canvas.originalImageWidth as number | undefined;
    const ratio = native > 0 && sw && ow ? native / (sw / ow) : 0;
    if (ratio > 0) {
      userObjects.forEach((obj) => {
        // @ts-expect-error - Checking custom data property
        if (typeof obj.data?.widthMm === 'number' && obj.data?.sizeBasis === ALPHA_SIZE_BASIS) return;
        updateObjectDimensionsData(obj, ratio);
      });
    }
  }

  // Create a minimal JSON with only user objects and layer colors
  const canvasData: Record<string, unknown> = {
    version: canvas.toJSON().version,
    objects: userObjects.map(obj => {
      // Use toObject to include custom properties
      const json = obj.toObject(['data']);
      // For image objects, ensure we preserve the src
      if (obj.type === 'image') {
        const imgObj = obj as fabric.FabricImage;
        json.src = imgObj.getSrc();
      }
      return json;
    }),
    // Save layer colors for this side
    layerColors: layerColors,
  };

  // Single-image 제품의 productColor 도 함께 보존 — canvas_state 자체가 자기완결적이도록.
  if (typeof productColor === 'string' && productColor.startsWith('#')) {
    canvasData.productColor = productColor;
  }

  return JSON.stringify(canvasData);
}

/**
 * Converts canvas pixels to real-world millimeters
 *
 * @param pixelValue - The value in canvas pixels
 * @param canvasPrintAreaWidth - The width of the print area in canvas pixels
 * @param realWorldWidth - The real-world width in millimeters from product data (e.g., 250mm for t-shirt print area)
 * @returns The value in millimeters
 */
export function pixelsToMm(
  pixelValue: number,
  canvasPrintAreaWidth: number,
  realWorldWidth: number
): number {
  const mmPerPixel = realWorldWidth / canvasPrintAreaWidth;
  return pixelValue * mmPerPixel;
}

/**
 * Canonical px↔mm ratio for canvas dimension calculations.
 * Mirrors `modoo_app/lib/canvasUtils.calculatePixelToMmRatio` — the customer
 * editor's formula, treated as the source of truth.
 *
 * Reference frame: scaled canvas px (not original-image px). Apply the returned
 * ratio to `obj.getBoundingRect().width` directly.
 *
 * - If `mmPerPxOverride` (already in scaled-canvas-px units) is provided, it
 *   wins. Compute it from `nativeMmPerPx / displayScale` via
 *   `calibrationToCanvasMmPerPx` from `lib/calibrationFetch`.
 * - Otherwise: `productWidthMm / scaledImageWidth` — assumes the product
 *   visually spans the mockup's image width.
 */
export function calculatePixelToMmRatio(
  scaledImageWidth: number,
  realWorldProductWidth: number = 500,
  mmPerPxOverride?: number | null
): number {
  if (mmPerPxOverride && Number.isFinite(mmPerPxOverride) && mmPerPxOverride > 0) {
    return mmPerPxOverride;
  }
  if (!scaledImageWidth || !Number.isFinite(scaledImageWidth) || scaledImageWidth <= 0) {
    return 0;
  }
  return realWorldProductWidth / scaledImageWidth;
}

/**
 * Converts real-world millimeters to canvas pixels
 *
 * @param mmValue - The value in millimeters
 * @param canvasPrintAreaWidth - The width of the print area in canvas pixels
 * @param realWorldWidth - The real-world width in millimeters from product data (e.g., 250mm for t-shirt print area)
 * @returns The value in canvas pixels
 */
export function mmToPixels(
  mmValue: number,
  canvasPrintAreaWidth: number,
  realWorldWidth: number
): number {
  const pixelsPerMm = canvasPrintAreaWidth / realWorldWidth;
  return mmValue * pixelsPerMm;
}

/**
 * Formats millimeter value for display
 *
 * @param mm - The value in millimeters
 * @param precision - Number of decimal places (default: 1)
 * @returns Formatted string with mm unit
 */
export function formatMm(mm: number, precision: number = 1): string {
  return `${mm.toFixed(precision)}mm`;
}

/**
 * Marker the customer editor (modoo_app) writes onto each user object's `data`
 * when its size was measured against the alpha-tight bounding box (the
 * canonical "투명 영역 제외" 측정 기준 shared across apps).
 *
 * Admin views trust the stored `widthMm`/`heightMm` ONLY when this marker is
 * present. Legacy objects (created before unification) have no marker and fall
 * back to a live geometric recompute, per the agreed "신규만 정합, 레거시는
 * 라이브 fallback" policy.
 *
 * Keep this string identical to the literal written in
 * `modoo_app/lib/canvasUtils.updateObjectDimensionsData`.
 */
export const ALPHA_SIZE_BASIS = 'alpha';

/** Round to 1 decimal place (mm 저장 정밀도 — 고객앱 formatMmNumber와 동일). */
export function formatMmNumber(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Stamp an object's real size (mm) onto `obj.data` with the alpha-basis marker —
 * the admin-editor counterpart of `modoo_app/lib/canvasUtils.updateObjectDimensionsData`.
 *
 * `pixelToMmRatio` must be in scaled-canvas-px units (mm per canvas px).
 * A non-positive ratio means we have no trustworthy conversion (calibration not
 * loaded and no legacy productWidthMm) — in that case we deliberately do NOT
 * stamp, because persisting a wrong mm is worse than persisting none
 * (downstream views show "측정 불가" instead of a silently wrong number).
 */
export function updateObjectDimensionsData(
  obj: fabric.FabricObject,
  pixelToMmRatio: number
): void {
  // 다중 선택(ActiveSelection) 변형 시 자식 각각에 박제한다.
  // 선택 묶음 자체는 직렬화되지 않으며, 자식 getBoundingRect()는 그룹 변환이
  // 합성된 캔버스 좌표를 반환하므로 그대로 정확하다.
  if (obj instanceof fabric.ActiveSelection) {
    obj.getObjects().forEach((child) => updateObjectDimensionsData(child, pixelToMmRatio));
    return;
  }
  if (!Number.isFinite(pixelToMmRatio) || pixelToMmRatio <= 0) return;
  const boundingRect = obj.getBoundingRect();
  const widthMm = formatMmNumber(boundingRect.width * pixelToMmRatio);
  const heightMm = formatMmNumber(boundingRect.height * pixelToMmRatio);
  if (!(widthMm > 0) || !(heightMm > 0)) return;

  // @ts-expect-error - Custom data property
  if (!obj.data) {
    // @ts-expect-error - Adding data property
    obj.data = {};
  }
  // @ts-expect-error - Adding custom properties to data
  obj.data.widthMm = widthMm;
  // @ts-expect-error - Adding custom properties to data
  obj.data.heightMm = heightMm;
  // @ts-expect-error - Adding custom properties to data
  obj.data.sizeBasis = ALPHA_SIZE_BASIS;
}

export interface ResolveSizeMmInput {
  /** Size-basis marker read from the object/data (e.g. `obj.data.sizeBasis`). */
  sizeBasis?: string | null;
  /** Stored (alpha-based) widthMm from canvas_state or the live object. */
  storedWidthMm?: number | null;
  /** Stored (alpha-based) heightMm from canvas_state or the live object. */
  storedHeightMm?: number | null;
  /** Live geometric fallback width in mm (already converted from px). */
  liveWidthMm?: number | null;
  /** Live geometric fallback height in mm (already converted from px). */
  liveHeightMm?: number | null;
}

const isPositiveFinite = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Resolve an object's display size in mm on the customer's alpha-box standard.
 *
 * Priority:
 * 1. Live geometric size when the canvas and conversion ratio are available.
 * 2. Stored W/H only when live measurement is unavailable.
 *
 * Stored dimensions are a persistence fallback, not display authority.
 * A product calibration or canvas scale can legitimately change after an order
 * was saved, so preferring stored values would make the side panel disagree
 * with the selected object's on-canvas size tooltip.
 */
export function resolveObjectSizeMm(
  input: ResolveSizeMmInput
): { widthMm: number; heightMm: number } {
  const { storedWidthMm, storedHeightMm, liveWidthMm, liveHeightMm } = input;
  const hasStored = isPositiveFinite(storedWidthMm) && isPositiveFinite(storedHeightMm);
  const hasLive = isPositiveFinite(liveWidthMm) && isPositiveFinite(liveHeightMm);

  if (hasLive) {
    return { widthMm: liveWidthMm as number, heightMm: liveHeightMm as number };
  }
  if (hasStored) {
    return { widthMm: storedWidthMm as number, heightMm: storedHeightMm as number };
  }
  return { widthMm: 0, heightMm: 0 };
}

/** Format a width×height (mm) pair as "W × H cm" for display. */
export function formatSizeCm(widthMm: number, heightMm: number, precision: number = 1): string {
  return `${(widthMm / 10).toFixed(precision)} × ${(heightMm / 10).toFixed(precision)}cm`;
}
