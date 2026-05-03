import * as fabric from 'fabric';

/**
 * RGB color type
 */
interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Converts hex color to RGB
 */
function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

/**
 * Converts RGB to hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();
}

/**
 * Calculates Euclidean distance between two RGB colors
 */
function colorDistance(c1: RGB, c2: RGB): number {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * Merges similar colors based on sensitivity threshold
 * @param colors - Array of hex color codes
 * @param sensitivity - Threshold for color similarity (0-100, lower = more sensitive)
 * @returns Array of merged color hex codes
 */
export function mergeSimilarColors(colors: string[], sensitivity: number = 30): string[] {
  if (colors.length === 0) return [];

  // Convert sensitivity (0-100) to distance threshold (0-441.67)
  // Max RGB distance is sqrt(255^2 + 255^2 + 255^2) ≈ 441.67
  const threshold = (sensitivity / 100) * 441.67;

  const rgbColors = colors.map(hex => ({ hex, rgb: hexToRgb(hex) }));
  const merged: string[] = [];
  const used = new Set<number>();

  for (let i = 0; i < rgbColors.length; i++) {
    if (used.has(i)) continue;

    const group: RGB[] = [rgbColors[i].rgb];
    used.add(i);

    // Find all similar colors
    for (let j = i + 1; j < rgbColors.length; j++) {
      if (used.has(j)) continue;

      const distance = colorDistance(rgbColors[i].rgb, rgbColors[j].rgb);
      if (distance <= threshold) {
        group.push(rgbColors[j].rgb);
        used.add(j);
      }
    }

    // Calculate average color of the group
    const avgR = group.reduce((sum, c) => sum + c.r, 0) / group.length;
    const avgG = group.reduce((sum, c) => sum + c.g, 0) / group.length;
    const avgB = group.reduce((sum, c) => sum + c.b, 0) / group.length;

    merged.push(rgbToHex(avgR, avgG, avgB));
  }

  return merged;
}

/**
 * Extracts dominant colors from an image object by sampling pixels
 * @param imgObj - Fabric.js image object
 * @param sampleRate - How often to sample pixels (1 = every pixel, 10 = every 10th pixel)
 * @returns Array of color hex codes
 */
async function extractColorsFromImage(imgObj: fabric.FabricImage, sampleRate: number = 10): Promise<string[]> {
  try {
    const imgElement = imgObj.getElement() as HTMLImageElement;
    if (!imgElement) return [];

    // Create an off-screen canvas to analyze the image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];

    // Use the actual image dimensions
    const width = imgElement.naturalWidth || imgElement.width;
    const height = imgElement.naturalHeight || imgElement.height;

    if (width === 0 || height === 0) return [];

    canvas.width = width;
    canvas.height = height;

    // Draw the image
    ctx.drawImage(imgElement, 0, 0, width, height);

    // Sample pixels
    const colorMap = new Map<string, number>();

    for (let y = 0; y < height; y += sampleRate) {
      for (let x = 0; x < width; x += sampleRate) {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const alpha = pixel[3];

        // Skip transparent or very translucent pixels
        if (alpha < 50) continue;

        const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
        colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
      }
    }

    // Filter out very rare colors (less than 0.1% of samples)
    const totalSamples = colorMap.size;
    const minOccurrences = Math.max(1, totalSamples * 0.001);

    const significantColors = Array.from(colorMap.entries())
      .filter(([_, count]) => count >= minOccurrences)
      .map(([hex]) => hex);

    return significantColors;
  } catch (error) {
    console.error('Error extracting colors from image:', error);
    return [];
  }
}

/**
 * Extracts all colors from a Fabric.js canvas object
 * @param obj - Fabric.js object
 * @returns Promise with array of color hex codes
 */
async function extractColorsFromObject(obj: fabric.FabricObject): Promise<string[]> {
  const colors: string[] = [];

  // Handle image objects
  if (obj.type === 'image') {
    const imgObj = obj as fabric.FabricImage;
    const imageColors = await extractColorsFromImage(imgObj);
    colors.push(...imageColors);
  }

  // Get fill color
  if (obj.fill && typeof obj.fill === 'string') {
    colors.push(normalizeColor(obj.fill));
  }

  // Get stroke color
  if (obj.stroke && typeof obj.stroke === 'string') {
    colors.push(normalizeColor(obj.stroke));
  }

  // Handle text objects with different colors per character
  if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
    const textObj = obj as fabric.Text;

    // Check if there are style overrides
    if (textObj.styles) {
      Object.values(textObj.styles).forEach((lineStyles) => {
        Object.values(lineStyles).forEach((charStyle) => {
          if (charStyle.fill && typeof charStyle.fill === 'string') {
            colors.push(normalizeColor(charStyle.fill));
          }
          if (charStyle.stroke && typeof charStyle.stroke === 'string') {
            colors.push(normalizeColor(charStyle.stroke));
          }
        });
      });
    }
  }

  // Handle gradient fills (extract all color stops)
  if (obj.fill && typeof obj.fill === 'object' && 'colorStops' in obj.fill) {
    const gradient = obj.fill as any; // Gradient type
    if (gradient.colorStops && Array.isArray(gradient.colorStops)) {
      gradient.colorStops.forEach((stop: any) => {
        if (stop.color) {
          colors.push(normalizeColor(stop.color));
        }
      });
    }
  }

  return colors;
}

