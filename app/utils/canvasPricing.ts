import * as fabric from 'fabric';
import { PrintMethod, PrintSize, ProductSide } from '@/types/types';
import { countObjectColors } from '@/lib/colorExtractor';
import { getPrintPricingConfig } from '@/lib/printPricingConfig';

// Size thresholds in mm
const SIZE_THRESHOLDS = {
  '10x10': { maxWidth: 100, maxHeight: 100 },  // 10cm x 10cm
  A4: { maxWidth: 210, maxHeight: 297 },        // A4 size
  A3: { maxWidth: 297, maxHeight: 420 }         // A3 size
} as const;

/**
 * Object-level pricing information
 */
export interface ObjectPricing {
  objectId: string;
  objectType: string;
  printMethod: PrintMethod;
  printSize: PrintSize;
  colorCount: number;
  dimensionsMm: {
    width: number;
    height: number;
  };
  price: number;
  quantity?: number; // For bulk pricing methods
  recommendation?: {
    suggested: boolean;
    reason: string;
  };
}

/**
 * Side-level pricing with object breakdown
 */
export interface SidePricing {
  sideId: string;
  sideName: string;
  objects: ObjectPricing[];
  totalPrice: number;
  hasObjects: boolean;
}

/**
 * Overall pricing summary
 */
export interface PricingSummary {
  sidePricing: SidePricing[];
  totalAdditionalPrice: number;
  totalObjectCount: number;
}

/**
 * Determine print size category based on dimensions in mm
 */
function determinePrintSize(widthMm: number, heightMm: number): PrintSize {
  // Check if it fits within 10x10cm
  if (
    widthMm <= SIZE_THRESHOLDS['10x10'].maxWidth &&
    heightMm <= SIZE_THRESHOLDS['10x10'].maxHeight
  ) {
    return '10x10';
  }

  // Check if it fits within A4
  if (
    widthMm <= SIZE_THRESHOLDS.A4.maxWidth &&
    heightMm <= SIZE_THRESHOLDS.A4.maxHeight
  ) {
    return 'A4';
  }

  // A3 or larger
  return 'A3';
}

/**
 * Calculate price for transfer methods (DTF, DTG)
 * Price is based only on size, not color count
 */
function calculateTransferPrice(
  printMethod: 'dtf' | 'dtg',
  printSize: PrintSize
): number {
  try {
    const config = getPrintPricingConfig();

    if (!config) {
      console.error('Print pricing config is undefined');
      return 0;
    }

    const methodConfig = config[printMethod];

    if (!methodConfig) {
      console.error(`Method config not found for: ${printMethod}`);
      return 0;
    }

    if (!methodConfig.sizes || !methodConfig.sizes[printSize]) {
      console.error(`Size config not found for: ${printSize}`);
      return 0;
    }

    return methodConfig.sizes[printSize];
  } catch (error) {
    console.error('Error calculating transfer price:', error);
    return 0;
  }
}

/**
 * Calculate dimensions of an object in mm
 */
function calculateObjectDimensionsMm(
  obj: fabric.FabricObject,
  pixelToMmRatio: number
): { width: number; height: number } {
  const bound = obj.getBoundingRect();
  return {
    width: bound.width * pixelToMmRatio,
    height: bound.height * pixelToMmRatio
  };
}

/**
 * Calculate combined bounding box for a group of objects
 */
function calculateCombinedBoundingBox(
  objects: fabric.FabricObject[],
  pixelToMmRatio: number
): { width: number; height: number } {
  if (objects.length === 0) {
    return { width: 0, height: 0 };
  }

  // Get bounding rectangles for all objects
  const bounds = objects.map(obj => obj.getBoundingRect());

  // Find the overall bounding box
  const minLeft = Math.min(...bounds.map(b => b.left));
  const minTop = Math.min(...bounds.map(b => b.top));
  const maxRight = Math.max(...bounds.map(b => b.left + b.width));
  const maxBottom = Math.max(...bounds.map(b => b.top + b.height));

  // Calculate combined dimensions in pixels
  const widthPx = maxRight - minLeft;
  const heightPx = maxBottom - minTop;

  // Convert to mm
  return {
    width: widthPx * pixelToMmRatio,
    height: heightPx * pixelToMmRatio
  };
}

const DEFAULT_PRODUCT_WIDTH_MM = 500;
const FALLBACK_PIXEL_TO_MM_RATIO = 0.25;

type CanvasWithScale = fabric.Canvas & {
  scaledImageWidth?: number;
  /** Native (original mockup px) mm/px from product_calibrations. Set by renderers when calibration available. */
  calibrationNativeMmPerPx?: number;
  /** Original (pre-display-scale) mockup width. */
  originalImageWidth?: number;
};

const getUserObjects = (canvas: fabric.Canvas) =>
  canvas.getObjects().filter((obj) => {
    if (obj.excludeFromExport) return false;
    const objData = obj as { data?: { id?: string } };
    if (objData.data?.id === 'background-product-image') return false;
    return true;
  });

/**
 * Resolves canvas-pixel mm/px ratio.
 * Priority: calibration (per-side product_calibrations) > legacy productWidthMm / scaledImageWidth > FALLBACK.
 */
const getPixelToMmRatio = (canvas: fabric.Canvas, side: ProductSide) => {
  const c = canvas as CanvasWithScale;
  const scaledImageWidth = c.scaledImageWidth;
  const originalImageWidth = c.originalImageWidth;
  const calibrationNative = c.calibrationNativeMmPerPx;
  if (
    calibrationNative && calibrationNative > 0 &&
    originalImageWidth && originalImageWidth > 0 &&
    scaledImageWidth && scaledImageWidth > 0
  ) {
    return calibrationNative / (scaledImageWidth / originalImageWidth);
  }
  const realWorldProductWidth = side.realLifeDimensions?.productWidthMm || DEFAULT_PRODUCT_WIDTH_MM;
  if (scaledImageWidth && scaledImageWidth > 0) {
    return realWorldProductWidth / scaledImageWidth;
  }
  return FALLBACK_PIXEL_TO_MM_RATIO;
};

