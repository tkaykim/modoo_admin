/**
 * Snap a Fabric.js artwork object to an anchor preset.
 *
 * Anchor coordinates are in mm relative to the mockup origin. The fabric
 * canvas has a calibrated mm-per-px ratio (canvasMmPerPx). We compute the
 * target canvas-px center + size that fits the artwork inside the recommended
 * box while preserving the aspect ratio derived from the artwork's raster.
 */
import type * as fabric from 'fabric';
import type { AnchorPreset } from './anchorPresets';

export interface AnchorSnapInputs {
  obj: fabric.FabricObject;
  anchor: AnchorPreset;
  /** Canvas-pixel mm/px ratio at the time of snap. */
  canvasMmPerPx: number;
  /** Canvas-pixel left/top of the mockup background (usually 0). */
  mockupCanvasLeft?: number;
  mockupCanvasTop?: number;
}

export function snapArtworkToAnchor({
  obj,
  anchor,
  canvasMmPerPx,
  mockupCanvasLeft = 0,
  mockupCanvasTop = 0,
}: AnchorSnapInputs): boolean {
  if (!obj || !anchor) return false;
  if (!Number.isFinite(canvasMmPerPx) || canvasMmPerPx <= 0) return false;

  // Aspect derived from raster (already alpha-trimmed for new uploads).
  const rawW = obj.width || 0;
  const rawH = obj.height || 0;
  if (rawW <= 0 || rawH <= 0) return false;
  const aspect = rawW / rawH;

  // Fit inside recommended bbox preserving aspect.
  let widthMm = anchor.recommendedWidthMm;
  let heightMm = widthMm / aspect;
  if (heightMm > anchor.recommendedHeightMm) {
    heightMm = anchor.recommendedHeightMm;
    widthMm = heightMm * aspect;
  }
  if (widthMm <= 0 || heightMm <= 0) return false;

  // mm → canvas px.
  const widthPx = widthMm / canvasMmPerPx;
  const heightPx = heightMm / canvasMmPerPx;
  const centerX = anchor.xMm / canvasMmPerPx + mockupCanvasLeft;
  const centerY = anchor.yMm / canvasMmPerPx + mockupCanvasTop;

  const scaleX = widthPx / rawW;
  const scaleY = heightPx / rawH;

  obj.set({
    originX: 'center',
    originY: 'center',
    left: centerX,
    top: centerY,
    scaleX,
    scaleY,
    angle: 0,
    // Subsequent user resize handles work from center (not corner) so
    // the artwork stays anchored at the snap target as the user adjusts size.
    centeredScaling: true,
    centeredRotation: true,
  });
  obj.setCoords();
  return true;
}