/**
 * Normalizes a color to hex format
 * Converts rgb(), rgba(), and named colors to hex
 */
function normalizeColor(color: string): string {
  // If already a hex color, return uppercase
  if (color.startsWith('#')) {
    return color.toUpperCase();
  }

  // Handle rgb/rgba colors
  if (color.startsWith('rgb')) {
    return rgbStringToHex(color);
  }

  // Handle named colors by creating a temporary element
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    return ctx.fillStyle.toUpperCase();
  }

  return color.toUpperCase();
}

/**
 * Converts rgb/rgba string to hex
 */
function rgbStringToHex(rgb: string): string {
  const matches = rgb.match(/\d+/g);
  if (!matches || matches.length < 3) return rgb;

  const r = parseInt(matches[0]);
  const g = parseInt(matches[1]);
  const b = parseInt(matches[2]);

  return rgbToHex(r, g, b);
}

/**
 * Extracts all unique colors from a canvas
 * @param canvas - Fabric.js canvas instance
 * @param sensitivity - Merge sensitivity (0-100, lower = more sensitive)
 * @returns Promise with array of unique color hex codes
 */
export async function extractColorsFromCanvas(
  canvas: fabric.Canvas,
  sensitivity: number = 30
): Promise<string[]> {
  const allColors: string[] = [];
  const objects = canvas.getObjects();

  // Process all objects
  for (const obj of objects) {
    // Skip background product images
    // @ts-expect-error - Checking custom data property
    if (obj.data?.id === 'background-product-image') continue;

    // Skip guide boxes and snap lines
    if (obj.excludeFromExport) continue;

    const colors = await extractColorsFromObject(obj);
    allColors.push(...colors);
  }

  // Get unique colors
  const uniqueColors = [...new Set(allColors)];

  // Merge similar colors
  const mergedColors = mergeSimilarColors(uniqueColors, sensitivity);

  return mergedColors;
}

/**
 * Extracts all unique colors from all canvases
 * @param canvasMap - Map of canvas instances
 * @param sensitivity - Merge sensitivity (0-100, lower = more sensitive to differences)
 * @returns Promise with object containing unique colors array and count
 */
export async function extractAllColors(
  canvasMap: Record<string, fabric.Canvas>,
  sensitivity: number = 30
): Promise<{
  colors: string[];
  count: number;
}> {
  const allColors: string[] = [];

  // Process all canvases
  for (const canvas of Object.values(canvasMap)) {
    const colors = await extractColorsFromCanvas(canvas, 0); // Don't merge per canvas
    allColors.push(...colors);
  }

  // Get unique colors
  const uniqueColors = [...new Set(allColors)];

  // Merge similar colors across all canvases
  const mergedColors = mergeSimilarColors(uniqueColors, sensitivity);

  return {
    colors: mergedColors,
    count: mergedColors.length,
  };
}

/**
 * Counts unique colors in a single object for pricing purposes
 * @param obj - Fabric.js object
 * @param sensitivity - Merge sensitivity (0-100, default 30)
 * @returns Promise with number of unique colors
 */
export async function countObjectColors(
  obj: fabric.FabricObject,
  sensitivity: number = 30
): Promise<number> {
  const colors = await extractColorsFromObject(obj);
  const uniqueColors = [...new Set(colors)];
  const mergedColors = mergeSimilarColors(uniqueColors, sensitivity);
  return mergedColors.length;
}