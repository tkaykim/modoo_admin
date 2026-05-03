import * as fabric from 'fabric';
import { uploadSVGToStorage, UploadResult } from './supabase-storage';
import { STORAGE_BUCKETS, STORAGE_FOLDERS } from './storage-config';
import { SupabaseClient } from '@supabase/supabase-js';

export interface TextObjectData {
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  left: number;
  top: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
}

export interface SVGExportResult {
  svg: string;
  uploadResult?: UploadResult;
  textObjects: TextObjectData[];
}

/**
 * Extract all text objects (i-text) from a canvas and convert to SVG
 * @param canvas - Fabric.js canvas instance
 * @returns SVG string containing all text objects
 */
export function extractTextObjectsToSVG(canvas: fabric.Canvas): SVGExportResult {
  // Get all text objects from the canvas
  const textObjects = canvas.getObjects().filter(obj => {
    return obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox';
  }) as fabric.IText[];

  if (textObjects.length === 0) {
    return {
      svg: '',
      textObjects: [],
    };
  }

  // Get canvas dimensions for SVG viewport
  const canvasWidth = canvas.width || 800;
  const canvasHeight = canvas.height || 600;

  // Create SVG header
  let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${canvasWidth}"
     height="${canvasHeight}"
     viewBox="0 0 ${canvasWidth} ${canvasHeight}">
`;

  // Add a group for all text objects
  svgContent += '  <g id="text-objects">\n';

  // Extract data for each text object
  const textObjectsData: TextObjectData[] = [];

  textObjects.forEach((textObj, index) => {
    // Get text properties
    const text = textObj.text || '';
    const fontFamily = textObj.fontFamily || 'Arial';
    const fontSize = textObj.fontSize || 16;
    const fill = textObj.fill?.toString() || '#000000';
    const fontWeight = textObj.fontWeight?.toString() || 'normal';
    const fontStyle = textObj.fontStyle || 'normal';
    const textAlign = textObj.textAlign || 'left';

    // Get position and transformation
    const left = textObj.left || 0;
    const top = textObj.top || 0;
    const angle = textObj.angle || 0;
    const scaleX = textObj.scaleX || 1;
    const scaleY = textObj.scaleY || 1;

    // Store object data
    textObjectsData.push({
      text,
      fontFamily,
      fontSize,
      fill,
      fontWeight,
      fontStyle,
      textAlign,
      left,
      top,
      angle,
      scaleX,
      scaleY,
    });

    // Build transform string
    let transform = `translate(${left}, ${top})`;
    if (angle !== 0) {
      transform += ` rotate(${angle})`;
    }
    if (scaleX !== 1 || scaleY !== 1) {
      transform += ` scale(${scaleX}, ${scaleY})`;
    }

    // Create SVG text element
    svgContent += `    <text
      id="text-${index}"
      x="0"
      y="0"
      font-family="${fontFamily}"
      font-size="${fontSize}"
      fill="${fill}"
      font-weight="${fontWeight}"
      font-style="${fontStyle}"
      text-anchor="${textAlign === 'center' ? 'middle' : textAlign === 'right' ? 'end' : 'start'}"
      transform="${transform}">`;

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
    textObjects: textObjectsData,
  };
}

/**
 * Extract text objects from canvas and upload as SVG to Supabase
 * @param supabase - Supabase client instance
 * @param canvas - Fabric.js canvas instance
 * @param filename - Optional custom filename
 * @returns SVG export result with upload information
 */
export async function extractAndUploadTextSVG(
  supabase: SupabaseClient,
  canvas: fabric.Canvas,
  filename?: string
): Promise<SVGExportResult> {
  // Extract SVG
  const result = extractTextObjectsToSVG(canvas);

  if (!result.svg) {
    console.warn('No text objects found in canvas');
    return result;
  }

  // Upload to Supabase
  const uploadResult = await uploadSVGToStorage(
    supabase,
    result.svg,
    STORAGE_BUCKETS.TEXT_EXPORTS,
    STORAGE_FOLDERS.SVG,
    filename
  );

  return {
    ...result,
    uploadResult,
  };
}

/**
 * Extract text objects from all canvases and upload as separate SVG files
 * @param supabase - Supabase client instance
 * @param canvasMap - Map of canvas instances by side ID
 * @returns Map of SVG export results by side ID
 */
export async function extractAndUploadAllTextSVG(
  supabase: SupabaseClient,
  canvasMap: Record<string, fabric.Canvas>
): Promise<Record<string, SVGExportResult>> {
  const results: Record<string, SVGExportResult> = {};

  for (const [sideId, canvas] of Object.entries(canvasMap)) {
    const result = await extractAndUploadTextSVG(
      supabase,
      canvas,
      `text-${sideId}`
    );
    results[sideId] = result;
  }

  return results;
}

/**
 * Helper function to escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Download SVG content as a file (for testing/debugging)
 */
export function downloadSVG(svgContent: string, filename: string = 'text-export.svg'): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
