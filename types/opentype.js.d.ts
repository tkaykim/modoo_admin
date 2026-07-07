/**
 * Minimal ambient declaration for opentype.js — only the surface we use in
 * lib/text-outline-export.ts (glyph → SVG path outlining). opentype.js ships no
 * types and @types/opentype.js is not installed, so we declare just what we call.
 */
declare module 'opentype.js' {
  export interface Path {
    /** SVG path `d` string. `decimalPlaces` controls coordinate precision. */
    toPathData(decimalPlaces?: number): string;
  }

  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    /** Outline for `text`, baseline at (x, y), rendered at `fontSize` px. */
    getPath(text: string, x: number, y: number, fontSize: number): Path;
    /** Horizontal advance width of `text` at `fontSize` px. */
    getAdvanceWidth(text: string, fontSize: number): number;
    /** Glyph index for a character. Returns 0 (.notdef) when the font lacks it. */
    charToGlyphIndex(char: string): number;
  }

  /** Parse an in-memory font file (TTF/OTF/WOFF). Throws on unsupported data. */
  export function parse(buffer: ArrayBuffer): Font;
}
