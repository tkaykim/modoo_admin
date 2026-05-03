import * as fabric from 'fabric';

/**
 * Generates a thumbnail image from a fabric.js canvas
 * @param canvas - The fabric.js canvas instance
 * @param maxWidth - Maximum width of the thumbnail (default: 200)
 * @param maxHeight - Maximum height of the thumbnail (default: 200)
 * @returns Base64 encoded image data URL
 */
export function generateCanvasThumbnail(
  canvas: fabric.Canvas,
  maxWidth: number = 200,
  maxHeight: number = 200
): string {
  if (!canvas) {
    console.error('Canvas is null or undefined');
    return '';
  }

  try {
    // Calculate scaling factor to fit within max dimensions while maintaining aspect ratio
    const canvasWidth = canvas.getWidth();
    const canvasHeight = canvas.getHeight();
    const scale = Math.min(maxWidth / canvasWidth, maxHeight / canvasHeight);

    // Generate the data URL with scaling
    const dataURL = canvas.toDataURL({
      format: 'png',
      quality: 0.8,
      multiplier: scale, // Scale down for thumbnail
    });

    return dataURL;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return '';
  }
}

/**
 * Generates a composite thumbnail showing the primary side of the product
 * @param canvasMap - Record of all canvas instances by side ID
 * @param primarySideId - ID of the primary side to use for thumbnail (default: 'front')
 * @param maxWidth - Maximum width of the thumbnail
 * @param maxHeight - Maximum height of the thumbnail
 * @returns Base64 encoded image data URL
 */
export function generateProductThumbnail(
  canvasMap: Record<string, fabric.Canvas>,
  primarySideId: string = 'front',
  maxWidth: number = 200,
  maxHeight: number = 200
): string {
  const primaryCanvas = canvasMap[primarySideId] || Object.values(canvasMap)[0];

  if (!primaryCanvas) {
    console.error('No canvas found for thumbnail generation');
    return '';
  }

  return generateCanvasThumbnail(primaryCanvas, maxWidth, maxHeight);
}