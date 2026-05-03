/**
 * Server-side SVG export utility
 * Extracts text objects from canvas state JSON and generates SVG files
 * Also extracts image URLs from canvas objects for order tracking
 * This runs on the server during order creation
 */

import { uploadSVGToStorage, type UploadResult } from './supabase-storage';
import { STORAGE_BUCKETS, STORAGE_FOLDERS } from './storage-config';
import { SupabaseClient } from '@supabase/supabase-js';

interface CanvasObject {
  type: string;
  text?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  fill?: string;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
  originX?: string;
  originY?: string;
  textAlign?: string;
  data?: {
    id?: string;
    printMethod?: string;
    [key: string]: unknown;
  };
}

interface CanvasState {
  version?: string;
  objects?: CanvasObject[];
}

interface SVGExportResult {
  svg: string;
  uploadResult?: UploadResult;
  textObjectCount: number;
}

/**
 * Extract text objects from canvas state and convert to SVG
 * @param canvasState - The canvas state JSON from saved_designs or order_items
 * @param sideId - The side identifier (e.g., "front", "back")
 * @returns SVG content and metadata
 */
export function extractTextFromCanvasState(
  canvasState: CanvasState,
  sideId: string = 'canvas'
): SVGExportResult {
  if (!canvasState || !canvasState.objects || canvasState.objects.length === 0) {
    return {
      svg: '',
      textObjectCount: 0,
    };
  }

  // Filter for text objects only (case-insensitive to handle both Fabric.js v5 and v6)
  const textObjects = canvasState.objects.filter(obj => {
    const type = obj.type?.toLowerCase();
    return type === 'i-text' || type === 'itext' || type === 'text' || type === 'textbox';
  });

  if (textObjects.length === 0) {
    return {
      svg: '',
      textObjectCount: 0,
    };
  }

  // Estimate canvas dimensions from objects (default to 800x600)
  const canvasWidth = 800;
  const canvasHeight = 600;

  // Create SVG header
  let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${canvasWidth}"
     height="${canvasHeight}"
     viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <title>${sideId} Text Objects</title>
`;

  // Add metadata
  svgContent += `  <metadata>
    <description>Text objects exported for production - ${sideId}</description>
    <created>${new Date().toISOString()}</created>
  </metadata>
`;

  // Add a group for all text objects
  svgContent += '  <g id="text-objects">\n';

  // Process each text object
  textObjects.forEach((textObj, index) => {
    const text = textObj.text || '';
    const fontFamily = textObj.fontFamily || 'Arial';
    const fontSize = textObj.fontSize || 16;
    const fill = typeof textObj.fill === 'string' ? textObj.fill : '#000000';
    const fontWeight = textObj.fontWeight?.toString() || 'normal';
    const fontStyle = textObj.fontStyle || 'normal';
    const textAlign = textObj.textAlign || 'left';

    // Calculate position
    const left = textObj.left || 0;
    const top = textObj.top || 0;
    const angle = textObj.angle || 0;
    const scaleX = textObj.scaleX || 1;
    const scaleY = textObj.scaleY || 1;

    // Build transform string
    let transform = `translate(${left}, ${top})`;
    if (angle !== 0) {
      transform += ` rotate(${angle})`;
    }
    if (scaleX !== 1 || scaleY !== 1) {
      transform += ` scale(${scaleX}, ${scaleY})`;
    }

    // Determine text anchor based on alignment
    let textAnchor = 'start';
    if (textAlign === 'center') textAnchor = 'middle';
    else if (textAlign === 'right') textAnchor = 'end';

    // Add print method as data attribute if available
    const printMethod = textObj.data?.printMethod || '';
    const dataAttrs = printMethod ? ` data-print-method="${escapeXml(printMethod)}"` : '';

    // Create SVG text element
    svgContent += `    <text
      id="text-${sideId}-${index}"
      x="0"
      y="0"
      font-family="${escapeXml(fontFamily)}"
      font-size="${fontSize}"
      fill="${escapeXml(fill)}"
      font-weight="${escapeXml(fontWeight)}"
      font-style="${escapeXml(fontStyle)}"
      text-anchor="${textAnchor}"
      transform="${transform}"${dataAttrs}>`;

    // Handle multi-line text
    const lines = text.split('\n');
    if (lines.length > 1) {
      lines.forEach((line, lineIndex) => {
        const dy = lineIndex === 0 ? 0 : fontSize * 1.2;
        svgContent += `\n      <tspan x="0" dy="${dy}">${escapeXml(line)}</tspan>`;
      });
      svgContent += '\n    </text>\n';
    } else {
      svgContent += `${escapeXml(text)}</text>\n`;
    }
  });

  // Close SVG tags
  svgContent += '  </g>\n</svg>';

  return {
    svg: svgContent,
    textObjectCount: textObjects.length,
  };
}

/**
 * Extract text from all sides in canvas state and upload to Supabase
 * @param supabase - Supabase client instance (must be server client)
 * @param canvasStateMap - Map of side IDs to canvas states (e.g., { "front": {...}, "back": {...} })
 * @param orderItemId - The order item ID for unique filename
 * @returns Map of side IDs to SVG URLs
 */
export async function exportAndUploadTextFromCanvasState(
  supabase: SupabaseClient,
  canvasStateMap: Record<string, CanvasState | string>,
  orderItemId: string
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const [sideId, canvasStateRaw] of Object.entries(canvasStateMap)) {
    try {
      // Parse canvas state if it's a JSON string
      let canvasState: CanvasState;
      if (typeof canvasStateRaw === 'string') {
        canvasState = JSON.parse(canvasStateRaw);
      } else {
        canvasState = canvasStateRaw;
      }

      // Extract SVG from canvas state
      const { svg, textObjectCount } = extractTextFromCanvasState(canvasState, sideId);

      // Skip if no text objects
      if (!svg || textObjectCount === 0) {
        console.log(`No text objects found for ${sideId}, skipping SVG export`);
        continue;
      }

      // Upload to Supabase
      const uploadResult = await uploadSVGToStorage(
        supabase,
        svg,
        STORAGE_BUCKETS.TEXT_EXPORTS,
        STORAGE_FOLDERS.SVG,
        `order-${orderItemId}-${sideId}.svg`
      );

      if (uploadResult.success && uploadResult.url) {
        results[sideId] = uploadResult.url;
        console.log(`SVG uploaded for ${sideId}: ${uploadResult.url}`);
      } else {
        console.error(`Failed to upload SVG for ${sideId}:`, uploadResult.error);
      }
    } catch (error) {
      console.error(`Error exporting SVG for ${sideId}:`, error);
    }
  }

  return results;
}

/**
 * Helper function to escape XML special characters
 */
function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Extract uploaded image URLs from canvas state
 * @param canvasStateMap - Map of side IDs to canvas states
 * @returns Map of side IDs to arrays of image metadata
 */
export function extractImageUrlsFromCanvasState(
  canvasStateMap: Record<string, CanvasState | string>
): Record<string, Array<{ url: string; path?: string; uploadedAt?: string }>> {
  const imageUrls: Record<string, Array<{ url: string; path?: string; uploadedAt?: string }>> = {};

  for (const [sideId, canvasStateRaw] of Object.entries(canvasStateMap)) {
    // Parse canvas state if it's a JSON string
    let canvasState: CanvasState;
    try {
      if (typeof canvasStateRaw === 'string') {
        canvasState = JSON.parse(canvasStateRaw);
      } else {
        canvasState = canvasStateRaw;
      }
    } catch (error) {
      console.error(`Failed to parse canvas state for ${sideId}:`, error);
      continue;
    }

    if (!canvasState || !canvasState.objects || canvasState.objects.length === 0) {
      continue;
    }

    // Filter for image objects with Supabase storage data (case-insensitive)
    const imageObjects = canvasState.objects.filter(obj => obj.type?.toLowerCase() === 'image');

    const sideImages: Array<{ url: string; path?: string; uploadedAt?: string }> = [];

    imageObjects.forEach(imgObj => {
      // Check if image has Supabase storage metadata
      const supabaseUrl = imgObj.data?.supabaseUrl;
      const supabasePath = imgObj.data?.supabasePath;
      const uploadedAt = imgObj.data?.uploadedAt;

      if (supabaseUrl) {
        sideImages.push({
          url: String(supabaseUrl),
          path: supabasePath ? String(supabasePath) : undefined,
          uploadedAt: uploadedAt ? String(uploadedAt) : undefined,
        });
      }
    });

    if (sideImages.length > 0) {
      imageUrls[sideId] = sideImages;
    }
  }

  return imageUrls;
}
