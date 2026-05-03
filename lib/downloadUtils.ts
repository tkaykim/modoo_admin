import { CanvasState, CustomFont } from '@/types/types';

// ============================================================================
// Types
// ============================================================================

export type ImageUrlEntry = { url: string; path?: string; uploadedAt?: string };
export type ImageUrlsBySide = Record<string, ImageUrlEntry[]>;
export type TextSvgObjectUrlsBySide = Record<string, Record<string, string>>;

// ============================================================================
// Parsing & Coercion Utilities
// ============================================================================

export const parseCanvasState = (value: unknown): CanvasState | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error('Error parsing canvas state:', error);
      return null;
    }
  }
  return value as CanvasState;
};

export const normalizeColorToHex = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'transparent') return null;

  if (trimmed.startsWith('#')) {
    const hex = trimmed.length === 4
      ? `#${trimmed.slice(1).split('').map((c) => c + c).join('')}`
      : trimmed;
    if (/^#([0-9a-f]{6})$/i.test(hex)) {
      return hex.toUpperCase();
    }
    return null;
  }

  const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbMatch) return null;

  const toHex = (raw: string) => {
    const num = Math.max(0, Math.min(255, Number(raw)));
    return num.toString(16).padStart(2, '0');
  };

  return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`.toUpperCase();
};

export const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const parseJsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('Error parsing JSON value:', error);
    return null;
  }
};

export const coerceImageUrlsBySide = (value: unknown): ImageUrlsBySide => {
  const parsed = parseJsonValue(value);
  if (!isPlainRecord(parsed)) return {};

  const result: ImageUrlsBySide = {};
  Object.entries(parsed).forEach(([sideId, rawImages]) => {
    if (!Array.isArray(rawImages)) return;
    const images: ImageUrlEntry[] = [];
    rawImages.forEach((raw) => {
      if (!isPlainRecord(raw)) return;
      const url = typeof raw.url === 'string' ? raw.url : '';
      if (!url) return;
      images.push({
        url,
        path: typeof raw.path === 'string' ? raw.path : undefined,
        uploadedAt: typeof raw.uploadedAt === 'string' ? raw.uploadedAt : undefined,
      });
    });
    if (images.length > 0) {
      result[sideId] = images;
    }
  });

  return result;
};

export const coerceTextSvgExports = (value: unknown): Record<string, unknown> => {
  const parsed = parseJsonValue(value);
  if (!isPlainRecord(parsed)) return {};
  return parsed;
};

export const coerceTextSvgObjectUrlsBySide = (value: unknown): TextSvgObjectUrlsBySide => {
  const parsed = parseJsonValue(value);
  if (!isPlainRecord(parsed)) return {};

  const result: TextSvgObjectUrlsBySide = {};
  Object.entries(parsed).forEach(([sideId, rawSideObjects]) => {
    if (!isPlainRecord(rawSideObjects)) return;
    const objectMap: Record<string, string> = {};
    Object.entries(rawSideObjects).forEach(([objectId, url]) => {
      if (typeof url !== 'string' || !url) return;
      objectMap[objectId] = url;
    });
    if (Object.keys(objectMap).length > 0) {
      result[sideId] = objectMap;
    }
  });

  return result;
};

export const coerceCustomFonts = (value: unknown): CustomFont[] => {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  const fonts: CustomFont[] = [];
  parsed.forEach((raw) => {
    if (!isPlainRecord(raw)) return;
    const fontFamily = typeof raw.fontFamily === 'string' ? raw.fontFamily : '';
    const url = typeof raw.url === 'string' ? raw.url : '';
    if (!fontFamily || !url) return;
    fonts.push({
      fontFamily,
      fileName: typeof raw.fileName === 'string' ? raw.fileName : `${fontFamily}.ttf`,
      url,
      path: typeof raw.path === 'string' ? raw.path : undefined,
      uploadedAt: typeof raw.uploadedAt === 'string' ? raw.uploadedAt : undefined,
      format: typeof raw.format === 'string' ? raw.format : undefined,
    });
  });

  return fonts;
};

// ============================================================================
// SVG Generation
// ============================================================================

export const escapeXml = (value: string): string => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

export const getTextSvgFromCanvasState = (canvasState: CanvasState, sideId: string): string | null => {
  const objects = Array.isArray(canvasState?.objects) ? canvasState.objects : [];
  const textObjects = objects.filter((obj) => {
    const type = typeof obj?.type === 'string' ? obj.type.toLowerCase() : '';
    return type === 'i-text' || type === 'itext' || type === 'text' || type === 'textbox' || type === 'curvedtext';
  });

  if (textObjects.length === 0) {
    return null;
  }

  const canvasWidth = 800;
  const canvasHeight = 600;

  let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg"\n` +
    `     xmlns:xlink="http://www.w3.org/1999/xlink"\n` +
    `     width="${canvasWidth}"\n` +
    `     height="${canvasHeight}"\n` +
    `     viewBox="0 0 ${canvasWidth} ${canvasHeight}">\n` +
    `  <title>${escapeXml(sideId)} Text Objects</title>\n`;

  svgContent += `  <metadata>\n` +
    `    <description>Text objects exported for production - ${escapeXml(sideId)}</description>\n` +
    `    <created>${new Date().toISOString()}</created>\n` +
    `  </metadata>\n`;

  svgContent += '  <g id="text-objects">\n';

  textObjects.forEach((textObj, index) => {
    const text = typeof textObj.text === 'string' ? textObj.text : '';
    const fontFamily = typeof textObj.fontFamily === 'string' ? textObj.fontFamily : 'Arial';
    const fontSize = typeof textObj.fontSize === 'number' ? textObj.fontSize : 16;
    const fill = typeof textObj.fill === 'string' ? textObj.fill : '#000000';
    const fontWeight = textObj.fontWeight ? String(textObj.fontWeight) : 'normal';
    const fontStyle = typeof textObj.fontStyle === 'string' ? textObj.fontStyle : 'normal';
    const textAlign = typeof textObj.textAlign === 'string' ? textObj.textAlign : 'left';

    const left = typeof textObj.left === 'number' ? textObj.left : 0;
    const top = typeof textObj.top === 'number' ? textObj.top : 0;
    const angle = typeof textObj.angle === 'number' ? textObj.angle : 0;
    const scaleX = typeof textObj.scaleX === 'number' ? textObj.scaleX : 1;
    const scaleY = typeof textObj.scaleY === 'number' ? textObj.scaleY : 1;

    let transform = `translate(${left}, ${top})`;
    if (angle !== 0) {
      transform += ` rotate(${angle})`;
    }
    if (scaleX !== 1 || scaleY !== 1) {
      transform += ` scale(${scaleX}, ${scaleY})`;
    }

    let textAnchor = 'start';
    if (textAlign === 'center') textAnchor = 'middle';
    else if (textAlign === 'right') textAnchor = 'end';

    const printMethod = textObj.data?.printMethod || '';
    const dataAttrs = printMethod ? ` data-print-method="${escapeXml(printMethod)}"` : '';

    svgContent += `    <text\n` +
      `      id="text-${escapeXml(sideId)}-${index}"\n` +
      `      x="0"\n` +
      `      y="0"\n` +
      `      font-family="${escapeXml(fontFamily)}"\n` +
      `      font-size="${fontSize}"\n` +
      `      fill="${escapeXml(fill)}"\n` +
      `      font-weight="${escapeXml(fontWeight)}"\n` +
      `      font-style="${escapeXml(fontStyle)}"\n` +
      `      text-anchor="${textAnchor}"\n` +
      `      transform="${transform}"${dataAttrs}>`;

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

  svgContent += '  </g>\n</svg>';
  return svgContent;
};

// ============================================================================
// File Extension Utilities
// ============================================================================

export const getFileExtensionFromName = (name?: string | null) => {
  if (!name) return null;
  const sanitized = name.split('?')[0].split('#')[0];
  const parts = sanitized.split('.');
  if (parts.length < 2) return null;
  const ext = parts.pop();
  if (!ext) return null;
  return ext.toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const getFileExtensionFromUrl = (url?: string | null) => {
  if (!url) return null;
  const sanitized = url.split('?')[0].split('#')[0];
  const lastSegment = sanitized.split('/').pop() || '';
  return getFileExtensionFromName(lastSegment);
};

export const getFileExtensionFromType = (fileType?: string | null) => {
  if (!fileType) return null;
  const normalized = fileType.toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/svg+xml') return 'svg';
  if (normalized === 'image/bmp') return 'bmp';
  if (normalized === 'image/tiff') return 'tiff';
  if (normalized === 'application/postscript') return 'ai';
  if (normalized === 'image/vnd.adobe.photoshop') return 'psd';
  const parts = normalized.split('/');
  if (parts.length === 2) {
    return parts[1].replace(/[^a-z0-9]/g, '');
  }
  return null;
};

export const buildFilename = (base: string, extension?: string | null) => {
  if (!extension) return base;
  return `${base}.${extension}`;
};

export const sanitizeFilenameSegment = (value: string) => value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);

// ============================================================================
// Download Helpers
// ============================================================================

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

export const downloadDataUrl = async (dataUrl: string, filename: string) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  downloadBlob(blob, filename);
};

