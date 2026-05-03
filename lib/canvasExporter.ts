/**
 * Canvas Exporter Utility
 *
 * Utilities for exporting canvas states to various formats for production/printing.
 * Works with OrderCanvasRenderer to generate print-ready files.
 */

import * as fabric from 'fabric';

export interface ExportOptions {
  format?: 'png' | 'jpeg' | 'svg';
  quality?: number; // 0-1 for JPEG quality
  multiplier?: number; // Scale multiplier for higher resolution
  backgroundColor?: string;
}

export interface ProductSideExport {
  sideId: string;
  sideName: string;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Export a single Fabric.js canvas to an image data URL
 */
export function exportCanvasToImage(
  canvas: fabric.Canvas,
  options: ExportOptions = {}
): string {
  const {
    format = 'png',
    quality = 1.0,
    multiplier = 1,
    backgroundColor = 'transparent',
  } = options;

  if (format === 'svg') {
    return canvas.toSVG();
  }

  // For PNG or JPEG
  return canvas.toDataURL({
    format: format === 'png' ? 'png' : 'jpeg',
    quality,
    multiplier,
    enableRetinaScaling: true,
  });
}

/**
 * Export canvas to a downloadable blob
 */
export async function exportCanvasToBlob(
  canvas: fabric.Canvas,
  options: ExportOptions = {}
): Promise<Blob> {
  const dataUrl = exportCanvasToImage(canvas, options);
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Download a canvas as an image file
 */
export async function downloadCanvas(
  canvas: fabric.Canvas,
  filename: string,
  options: ExportOptions = {}
): Promise<void> {
  const blob = await exportCanvasToBlob(canvas, options);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Create a high-resolution print version of a canvas
 * @param canvas - The Fabric.js canvas instance
 * @param dpi - Desired DPI (default 300 for print quality)
 * @returns Data URL of high-res image
 */
export function createPrintVersion(
  canvas: fabric.Canvas,
  dpi: number = 300
): string {
  // Standard screen DPI is 72
  const multiplier = dpi / 72;

  return exportCanvasToImage(canvas, {
    format: 'png',
    quality: 1.0,
    multiplier,
    backgroundColor: 'white',
  });
}

/**
 * Export only the print area (cropped canvas)
 * This exports just the design without the product mockup
 */
export function exportPrintAreaOnly(
  canvas: fabric.Canvas,
  printArea: { x: number; y: number; width: number; height: number },
  options: ExportOptions = {}
): string {
  const { format = 'png', quality = 1.0, multiplier = 1 } = options;

  // Create a temporary canvas with just the print area
  const tempCanvas = new fabric.Canvas(undefined, {
    width: printArea.width,
    height: printArea.height,
  });

  // Get all user objects (excluding background)
  const userObjects = canvas.getObjects().filter((obj) => {
    // @ts-expect-error - Checking custom data property
    if (obj.excludeFromExport || obj.data?.id === 'background-product-image') {
      return false;
    }
    return true;
  });

  // Clone and add objects to temp canvas, adjusting positions
  userObjects.forEach((obj) => {
    obj.clone().then((clonedObj: fabric.FabricObject) => {
      // Adjust position to be relative to print area origin
      const currentLeft = clonedObj.left || 0;
      const currentTop = clonedObj.top || 0;

      clonedObj.set({
        left: currentLeft - printArea.x,
        top: currentTop - printArea.y,
        clipPath: undefined, // Remove clipping
      });

      tempCanvas.add(clonedObj);
    });
  });

  tempCanvas.requestRenderAll();

  const dataUrl = tempCanvas.toDataURL({
    format: format === 'png' ? 'png' : 'jpeg',
    quality,
    multiplier,
  });

  tempCanvas.dispose();

  return dataUrl;
}

/**
 * Batch export all sides of a product to separate images
 * Usage with OrderCanvasRenderer:
 *
 * ```tsx
 * const canvases = useRef<Record<string, fabric.Canvas>>({});
 *
 * // Store canvas refs as they're created
 * <SingleCanvasRenderer
 *   onCanvasReady={(canvas, sideId) => {
 *     canvases.current[sideId] = canvas;
 *   }}
 * />
 *
 * // Export all sides
 * const exports = exportAllSides(canvases.current, sides);
 * ```
 */
export function exportAllSides(
  canvases: Record<string, fabric.Canvas>,
  sides: Array<{ id: string; name: string }>,
  options: ExportOptions = {}
): ProductSideExport[] {
  const exports: ProductSideExport[] = [];

  sides.forEach((side) => {
    const canvas = canvases[side.id];
    if (!canvas) return;

    const dataUrl = exportCanvasToImage(canvas, options);

    exports.push({
      sideId: side.id,
      sideName: side.name,
      dataUrl,
      width: canvas.getWidth(),
      height: canvas.getHeight(),
    });
  });

  return exports;
}

/**
 * Create a production package with all exports
 * Returns a zip-ready structure with metadata
 */
export interface ProductionPackage {
  orderId: string;
  orderItemId: string;
  productTitle: string;
  timestamp: string;
  sides: Array<{
    id: string;
    name: string;
    filename: string;
    dataUrl: string;
    dimensions: {
      width: number;
      height: number;
      widthMm?: number;
      heightMm?: number;
    };
  }>;
  metadata: {
    quantity: number;
    size?: string;
    color?: string;
    colorHex?: string;
  };
}

export function createProductionPackage(
  orderId: string,
  orderItemId: string,
  productTitle: string,
  canvases: Record<string, fabric.Canvas>,
  sides: Array<{
    id: string;
    name: string;
    realLifeDimensions?: {
      printAreaWidthMm: number;
      printAreaHeightMm: number;
    };
  }>,
  metadata: {
    quantity: number;
    size?: string;
    color?: string;
    colorHex?: string;
  },
  options: ExportOptions = {}
): ProductionPackage {
  const timestamp = new Date().toISOString();

  const sideExports = sides.map((side) => {
    const canvas = canvases[side.id];
    if (!canvas) {
      throw new Error(`Canvas not found for side: ${side.id}`);
    }

    const dataUrl = createPrintVersion(canvas, 300); // 300 DPI for print
    const filename = `${orderItemId}_${side.id}_${timestamp}.png`;

    return {
      id: side.id,
      name: side.name,
      filename,
      dataUrl,
      dimensions: {
        width: canvas.getWidth(),
        height: canvas.getHeight(),
        widthMm: side.realLifeDimensions?.printAreaWidthMm,
        heightMm: side.realLifeDimensions?.printAreaHeightMm,
      },
    };
  });

  return {
    orderId,
    orderItemId,
    productTitle,
    timestamp,
    sides: sideExports,
    metadata,
  };
}

/**
 * Download a production package as individual files
 */
export async function downloadProductionPackage(
  productionPackage: ProductionPackage
): Promise<void> {
  for (const side of productionPackage.sides) {
    const response = await fetch(side.dataUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = side.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    // Small delay between downloads to avoid browser blocking
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Upload production package to Supabase Storage
 * Useful for storing production files in the cloud
 */
export async function uploadProductionPackage(
  supabaseClient: any,
  productionPackage: ProductionPackage,
  bucketName: string = 'production-files'
): Promise<{ success: boolean; urls: string[] }> {
  const urls: string[] = [];

  try {
    for (const side of productionPackage.sides) {
      // Convert data URL to blob
      const response = await fetch(side.dataUrl);
      const blob = await response.blob();

      // Upload to Supabase Storage
      const filePath = `${productionPackage.orderId}/${side.filename}`;

      const { data, error } = await supabaseClient.storage
        .from(bucketName)
        .upload(filePath, blob, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabaseClient.storage.from(bucketName).getPublicUrl(filePath);

      urls.push(publicUrl);
    }

    return { success: true, urls };
  } catch (error) {
    console.error('Error uploading production package:', error);
    return { success: false, urls: [] };
  }
}

/**
 * Generate a production manifest JSON file
 * Contains all metadata for the print shop
 */
export function generateProductionManifest(
  productionPackage: ProductionPackage
): string {
  const manifest = {
    order_id: productionPackage.orderId,
    order_item_id: productionPackage.orderItemId,
    product_title: productionPackage.productTitle,
    generated_at: productionPackage.timestamp,
    quantity: productionPackage.metadata.quantity,
    size: productionPackage.metadata.size,
    color: productionPackage.metadata.color,
    color_hex: productionPackage.metadata.colorHex,
    sides: productionPackage.sides.map((side) => ({
      id: side.id,
      name: side.name,
      filename: side.filename,
      width_px: side.dimensions.width,
      height_px: side.dimensions.height,
      width_mm: side.dimensions.widthMm,
      height_mm: side.dimensions.heightMm,
      dpi: 300,
      format: 'PNG',
    })),
  };

  return JSON.stringify(manifest, null, 2);
}

/**
 * Download manifest as JSON file
 */
export function downloadManifest(
  productionPackage: ProductionPackage,
  filename?: string
): void {
  const manifest = generateProductionManifest(productionPackage);
  const blob = new Blob([manifest], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download =
    filename || `manifest_${productionPackage.orderItemId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
