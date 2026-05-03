/**
 * Canvas utility functions for real-world scale conversions
 */

import * as fabric from 'fabric';

/**
 * Serialize canvas state to JSON string, excluding background images and guides
 * @param canvas - The fabric canvas to serialize
 * @param layerColors - Layer colors for the side
 * @returns JSON string of the canvas state
 */
export function serializeCanvasState(
  canvas: fabric.Canvas,
  layerColors: Record<string, string> = {}
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
  const canvasData = {
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