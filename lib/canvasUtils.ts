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
 * 1. `sizeBasis === 'alpha'` and stored W/H present → trust stored (new orders).
 * 2. else → live geometric recompute (legacy fallback).
 * 3. if live is unavailable (e.g. ratio missing) → fall back to any stored value.
 */
export function resolveObjectSizeMm(
  input: ResolveSizeMmInput
): { widthMm: number; heightMm: number } {
  const { sizeBasis, storedWidthMm, storedHeightMm, liveWidthMm, liveHeightMm } = input;
  const hasStored = isPositiveFinite(storedWidthMm) && isPositiveFinite(storedHeightMm);
  const hasLive = isPositiveFinite(liveWidthMm) && isPositiveFinite(liveHeightMm);

  if (sizeBasis === ALPHA_SIZE_BASIS && hasStored) {
    return { widthMm: storedWidthMm as number, heightMm: storedHeightMm as number };
  }
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