export const downloadUrl = async (url: string, filename: string) => {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }
    const blob = await response.blob();
    downloadBlob(blob, filename);
  } catch (error) {
    console.error('Falling back to direct download link:', error);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  }
};

// ============================================================================
// Print Method Helpers
// ============================================================================

export const isTextObjectType = (rawType?: string | null) => {
  const normalized = (rawType || '').toLowerCase();
  return normalized === 'i-text' || normalized === 'itext' || normalized === 'text' || normalized === 'textbox' || normalized === 'curvedtext';
};

export const getPrintMethodName = (method?: string | null): string => {
  if (!method) return 'DTF';
  const methodMap: Record<string, string> = {
    'dtf': 'DTF',
    'dtg': 'DTG',
    'screen_printing': '나염',
    'embroidery': '자수',
    'applique': '아플리케',
  };
  return methodMap[method] || method;
};

export const getPrintMethodColor = (method?: string | null): string => {
  if (!method) return 'bg-blue-100 text-blue-700';
  const colorMap: Record<string, string> = {
    'dtf': 'bg-blue-100 text-blue-700',
    'dtg': 'bg-blue-100 text-blue-700',
    'screen_printing': 'bg-green-100 text-green-700',
    'embroidery': 'bg-purple-100 text-purple-700',
    'applique': 'bg-amber-100 text-amber-700',
  };
  return colorMap[method] || 'bg-gray-100 text-gray-600';
};
