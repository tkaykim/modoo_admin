import type { CalibrationLine, MockupCalibration } from './types';

export function lineNativePx(line: CalibrationLine): number {
  const dx = line.p2.xPx - line.p1.xPx;
  const dy = line.p2.yPx - line.p1.yPx;
  return Math.sqrt(dx * dx + dy * dy);
}

export function nativeMmPerPx(line: CalibrationLine): number {
  const px = lineNativePx(line);
  if (px <= 0 || line.measuredMm <= 0) return 0;
  return line.measuredMm / px;
}

export function activeLine(mockup: MockupCalibration): CalibrationLine | null {
  return mockup.lines.find((l) => l.active) ?? mockup.lines[0] ?? null;
}

export function activeNativeMmPerPx(mockup: MockupCalibration): number {
  const line = activeLine(mockup);
  return line ? nativeMmPerPx(line) : 0;
}

export function displayMmPerPx(
  mockup: MockupCalibration,
  scaledImageWidth: number,
): number {
  const native = activeNativeMmPerPx(mockup);
  if (!native || !scaledImageWidth || !mockup.imageNativeWidthPx) return 0;
  const displayScale = scaledImageWidth / mockup.imageNativeWidthPx;
  return native / displayScale;
}

export function pxToMm(pxValue: number, mmPerPx: number): number {
  return pxValue * mmPerPx;
}

export function mmToPx(mmValue: number, mmPerPx: number): number {
  if (!mmPerPx) return 0;
  return mmValue / mmPerPx;
}

export const A3_MAX_WIDTH_MM = 297;
export const A3_MAX_HEIGHT_MM = 420;

export function exceedsA3(widthMm: number, heightMm: number): boolean {
  const w = Math.min(widthMm, heightMm);
  const h = Math.max(widthMm, heightMm);
  return w > A3_MAX_WIDTH_MM || h > A3_MAX_HEIGHT_MM;
}

export const SIZE_THRESHOLDS_MM = {
  '10x10': { maxWidth: 100, maxHeight: 100 },
  A4: { maxWidth: 210, maxHeight: 297 },
  A3: { maxWidth: 297, maxHeight: 420 },
} as const;

export type PrintSizeBucket = '10x10' | 'A4' | 'A3';

export function determinePrintSize(widthMm: number, heightMm: number): PrintSizeBucket {
  if (
    widthMm <= SIZE_THRESHOLDS_MM['10x10'].maxWidth &&
    heightMm <= SIZE_THRESHOLDS_MM['10x10'].maxHeight
  ) {
    return '10x10';
  }
  if (
    widthMm <= SIZE_THRESHOLDS_MM.A4.maxWidth &&
    heightMm <= SIZE_THRESHOLDS_MM.A4.maxHeight
  ) {
    return 'A4';
  }
  return 'A3';
}
