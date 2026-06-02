/**
 * Font-loading guarantees for canvas rendering.
 *
 * Canvas 2D (and therefore Fabric.js) does NOT trigger lazy @font-face downloads.
 * If a text object uses a webfont (e.g. 'Freshman') that hasn't been fetched yet,
 * the canvas silently renders a fallback font and bakes it into the bitmap.
 *
 * These helpers force the relevant fonts to load (via the CSS Font Loading API)
 * BEFORE the canvas measures/renders text, so that what the customer sees, what
 * the admin sees, and what is stored all use the same, selected font.
 */

import { SYSTEM_FONTS } from './fontConfig';

const TEXT_TYPES = new Set(['i-text', 'itext', 'text', 'textbox', 'curvedtext']);

/** Extract the distinct fontFamily names used by text objects in a parsed canvas state. */
export function collectFontFamilies(objects: unknown): string[] {
  if (!Array.isArray(objects)) return [];
  const fams = new Set<string>();
  for (const o of objects) {
    if (!o || typeof o !== 'object') continue;
    const obj = o as { type?: unknown; fontFamily?: unknown };
    const t = typeof obj.type === 'string' ? obj.type.toLowerCase() : '';
    if (TEXT_TYPES.has(t) && typeof obj.fontFamily === 'string' && obj.fontFamily.trim()) {
      fams.add(obj.fontFamily);
    }
  }
  return Array.from(fams);
}

/**
 * Guarantee the given font families are fully loaded into document.fonts.
 * Resolves once every requested family is loaded (or failed) and the font set is ready.
 * Safe to call with junk / empty input.
 */
export async function ensureFontsLoaded(families: Array<string | null | undefined>): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const uniq = Array.from(
    new Set(
      families.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    )
  );
  if (uniq.length > 0) {
    await Promise.all(
      uniq.map((fam) =>
        // The size in the shorthand is irrelevant to which FontFace gets fetched;
        // load() pulls the full face regardless. Swallow per-font errors so one
        // missing font never blocks the rest.
        document.fonts.load(`16px "${fam}"`).catch(() => [])
      )
    );
  }
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
}

/**
 * Eagerly load every bundled system font (those backed by a local TTF) so the
 * TTF is already cached by the time any canvas renders. Currently the only true
 * webfont is 'Freshman'; the OS-native families resolve instantly.
 */
export async function preloadSystemFonts(): Promise<void> {
  const families = SYSTEM_FONTS.filter((f) => f.localFontPath).map((f) => f.fontFamily);
  await ensureFontsLoaded(families);
}
