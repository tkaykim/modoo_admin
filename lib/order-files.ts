/**
 * Utility functions for managing order item files
 * Helps retrieve and download all associated images and SVGs
 */

export interface OrderItemFile {
  type: 'image' | 'svg';
  side: string;
  objectId?: string;
  url: string;
  path?: string;
  uploadedAt?: string;
}

export interface OrderItemFiles {
  images: OrderItemFile[];
  svgs: OrderItemFile[];
  allFiles: OrderItemFile[];
}

/**
 * Extract all file URLs from an order item
 * @param orderItem - Order item with text_svg_exports and image_urls
 * @returns Organized file information
 */
export function getOrderItemFiles(orderItem: {
  text_svg_exports?: Record<string, unknown>;
  image_urls?: Record<string, Array<{ url: string; path?: string; uploadedAt?: string }>>;
}): OrderItemFiles {
  const images: OrderItemFile[] = [];
  const svgs: OrderItemFile[] = [];
  const seenSvgUrls = new Set<string>();

  // Extract image files
  if (orderItem.image_urls) {
    Object.entries(orderItem.image_urls).forEach(([side, sideImages]) => {
      if (Array.isArray(sideImages)) {
        sideImages.forEach(img => {
          images.push({
            type: 'image',
            side,
            url: img.url,
            path: img.path,
            uploadedAt: img.uploadedAt,
          });
        });
      }
    });
  }

  // Extract SVG files
  if (orderItem.text_svg_exports) {
    Object.entries(orderItem.text_svg_exports).forEach(([side, value]) => {
      if (side === '__objects') return;
      if (typeof value !== 'string') return;
      if (!value) return;
      if (seenSvgUrls.has(value)) return;
      seenSvgUrls.add(value);
      svgs.push({
        type: 'svg',
        side,
        url: value,
      });
    });

    const objectExports = (orderItem.text_svg_exports as Record<string, unknown>)['__objects'];
    if (objectExports && typeof objectExports === 'object') {
      Object.entries(objectExports as Record<string, unknown>).forEach(([side, sideObjects]) => {
        if (!sideObjects || typeof sideObjects !== 'object') return;
        Object.entries(sideObjects as Record<string, unknown>).forEach(([objectId, url]) => {
          if (typeof url !== 'string' || !url) return;
          if (seenSvgUrls.has(url)) return;
          seenSvgUrls.add(url);
          svgs.push({
            type: 'svg',
            side,
            objectId,
            url,
          });
        });
      });
    }
  }

  return {
    images,
    svgs,
    allFiles: [...images, ...svgs],
  };
}

/**
 * Download a file from a URL
 * @param url - File URL
 * @param filename - Desired filename
 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    // Determine filename
    const finalFilename = filename || url.split('/').pop() || 'download';

    // Create download link
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = finalFilename;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}

/**
 * Download all files for an order item
 * @param orderItem - Order item with file URLs
 * @param filenamePrefix - Optional prefix for filenames
 */
export async function downloadAllOrderItemFiles(
  orderItem: {
    id: string;
    product_title: string;
    text_svg_exports?: Record<string, unknown>;
    image_urls?: Record<string, Array<{ url: string; path?: string; uploadedAt?: string }>>;
  },
  filenamePrefix?: string
): Promise<void> {
  const files = getOrderItemFiles(orderItem);
  const prefix = filenamePrefix || `order-${orderItem.id}`;

  // Download all images
  for (const [index, image] of files.images.entries()) {
    const ext = image.url.split('.').pop() || 'jpg';
    const filename = `${prefix}-${image.side}-image-${index + 1}.${ext}`;
    await downloadFile(image.url, filename);

    // Small delay between downloads to avoid browser blocking
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Download all SVGs
  for (const svg of files.svgs) {
    const sanitize = (value: string) => value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);
    const filename = svg.objectId
      ? `${prefix}-${svg.side}-text-${sanitize(svg.objectId)}.svg`
      : `${prefix}-${svg.side}-text.svg`;
    await downloadFile(svg.url, filename);

    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Get file count summary for an order item
 * @param orderItem - Order item with file URLs
 * @returns File count summary
 */
export function getOrderItemFileCount(orderItem: {
  text_svg_exports?: Record<string, unknown>;
  image_urls?: Record<string, Array<{ url: string; path?: string; uploadedAt?: string }>>;
}): { images: number; svgs: number; total: number } {
  const files = getOrderItemFiles(orderItem);

  return {
    images: files.images.length,
    svgs: files.svgs.length,
    total: files.allFiles.length,
  };
}

/**
 * Format file size from bytes
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
