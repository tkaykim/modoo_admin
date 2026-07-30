import type { CustomFont } from '@/types/types';

const TEXT_TYPES = new Set(['i-text', 'itext', 'text', 'textbox', 'curvedtext']);
const FONT_FORMATS = new Set(['ttf', 'otf', 'woff', 'woff2']);

type CanvasObject = {
  type?: unknown;
  fontFamily?: unknown;
  data?: {
    fontUrl?: unknown;
    fontMetadata?: unknown;
    fontDisplayName?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function isCustomFont(value: unknown): value is CustomFont {
  if (!value || typeof value !== 'object') return false;
  const font = value as Partial<CustomFont>;
  return typeof font.fontFamily === 'string' && typeof font.url === 'string' && font.url.length > 0;
}

function fromObject(object: CanvasObject): CustomFont | null {
  if (isCustomFont(object.data?.fontMetadata)) return object.data.fontMetadata;
  const url = typeof object.data?.fontUrl === 'string' ? object.data.fontUrl : '';
  const fontFamily = typeof object.fontFamily === 'string' ? object.fontFamily : '';
  if (!url || !fontFamily) return null;
  const cleanUrl = url.split('?')[0];
  const fileName = cleanUrl.split('/').pop() || fontFamily;
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  return {
    fontFamily,
    displayName:
      typeof object.data?.fontDisplayName === 'string'
        ? object.data.fontDisplayName
        : fontFamily,
    fileName,
    url,
    path: fileName,
    format: FONT_FORMATS.has(extension) ? extension : 'ttf',
  };
}

function parseState(value: unknown): { objects?: CanvasObject[] } | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' ? value as { objects?: CanvasObject[] } : null;
}

export function mergeCustomFonts(
  ...lists: Array<CustomFont[] | null | undefined>
): CustomFont[] {
  const byIdentity = new Map<string, CustomFont>();
  for (const fonts of lists) {
    for (const font of fonts || []) {
      if (!font?.fontFamily || !font.url) continue;
      byIdentity.set(`${font.fontFamily}\n${font.url}`, font);
    }
  }
  return Array.from(byIdentity.values());
}

export function extractCustomFontsFromCanvasState(
  canvasStateMap: Record<string, unknown> | null | undefined
): CustomFont[] {
  const fonts: CustomFont[] = [];
  for (const rawState of Object.values(canvasStateMap || {})) {
    const state = parseState(rawState);
    for (const object of state?.objects || []) {
      const type = typeof object.type === 'string' ? object.type.toLowerCase() : '';
      if (!TEXT_TYPES.has(type)) continue;
      const font = fromObject(object);
      if (font) fonts.push(font);
    }
  }
  return mergeCustomFonts(fonts);
}

export function bindCustomFontsToCanvasState(
  canvasStateMap: Record<string, unknown>,
  customFonts: CustomFont[] | null | undefined
): { canvasState: Record<string, unknown>; customFonts: CustomFont[] } {
  const knownFonts = mergeCustomFonts(
    customFonts,
    extractCustomFontsFromCanvasState(canvasStateMap)
  );
  const byFamily = new Map(knownFonts.map((font) => [font.fontFamily, font]));
  const nextState: Record<string, unknown> = {};

  for (const [sideId, rawState] of Object.entries(canvasStateMap)) {
    const state = parseState(rawState);
    if (!state) {
      nextState[sideId] = rawState;
      continue;
    }
    const objects = (state.objects || []).map((object) => {
      const type = typeof object.type === 'string' ? object.type.toLowerCase() : '';
      const family = typeof object.fontFamily === 'string' ? object.fontFamily : '';
      if (!TEXT_TYPES.has(type) || !family) return object;
      const font = fromObject(object) || byFamily.get(family);
      if (!font) return object;
      return {
        ...object,
        data: {
          ...(object.data || {}),
          fontUrl: font.url,
          fontMetadata: font,
          fontDisplayName: font.displayName || font.fontFamily,
        },
      };
    });
    nextState[sideId] = { ...state, objects };
  }

  return {
    canvasState: nextState,
    customFonts: mergeCustomFonts(
      knownFonts,
      extractCustomFontsFromCanvasState(nextState)
    ),
  };
}
