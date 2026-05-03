/**
 * Shared font configuration — single source of truth for system fonts.
 * Used by both the UI (TextStylePanel) and SVG export (canvas-svg-export).
 *
 * Fonts WITH a localFontPath are converted to SVG <path> via opentype.js.
 * Fonts with null use the 300 DPI PNG fallback during export.
 */

export interface SystemFontConfig {
  fontFamily: string;
  /** Local TTF path in /public/fonts/ for opentype.js, or null for PNG-only. */
  localFontPath: string | null;
}

export const SYSTEM_FONTS: SystemFontConfig[] = [
  { fontFamily: 'Freshman', localFontPath: '/fonts/Freshman.ttf' },
  { fontFamily: 'Arial', localFontPath: '/fonts/Arimo-Regular.ttf' },
  { fontFamily: 'Times New Roman', localFontPath: '/fonts/Tinos-Regular.ttf' },
  { fontFamily: 'Courier New', localFontPath: '/fonts/Cousine-Regular.ttf' },
  { fontFamily: 'Georgia', localFontPath: '/fonts/Tinos-Regular.ttf' },
  { fontFamily: 'Verdana', localFontPath: '/fonts/Arimo-Regular.ttf' },
  { fontFamily: 'Helvetica', localFontPath: '/fonts/Arimo-Regular.ttf' },
  { fontFamily: 'Comic Sans MS', localFontPath: null },
  { fontFamily: 'Impact', localFontPath: null },
  { fontFamily: 'Trebuchet MS', localFontPath: null },
  { fontFamily: 'Palatino', localFontPath: null },
];

/** Font family names for UI dropdowns */
export const SYSTEM_FONT_NAMES: string[] = SYSTEM_FONTS.map((f) => f.fontFamily);

/** fontFamily → local TTF path (or null). Used by canvas-svg-export loadFont(). */
export const SYSTEM_FONT_PATH_MAP: Record<string, string | null> =
  Object.fromEntries(SYSTEM_FONTS.map((f) => [f.fontFamily, f.localFontPath]));
