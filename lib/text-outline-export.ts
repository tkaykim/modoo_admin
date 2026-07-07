/**
 * Text → vector-outline SVG export.
 *
 * Why this exists (관리자 버그신고 UID 1586, 2026-07-07):
 * 디자이너가 주문 시안을 다운로드해 Illustrator(Windows)에서 열면
 *   ① 고객 폰트를 별도 설치해야 하고, 설치해도 "특정 대체 글리프를 사용할 수 없습니다" 오류
 *   ② 곡률(curveIntensity)·italic 이 무시돼 캔버스를 보고 손으로 재현해야 함
 * 이 있었다. 근본 원인은 기존 SVG export(getTextSvgFromCanvasState / server-svg-export)가
 * 글자를 `<text font-family=...>` 로 뽑아 **폰트 파일에 의존**하고, 곡률을 평면 텍스트로
 * 떨어뜨렸기 때문이다.
 *
 * 여기서는 opentype.js 로 **모든 글자를 벡터 아웃라인(`<path>`)으로 변환**한다.
 * 곡률·italic·테두리(stroke)를 전부 도형(geometry)에 구워 넣으므로,
 * 폰트 설치 없이 Illustrator/일러스트에서 캔버스와 동일하게 열린다.
 *
 * 곡률 배치 수식은 lib/curvedText.ts 의 _renderCurved 와 정확히 동일하게 맞춘다
 * (textAlign=center, textBaseline=middle, 중심 원점). 이 둘이 어긋나면 다운로드본이
 * 캔버스와 달라지므로 절대 임의로 바꾸지 말 것.
 */
import * as opentype from 'opentype.js';
import { SYSTEM_FONT_PATH_MAP } from './fontConfig';
import { escapeXml } from './downloadUtils';
import type { CanvasState, CustomFont } from '@/types/types';

// opentype.Font 는 url 단위로 캐시(같은 폰트 재fetch 방지). null = 로드 실패(아웃라인 불가).
const fontCache = new Map<string, opentype.Font | null>();

export interface OutlineTextObject {
  type?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontStyle?: string;
  fontWeight?: string | number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  paintFirst?: string;
  charSpacing?: number;
  curveIntensity?: number;
  textAlign?: string;
  lineHeight?: number;
  left?: number;
  top?: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
  originX?: string;
  originY?: string;
}

export interface OutlineSvgResult {
  /** 아웃라인 SVG 문자열. 텍스트 객체가 없으면 null. */
  svg: string | null;
  /** 대상 텍스트 객체 수. */
  textCount: number;
  /** 실제로 아웃라인(path)으로 변환된 객체 수. */
  outlinedCount: number;
  /**
   * 폰트 파일을 구하지 못해 아웃라인 대신 `<text>` 폴백으로 떨어진 폰트명들(중복 제거).
   * UI 에서 "이 폰트는 설치가 필요합니다" 경고에 사용.
   */
  fallbackFonts: string[];
}

const TEXT_TYPES = new Set(['i-text', 'itext', 'text', 'textbox', 'curvedtext']);

/** 브라우저 canvas 가 합성(faux) italic 을 그릴 때의 근사 기울기(도). */
const SYNTHETIC_ITALIC_DEG = 14;

function isTextType(type?: string): boolean {
  return TEXT_TYPES.has((type || '').toLowerCase());
}

/**
 * 이 폰트가 텍스트의 모든 (공백 아닌) 글자를 커버하는지.
 * 하나라도 .notdef(글리프 index 0)면 false → 아웃라인하면 □ 박스가 되므로 폴백해야 한다.
 * (예: 한글 텍스트인데 시스템 번들 폰트가 라틴 전용인 경우)
 */
function fontCoversText(font: opentype.Font, text: string): boolean {
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (font.charToGlyphIndex(ch) === 0) return false;
  }
  return true;
}

/** fontFamily → 폰트 파일 URL. 커스텀 폰트(고객 업로드) 우선, 없으면 시스템 번들 TTF. */
function resolveFontUrl(fontFamily: string, customFonts: CustomFont[]): string | null {
  const custom = customFonts.find((f) => f.fontFamily === fontFamily);
  if (custom?.url) return custom.url;
  return SYSTEM_FONT_PATH_MAP[fontFamily] ?? null;
}

