/**
 * Alpha-tight bounding for user-uploaded artwork.
 *
 * Why: PNGs commonly contain large transparent margins. Measuring the file's
 * raster width/height misrepresents the printed result. We trim to the
 * non-transparent bounding box on upload so downstream code (Fabric scaled
 * width/height → mm) automatically reports visible bounds.
 *
 * Safety:
 * - Source dataURL only (no cross-origin canvas tainting).
 * - Returns original on failure or fully-opaque/empty images.
 * - Handles huge images by downscaling for the scan, then mapping bounds
 *   back to original coordinates before cropping.
 */

export interface AlphaTrimOptions {
  /** Pixels with alpha <= this threshold are treated as transparent. Default 8. */
  alphaThreshold?: number;
  /** Extra px padding kept around the trimmed box (in original coords). Default 0. */
  padding?: number;
  /** Largest image side scanned. Bigger images are downscaled for the scan only. Default 4096. */
  maxScanSide?: number;
}

export interface AlphaTrimResult {
  /** Cropped data URL (or original when no trim happened). */
  dataUrl: string;
  /** Final image width (after trim). */
  width: number;
  /** Final image height (after trim). */
  height: number;
  /** True when the result is a strict subset of the original. */
  trimmed: boolean;
  /** Original raster size before trim. */
  originalWidth: number;
  /** Original raster size before trim. */
  originalHeight: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('[CALIB-TEST] image load failed'));
    img.src = src;
  });
}

export async function trimToAlphaBounds(
  dataUrl: string,
  options: AlphaTrimOptions = {},
): Promise<AlphaTrimResult> {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const padding = options.padding ?? 0;
  const maxScanSide = options.maxScanSide ?? 4096;

  const img = await loadImage(dataUrl);
  const ow = img.naturalWidth;
  const oh = img.naturalHeight;

  if (ow <= 0 || oh <= 0) {
    return { dataUrl, width: ow, height: oh, trimmed: false, originalWidth: ow, originalHeight: oh };
  }

  // Downscale for scan if huge.
  const scanScale = Math.min(1, maxScanSide / Math.max(ow, oh));
  const sw = Math.max(1, Math.round(ow * scanScale));
  const sh = Math.max(1, Math.round(oh * scanScale));

  let scanCanvas: HTMLCanvasElement;
  let scanCtx: CanvasRenderingContext2D;
  try {
    scanCanvas = document.createElement('canvas');
    scanCanvas.width = sw;
    scanCanvas.height = sh;
    const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d ctx');
    scanCtx = ctx;
    scanCtx.clearRect(0, 0, sw, sh);
    scanCtx.drawImage(img, 0, 0, sw, sh);
  } catch (e) {
    console.warn('[CALIB-TEST] alpha trim scan failed, returning original', e);
    return { dataUrl, width: ow, height: oh, trimmed: false, originalWidth: ow, originalHeight: oh };
  }

  let imageData: ImageData;
  try {
    imageData = scanCtx.getImageData(0, 0, sw, sh);
  } catch (e) {
    console.warn('[CALIB-TEST] getImageData failed (taint?), returning original', e);
    return { dataUrl, width: ow, height: oh, trimmed: false, originalWidth: ow, originalHeight: oh };
  }

  const data = imageData.data;
  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const a = data[(y * sw + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Empty / fully transparent.
  if (maxX < 0 || maxY < 0) {
    return { dataUrl, width: ow, height: oh, trimmed: false, originalWidth: ow, originalHeight: oh };
  }

  // Map scan-space bounds back to original.
  const invScale = 1 / scanScale;
  let cropL = Math.floor(minX * invScale) - padding;
  let cropT = Math.floor(minY * invScale) - padding;
  let cropR = Math.ceil((maxX + 1) * invScale) + padding;
  let cropB = Math.ceil((maxY + 1) * invScale) + padding;
  cropL = Math.max(0, cropL);
  cropT = Math.max(0, cropT);
  cropR = Math.min(ow, cropR);
  cropB = Math.min(oh, cropB);

  const cropW = cropR - cropL;
  const cropH = cropB - cropT;

  // Already tight (or near-tight) — return original.
  if (cropW >= ow && cropH >= oh) {
    return { dataUrl, width: ow, height: oh, trimmed: false, originalWidth: ow, originalHeight: oh };
  }
  if (cropW <= 0 || cropH <= 0) {
    return { dataUrl, width: ow, height: oh, trimmed: false, originalWidth: ow, originalHeight: oh };
  }

  // Crop on a fresh full-resolution canvas.
  let outDataUrl = dataUrl;
  try {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = cropW;
    outCanvas.height = cropH;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) throw new Error('no out ctx');
    outCtx.clearRect(0, 0, cropW, cropH);
    outCtx.drawImage(img, cropL, cropT, cropW, cropH, 0, 0, cropW, cropH);
    outDataUrl = outCanvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[CALIB-TEST] alpha trim crop failed, returning original', e);
    return { dataUrl, width: ow, height: oh, trimmed: false, originalWidth: ow, originalHeight: oh };
  }

  return {
    dataUrl: outDataUrl,
    width: cropW,
    height: cropH,
    trimmed: true,
    originalWidth: ow,
    originalHeight: oh,
  };
}