/**
 * Calculate pricing for a single side with per-object breakdown
 * All objects use DTF pricing based on combined bounding box size.
 */
export async function calculateSidePricing(
  canvas: fabric.Canvas,
  sideId: string,
  sideName: string,
  imageWidthPixels?: number,
  productWidthMm?: number,
): Promise<SidePricing> {
  const userObjects = getUserObjects(canvas);

  if (userObjects.length === 0) {
    return {
      sideId,
      sideName,
      objects: [],
      totalPrice: 0,
      hasObjects: false
    };
  }

  // @ts-expect-error - Custom property
  const scaledImageWidth = canvas.scaledImageWidth || imageWidthPixels || 500;
  const realWorldProductWidth = productWidthMm || 500;
  // Calibration-aware ratio. Falls back to legacy when canvas lacks calibration.
  // @ts-expect-error - Custom property
  const calibrationNativeMmPerPx = (canvas.calibrationNativeMmPerPx as number | undefined) ?? 0;
  // @ts-expect-error - Custom property
  const originalImageWidth = canvas.originalImageWidth as number | undefined;
  const calibratedRatio =
    calibrationNativeMmPerPx > 0 && originalImageWidth && originalImageWidth > 0
      ? calibrationNativeMmPerPx / (scaledImageWidth / originalImageWidth)
      : 0;
  const pixelToMmRatio = calibratedRatio > 0 ? calibratedRatio : realWorldProductWidth / scaledImageWidth;

  // All objects use DTF — calculate combined bounding box for the entire side
  const combinedDimensions = calculateCombinedBoundingBox(userObjects, pixelToMmRatio);
  const combinedPrintSize = determinePrintSize(combinedDimensions.width, combinedDimensions.height);
  const groupPrice = calculateTransferPrice('dtf', combinedPrintSize);

  const objectPricings: ObjectPricing[] = [];

  for (const obj of userObjects) {
    // @ts-expect-error - Checking custom data property
    const objectId = obj.data?.objectId || `obj-${Math.random().toString(36).substring(2, 11)}`;
    const { width, height } = calculateObjectDimensionsMm(obj, pixelToMmRatio);
    const colorCount = await countObjectColors(obj);
    const individualPrintSize = determinePrintSize(width, height);

    objectPricings.push({
      objectId,
      objectType: obj.type || 'unknown',
      printMethod: 'dtf',
      printSize: individualPrintSize,
      colorCount,
      dimensionsMm: { width, height },
      price: groupPrice / userObjects.length,
    });
  }

  const totalPrice = objectPricings.reduce((sum, p) => sum + p.price, 0);

  return {
    sideId,
    sideName,
    objects: objectPricings,
    totalPrice,
    hasObjects: true
  };
}

/**
 * Calculate total pricing for all canvas sides (DTF-only)
 */
export async function calculateAllSidesPricing(
  canvasMap: Record<string, fabric.Canvas>,
  sides: ProductSide[],
): Promise<PricingSummary> {
  const sidePricings: SidePricing[] = [];
  let totalAdditionalPrice = 0;
  let totalObjectCount = 0;

  for (const side of sides) {
    const canvas = canvasMap[side.id];
    if (canvas) {
      // @ts-expect-error - Custom property
      const imageWidth = canvas.originalImageWidth;

      const pricing = await calculateSidePricing(
        canvas,
        side.id,
        side.name,
        imageWidth,
        side.realLifeDimensions?.productWidthMm,
      );

      sidePricings.push(pricing);
      totalAdditionalPrice += pricing.totalPrice;
      totalObjectCount += pricing.objects.length;
    }
  }

  return {
    sidePricing: sidePricings,
    totalAdditionalPrice,
    totalObjectCount
  };
}

/**
 * Synchronous version for simple pricing calculation (backward compatibility)
 * This is a simplified version that doesn't do color counting
 */
export function calculateAllSidesPricingSync(
  canvasMap: Record<string, fabric.Canvas>,
  sides: ProductSide[]
): { sidePricing: Array<{ sideId: string; sideName: string; hasObjects: boolean; additionalPrice: number }>; totalAdditionalPrice: number } {
  const sidePricing = sides.map((side) => {
    const canvas = canvasMap[side.id];
    if (!canvas) {
      return {
        sideId: side.id,
        sideName: side.name,
        hasObjects: false,
        additionalPrice: 0,
      };
    }

    const objects = getUserObjects(canvas);
    if (objects.length === 0) {
      return {
        sideId: side.id,
        sideName: side.name,
        hasObjects: false,
        additionalPrice: 0,
      };
    }

    const pixelToMmRatio = getPixelToMmRatio(canvas, side);

    // Simple pricing: sum up DTF prices for all objects based on size
    let totalPrice = 0;
    for (const obj of objects) {
      const { width, height } = calculateObjectDimensionsMm(obj, pixelToMmRatio);
      const printSize = determinePrintSize(width, height);
      totalPrice += calculateTransferPrice('dtf', printSize);
    }

    return {
      sideId: side.id,
      sideName: side.name,
      hasObjects: true,
      additionalPrice: Math.round(totalPrice),
    };
  });

  const totalAdditionalPrice = sidePricing.reduce(
    (sum, side) => sum + side.additionalPrice,
    0
  );

  return {
    sidePricing,
    totalAdditionalPrice,
  };
}