/** 폰트 파일을 받아 opentype.Font 로 파싱(캐시). 실패 시 null. 브라우저 전용(fetch). */
export async function loadOutlineFont(
  fontFamily: string,
  customFonts: CustomFont[],
): Promise<opentype.Font | null> {
  const url = resolveFontUrl(fontFamily, customFonts);
  if (!url) return null;
  if (fontCache.has(url)) return fontCache.get(url) ?? null;

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const font = opentype.parse(buf);
    fontCache.set(url, font);
    return font;
  } catch (error) {
    console.warn(`[text-outline] '${fontFamily}' 폰트 아웃라인 불가 (${url}):`, error);
    fontCache.set(url, null);
    return null;
  }
}

/**
 * 한 글자를 로컬 원점(왼쪽 끝 x=0, baseline y=0)에 그린 SVG path `d`.
 * 실제 배치는 호출부에서 transform 으로 처리한다.
 */
function glyphPathData(font: opentype.Font, char: string, fontSize: number): string {
  // 공백은 path 가 비어 있음 → 빈 문자열
  return font.getPath(char, 0, 0, fontSize).toPathData(2);
}

interface PlacedGlyph {
  d: string;
  /** 이 글자에 적용할 SVG transform (path 기준, 왼쪽·baseline 원점). */
  transform: string;
}

/** 곡선 배치 — lib/curvedText.ts _renderCurved 와 동일 수식. */
function layoutCurved(
  font: opentype.Font,
  obj: OutlineTextObject,
  chars: string[],
  advances: number[],
  spacing: number,
  midBaseline: number,
  italicSkew: string,
): PlacedGlyph[] {
  const fontSize = obj.fontSize ?? 40;
  const total = advances.reduce((s, w) => s + w, 0) + spacing * Math.max(0, chars.length - 1);
  const intensity = (obj.curveIntensity ?? 0) / 100;
  const arcAngle = 2 * Math.PI * Math.abs(intensity);
  const radius = total / arcAngle;
  const startAngle = intensity < 0 ? -Math.PI / 2 - arcAngle / 2 : Math.PI / 2 - arcAngle / 2;
  const sagitta = radius * (1 - Math.cos(arcAngle / 2));
  const offsetY = intensity < 0 ? radius - sagitta / 2 : -radius + sagitta / 2;

  const glyphs: PlacedGlyph[] = [];
  let cursor = 0;
  chars.forEach((char, i) => {
    const charW = advances[i];
    const arcPos = cursor + charW / 2;
    const t = arcPos / total;
    const angle = startAngle + arcAngle * t;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius + offsetY;
    const rotDeg = (intensity < 0 ? angle + Math.PI / 2 : angle - Math.PI / 2) * (180 / Math.PI);
    cursor += charW + spacing;

    const d = glyphPathData(font, char, fontSize);
    if (!d) return; // 공백 등
    // 글자를 rotation 원점(글자 중심)에 오도록: 왼쪽·baseline 원점에서
    // (-charW/2, midBaseline) 만큼 이동한 뒤, translate(x,y) rotate 로 배치.
    const transform =
      `translate(${x.toFixed(2)}, ${y.toFixed(2)}) rotate(${rotDeg.toFixed(2)}) ` +
      `translate(${(-charW / 2).toFixed(2)}, ${midBaseline.toFixed(2)})${italicSkew}`;
    glyphs.push({ d, transform });
  });
  return glyphs;
}

