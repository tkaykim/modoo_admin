import type { CalibrationLine, MockupCalibration, TestSide } from './types';

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

/**
 * 인쇄영역 실측 기반 native mm/px (환산 1순위).
 * printAreaWidthMm / printAreaPx.width. 둘 중 하나라도 없으면 0.
 */
export function printAreaNativeMmPerPx(
  side: Pick<TestSide, 'printAreaWidthMm' | 'printAreaPx'>,
): number {
  const w = side.printAreaWidthMm ?? 0;
  const px = side.printAreaPx?.width ?? 0;
  if (w <= 0 || px <= 0) return 0;
  return w / px;
}

/**
 * 실효 native mm/px. 인쇄영역 실측(환산 1순위) → 캘리브 선분(폴백) 순.
 * 앵커 등록·사용자 시뮬레이션은 이 값을 기준으로 환산한다(캘리브 선분은 참고용).
 */
export function effectiveNativeMmPerPx(
  side: Pick<TestSide, 'printAreaWidthMm' | 'printAreaPx' | 'mockup'>,
): number {
  const printArea = printAreaNativeMmPerPx(side);
  if (printArea > 0) return printArea;
  return activeNativeMmPerPx(side.mockup);
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
