import type { MockupCalibration } from './types';
import { activeNativeMmPerPx } from './calibrationMath';

/**
 * Legacy method: nativeMmPerPx = productWidthMm / nativeImageWidth.
 * (Operational system uses productWidthMm / scaledImageWidth, but mathematically
 * equivalent when artwork pixel coords are given in native space — the displayScale
 * factors cancel out.)
 */
export function legacyMmPerPx(mockup: MockupCalibration): number {
  const productWidthMm = mockup.legacyProductWidthMm;
  if (!productWidthMm || productWidthMm <= 0) return 0;
  if (!mockup.imageNativeWidthPx) return 0;
  return productWidthMm / mockup.imageNativeWidthPx;
}

/**
 * Convert artwork dimensions from new method (mm) to legacy method (mm) by
 * back-deriving pixel dimensions from the new mmPerPx and re-applying legacy mmPerPx.
 */
export function legacyMmFromNewMm(
  mockup: MockupCalibration,
  widthMmNew: number,
  heightMmNew: number,
): { widthMm: number; heightMm: number } | null {
  const newRatio = activeNativeMmPerPx(mockup);
  const legacyRatio = legacyMmPerPx(mockup);
  if (!newRatio || !legacyRatio) return null;
  const widthPx = widthMmNew / newRatio;
  const heightPx = heightMmNew / newRatio;
  return {
    widthMm: widthPx * legacyRatio,
    heightMm: heightPx * legacyRatio,
  };
}