/** 직선(곡률 0) 배치 — CurvedText(center 원점) / 일반 i-text(textAlign·originX·다줄) 모두 처리. */
function layoutStraight(
  font: opentype.Font,
  obj: OutlineTextObject,
  spacing: number,
  asc: number,
  midBaseline: number,
  italicSkew: string,
): PlacedGlyph[] {
  const fontSize = obj.fontSize ?? 40;
  const text = obj.text ?? '';
  const isCurvedType = (obj.type || '').toLowerCase() === 'curvedtext';

  const advanceOf = (ch: string) => font.getAdvanceWidth(ch, fontSize);
  const lineWidth = (line: string) => {
    const cs = [...line];
    return cs.reduce((s, c) => s + advanceOf(c), 0) + spacing * Math.max(0, cs.length - 1);
  };

  const glyphs: PlacedGlyph[] = [];

  if (isCurvedType) {
    // CurvedText 직선 모드: textAlign=center, baseline=middle, 중심 원점(한 줄).
    const chars = [...text];
    const total = lineWidth(text);
    let penX = -total / 2;
    chars.forEach((char) => {
      const w = advanceOf(char);
      const d = glyphPathData(font, char, fontSize);
      if (d) {
        glyphs.push({
          d,
          transform: `translate(${penX.toFixed(2)}, ${midBaseline.toFixed(2)})${italicSkew}`,
        });
      }
      penX += w + spacing;
    });
    return glyphs;
  }

  // 일반 i-text: fabric 관례(top-left 원점, baseline = top + ascent), 다줄 + textAlign.
  const lines = text.split('\n');
  const lh = fontSize * (obj.lineHeight ?? 1.16);
  const align = (obj.textAlign ?? 'left').toLowerCase();
  const originX = (obj.originX ?? 'left').toLowerCase();
  const originY = (obj.originY ?? 'top').toLowerCase();
  const widths = lines.map(lineWidth);
  const blockWidth = Math.max(0, ...widths);
  const blockHeight = lh * lines.length;

  const baseX = originX === 'center' ? -blockWidth / 2 : originX === 'right' ? -blockWidth : 0;
  const baseYtop = originY === 'center' ? -blockHeight / 2 : originY === 'bottom' ? -blockHeight : 0;

  lines.forEach((line, li) => {
    const lw = widths[li];
    const ax = align === 'center' ? (blockWidth - lw) / 2 : align === 'right' ? blockWidth - lw : 0;
    let penX = baseX + ax;
    const baseline = baseYtop + li * lh + asc;
    [...line].forEach((char) => {
      const w = advanceOf(char);
      const d = glyphPathData(font, char, fontSize);
      if (d) {
        glyphs.push({
          d,
          transform: `translate(${penX.toFixed(2)}, ${baseline.toFixed(2)})${italicSkew}`,
        });
      }
      penX += w + spacing;
    });
  });
  return glyphs;
}

/** 객체 단위 transform: translate(left,top) rotate(angle) scale(sx,sy) — 기존 export 와 동일. */
function objectTransform(obj: OutlineTextObject): string {
  const left = obj.left ?? 0;
  const top = obj.top ?? 0;
  const angle = obj.angle ?? 0;
  const sx = obj.scaleX ?? 1;
  const sy = obj.scaleY ?? 1;
  let t = `translate(${left}, ${top})`;
  if (angle !== 0) t += ` rotate(${angle})`;
  if (sx !== 1 || sy !== 1) t += ` scale(${sx}, ${sy})`;
  return t;
}

/** 폰트를 못 구했을 때의 `<text>` 폴백(기존 방식) — 곡률은 표현 못하지만 텍스트는 보존. */
function fallbackTextElement(obj: OutlineTextObject): string {
  const text = obj.text ?? '';
  const fontFamily = obj.fontFamily ?? 'Arial';
  const fontSize = obj.fontSize ?? 16;
  const fill = obj.fill ?? '#000000';
  const fontWeight = obj.fontWeight != null ? String(obj.fontWeight) : 'normal';
  const fontStyle = obj.fontStyle ?? 'normal';
  const align = (obj.textAlign ?? 'left').toLowerCase();
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const stroke = obj.stroke ?? '';
  const strokeWidth = typeof obj.strokeWidth === 'number' ? obj.strokeWidth : 0;
  const strokeAttrs =
    stroke && strokeWidth > 0
      ? ` stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" ` +
        `paint-order="${obj.paintFirst === 'stroke' ? 'stroke fill' : 'fill stroke'}" stroke-linejoin="round"`
      : '';

  const lines = text.split('\n');
  const inner =
    lines.length > 1
      ? lines
          .map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : fontSize * 1.2}">${escapeXml(line)}</tspan>`)
          .join('')
      : escapeXml(text);

  return (
    `  <text x="0" y="0" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" ` +
    `fill="${escapeXml(fill)}" font-weight="${escapeXml(fontWeight)}" font-style="${escapeXml(fontStyle)}"` +
    `${strokeAttrs} text-anchor="${anchor}" transform="${objectTransform(obj)}">${inner}</text>\n`
  );
}

