/**
 * Fetches per-side calibration data from `product_calibrations`.
 *
 * The table stores native mmPerPx (mm per *original* mockup pixel), keyed by
 * (product_id, side_id). Canvases operate in scaled px, so the consumer must
 * apply `displayScale = scaledImageWidth / originalImageWidth` to translate.
 *
 * Read-only. Non-admin users can SELECT by RLS policy "Anyone can view product
 * calibrations". Caches per productId for the page session.
 */
import { createClient } from '@/lib/supabase-client';
import type { AnchorPreset } from './anchorPresets';

export interface SideCalibrationLine {
  id: string;
  label?: string;
  measuredMm: number;
  p1: { xPx: number; yPx: number };
  p2: { xPx: number; yPx: number };
  active?: boolean;
}

export interface SideCalibrationPayload {
  mockup?: {
    legacyProductWidthMm?: number;
    lines?: SideCalibrationLine[];
  };
  applicableAnchors?: string[];
  registeredAnchors?: Array<{
    id: string;
    xMm: number;
    yMm: number;
    recommendedWidthMm: number;
    recommendedHeightMm: number;
  }>;
  scenarios?: unknown;
}

export interface SideCalibration {
  productId: string;
  sideId: string;
  /** Native (original mockup px) mm-per-px derived from the active calibration line. 0 if no usable line. */
  nativeMmPerPx: number;
  /** Label of the line used (for tooltips / audit). */
  activeLineLabel?: string;
  /** Registered anchor presets with snapshot labels (label may be missing on older rows). */
  anchors: AnchorPreset[];
  payload: SideCalibrationPayload;
  updatedAt: string;
}

const cache = new Map<string, Promise<Map<string, SideCalibration>>>();

function lineNativeMmPerPx(line: SideCalibrationLine): number {
  const dx = line.p2.xPx - line.p1.xPx;
  const dy = line.p2.yPx - line.p1.yPx;
  const px = Math.sqrt(dx * dx + dy * dy);
  if (px <= 0 || line.measuredMm <= 0) return 0;
  return line.measuredMm / px;
}

function pickActiveLine(payload: SideCalibrationPayload): SideCalibrationLine | null {
  const lines = payload.mockup?.lines ?? [];
  return lines.find((l) => l.active) ?? lines[0] ?? null;
}

/**
 * Returns Map<sideId, SideCalibration> for a product. Empty map when no
 * rows exist or the fetch fails. Never throws — fallback safe.
 */
export async function fetchProductCalibrations(
  productId: string,
): Promise<Map<string, SideCalibration>> {
  if (!productId) return new Map();
  const cached = cache.get(productId);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('product_calibrations')
        .select('product_id, side_id, payload, updated_at')
        .eq('product_id', productId);
      if (error) {
        console.warn('[CALIB] fetch failed, falling back to legacy', error);
        return new Map<string, SideCalibration>();
      }
      const map = new Map<string, SideCalibration>();
      for (const row of data ?? []) {
        const payload = (row.payload ?? {}) as SideCalibrationPayload;
        const activeLine = pickActiveLine(payload);
        const nativeMmPerPx = activeLine ? lineNativeMmPerPx(activeLine) : 0;
        if (!Number.isFinite(nativeMmPerPx) || nativeMmPerPx <= 0) continue;
        const anchors: AnchorPreset[] = (payload.registeredAnchors ?? [])
          .filter((a) => a && typeof a === 'object' && a.id)
          .map((a) => ({
            id: a.id,
            xMm: Number(a.xMm) || 0,
            yMm: Number(a.yMm) || 0,
            recommendedWidthMm: Number(a.recommendedWidthMm) || 0,
            recommendedHeightMm: Number(a.recommendedHeightMm) || 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label: typeof (a as any).label === 'string' ? (a as any).label : undefined,
          }));
        map.set(row.side_id, {
          productId: row.product_id,
          sideId: row.side_id,
          nativeMmPerPx,
          activeLineLabel: activeLine?.label,
          anchors,
          payload,
          updatedAt: row.updated_at,
        });
      }
      return map;
    } catch (e) {
      console.warn('[CALIB] fetch threw, falling back to legacy', e);
      return new Map<string, SideCalibration>();
    }
  })();

  cache.set(productId, promise);
  return promise;
}

/** Clear cache (e.g., after admin re-calibrates a product). */
export function invalidateCalibrationCache(productId?: string): void {
  if (productId) cache.delete(productId);
  else cache.clear();
}

/**
 * Compute the canvas-pixel mm/px ratio when calibration is available.
 * Returns null if any input is missing/invalid → caller falls back to legacy.
 */
export function calibrationToCanvasMmPerPx(params: {
  nativeMmPerPx: number;
  scaledImageWidth: number;
  originalImageWidth: number;
}): number | null {
  const { nativeMmPerPx, scaledImageWidth, originalImageWidth } = params;
  if (!nativeMmPerPx || !scaledImageWidth || !originalImageWidth) return null;
  if (!Number.isFinite(nativeMmPerPx) || nativeMmPerPx <= 0) return null;
  if (!Number.isFinite(scaledImageWidth) || scaledImageWidth <= 0) return null;
  if (!Number.isFinite(originalImageWidth) || originalImageWidth <= 0) return null;
  const displayScale = scaledImageWidth / originalImageWidth;
  if (!Number.isFinite(displayScale) || displayScale <= 0) return null;
  return nativeMmPerPx / displayScale;
}