/** 한 텍스트 객체 → 아웃라인 `<g>` (또는 폰트 없으면 `<text>` 폴백). */
async function outlineOneObject(
  obj: OutlineTextObject,
  customFonts: CustomFont[],
): Promise<{ markup: string; outlined: boolean; fallbackFont?: string }> {
  const fontFamily = obj.fontFamily ?? 'Arial';
  const font = await loadOutlineFont(fontFamily, customFonts);
  if (!font) {
    return { markup: fallbackTextElement(obj), outlined: false, fallbackFont: fontFamily };
  }

  // 폰트가 이 텍스트의 글자를 모두 담고 있지 않으면(예: 라틴 폰트 + 한글) 아웃라인 시
  // .notdef □ 박스가 되므로 `<text>` 폴백으로 떨어뜨리고 경고 대상에 넣는다.
  if (!fontCoversText(font, obj.text ?? '')) {
    return { markup: fallbackTextElement(obj), outlined: false, fallbackFont: fontFamily };
  }

  const fontSize = obj.fontSize ?? 40;
  const scale = fontSize / font.unitsPerEm;
  const asc = font.ascender * scale;
  const desc = font.descender * scale; // 음수
  const midBaseline = (asc + desc) / 2; // baseline=middle 보정(SVG y-down)
  const spacing = ((obj.charSpacing ?? 0) / 1000) * fontSize;

  // 합성 italic: 시스템 번들 폰트(모두 Regular)에서만 skew 로 흉내(캔버스 동작과 일치).
  // 커스텀 폰트는 파일 자체가 스타일을 담고 있다고 보고 skew 하지 않는다.
  const isSystemFont = fontFamily in SYSTEM_FONT_PATH_MAP && !customFonts.some((f) => f.fontFamily === fontFamily);
  const needsSyntheticItalic = (obj.fontStyle ?? '').toLowerCase() === 'italic' && isSystemFont;
  const italicSkew = needsSyntheticItalic ? ` skewX(${-SYNTHETIC_ITALIC_DEG})` : '';

  const isCurved = (obj.type || '').toLowerCase() === 'curvedtext' && Math.abs(obj.curveIntensity ?? 0) >= 1;

  let glyphs: PlacedGlyph[];
  if (isCurved) {
    const chars = [...(obj.text ?? '')];
    const advances = chars.map((c) => font.getAdvanceWidth(c, fontSize));
    glyphs = layoutCurved(font, obj, chars, advances, spacing, midBaseline, italicSkew);
  } else {
    glyphs = layoutStraight(font, obj, spacing, asc, midBaseline, italicSkew);
  }

  if (glyphs.length === 0) {
    // 텍스트가 공백뿐 등 — path 가 없으면 폴백
    return { markup: fallbackTextElement(obj), outlined: false, fallbackFont: fontFamily };
  }

  const fill = obj.fill ?? '#000000';
  const stroke = obj.stroke ?? '';
  const strokeWidth = typeof obj.strokeWidth === 'number' ? obj.strokeWidth : 0;
  const hasStroke = !!stroke && strokeWidth > 0;
  const strokeAttrs = hasStroke
    ? ` stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" ` +
      `paint-order="${obj.paintFirst === 'stroke' ? 'stroke fill' : 'fill stroke'}" stroke-linejoin="round"`
    : '';

  const paths = glyphs
    .map((g) => `    <path d="${g.d}" transform="${g.transform}" />`)
    .join('\n');

  const markup =
    `  <g transform="${objectTransform(obj)}" fill="${escapeXml(fill)}"${strokeAttrs}>\n` +
    `${paths}\n` +
    `  </g>\n`;

  return { markup, outlined: true };
}

/**
 * 캔버스 상태(한 면) → 텍스트 전부를 벡터 아웃라인으로 구운 standalone SVG.
 * 폰트 설치 없이 Illustrator 에서 곡률·italic·테두리까지 그대로 열린다.
 */
export async function buildOutlinedTextSvg(
  canvasState: CanvasState | null,
  sideId: string,
  options: { customFonts?: CustomFont[] } = {},
): Promise<OutlineSvgResult> {
  const customFonts = options.customFonts ?? [];
  const objects = Array.isArray(canvasState?.objects) ? canvasState!.objects : [];
  const textObjects = objects.filter((o) => o && isTextType((o as OutlineTextObject).type)) as OutlineTextObject[];

  if (textObjects.length === 0) {
    return { svg: null, textCount: 0, outlinedCount: 0, fallbackFonts: [] };
  }

  const canvasWidth = 800;
  const canvasHeight = 600;
  const results = await Promise.all(textObjects.map((obj) => outlineOneObject(obj, customFonts)));

  let outlinedCount = 0;
  const fallbackFonts = new Set<string>();
  const body = results
    .map((r) => {
      if (r.outlined) outlinedCount += 1;
      else if (r.fallbackFont) fallbackFonts.add(r.fallbackFont);
      return r.markup;
    })
    .join('');

  const svg =
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">\n` +
    `  <title>${escapeXml(sideId)} text outlines</title>\n` +
    `  <metadata>모두의유니폼 — 텍스트 아웃라인(폰트 불필요). 곡률·italic·테두리 벡터화. side=${escapeXml(sideId)}</metadata>\n` +
    `  <g id="text-outlines">\n${body}  </g>\n</svg>`;

  return { svg, textCount: textObjects.length, outlinedCount, fallbackFonts: [...fallbackFonts] };
}
