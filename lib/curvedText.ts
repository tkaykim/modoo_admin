import * as fabric from 'fabric';

/**
 * CurvedText - Custom canvas object that renders text along a curve
 * Uses rotation-based positioning to place characters along an arc
 *
 * curveIntensity: -100 to 100
 * - Negative: curves upward
 * - Zero: straight
 * - Positive: curves downward
 */

interface CurvedTextOptions {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  originX?: fabric.TOriginX;
  originY?: fabric.TOriginY;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  charSpacing?: number;
  curveIntensity?: number;
  opacity?: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
  // Flag to indicate this is being restored from saved state
  _fromSavedState?: boolean;
}

// Track which fonts have been loaded via FontFace API
const loadedFontFaces = new Set<string>();

/**
 * Load a custom font using the FontFace API
 * @param fontFamily - The font family name to register
 * @param fontUrl - URL to the font file (TTF, OTF, WOFF)
 * @returns Promise that resolves when the font is loaded
 */
async function loadFontFace(fontFamily: string, fontUrl: string): Promise<void> {
  if (typeof document === 'undefined') return;

  const fontKey = `${fontFamily}:${fontUrl}`;
  if (loadedFontFaces.has(fontKey)) {
    return;
  }

  try {
    // Check if font is already available
    if (document.fonts.check(`12px "${fontFamily}"`)) {
      loadedFontFaces.add(fontKey);
      return;
    }

    // Create and load the FontFace
    const fontFace = new FontFace(fontFamily, `url(${fontUrl})`, {
      style: 'normal',
      weight: '400',
    });

    const loadedFont = await fontFace.load();
    document.fonts.add(loadedFont);
    loadedFontFaces.add(fontKey);
    console.log(`[FontFace] Loaded font: ${fontFamily}`);
  } catch (error) {
    console.warn(`[FontFace] Failed to load font ${fontFamily}:`, error);
  }
}

/**
 * Load a custom font for use with CurvedText and regular text
 */
export async function loadCustomFont(fontFamily: string, fontUrl: string): Promise<void> {
  await loadFontFace(fontFamily, fontUrl);
}

/**
 * Load multiple custom fonts
 * @param fonts - Array of { fontFamily, url } objects
 */
export async function loadCustomFonts(fonts: Array<{ fontFamily: string; url: string }>): Promise<void> {
  const loadPromises = fonts.map(async (font) => {
    try {
      await loadCustomFont(font.fontFamily, font.url);
    } catch {
      // Silently continue on font load failure
    }
  });

  await Promise.all(loadPromises);
}

/**
 * Check if a custom font is already loaded
 */
export function isFontLoaded(fontFamily: string): boolean {
  if (typeof document === 'undefined') return false;
  return document.fonts.check(`12px "${fontFamily}"`);
}

export class CurvedText extends fabric.FabricObject {
  static type = 'CurvedText';

  // Text properties
  text: string = 'Text';
  fontSize: number = 40;
  fontFamily: string = 'Arial';
  fontWeight: string = 'normal';
  fontStyle: string = 'normal';
  fill: string = '#000000';
  stroke: string = '';
  strokeWidth: number = 0;
  charSpacing: number = 0;

  // Curve intensity: -100 to 100
  curveIntensity: number = 0;

  // For editing
  private _isEditing: boolean = false;
  private _editingTextarea: HTMLTextAreaElement | null = null;

  // Flag to skip bounds recalculation when restoring from saved state
  private _fromSavedState: boolean = false;

  constructor(options?: CurvedTextOptions) {
    super(options);

    this.text = options?.text ?? 'Text';
    this.fontSize = options?.fontSize ?? 40;
    this.fontFamily = options?.fontFamily ?? 'Arial';
    this.fontWeight = options?.fontWeight ?? 'normal';
    this.fontStyle = options?.fontStyle ?? 'normal';
    this.fill = options?.fill ?? '#000000';
    this.stroke = options?.stroke ?? '';
    this.strokeWidth = options?.strokeWidth ?? 0;
    this.charSpacing = options?.charSpacing ?? 0;
    this.curveIntensity = options?.curveIntensity ?? 0;

    // Track if this is being restored from saved state
    this._fromSavedState = options?._fromSavedState ?? false;

    // Set default dimensions if not provided
    this.width = options?.width ?? 200;
    this.height = options?.height ?? this.fontSize * 1.2;

    // Calculate initial bounds if not from saved state
    if (!this._fromSavedState) {
      this._updateBoundsForText();
      this._updateBoundsForCurve();
    }
  }

  /**
   * Update bounding box based on curve intensity
   */
  private _updateBoundsForCurve(): void {
    if (this.curveIntensity === 0) {
      this.height = this.fontSize * 1.2;
      return;
    }

    const bounds = this._calculateCurvedBounds();
    if (bounds) {
      this.width = bounds.width;
      this.height = bounds.height;
    } else {
      // Fallback estimation
      const absIntensity = Math.abs(this.curveIntensity) / 100;
      const baseHeight = this.fontSize * 1.2;
      if (absIntensity > 0.3) {
        const targetHeight = baseHeight + (this.width! - baseHeight) * absIntensity;
        this.height = Math.max(targetHeight, baseHeight);
      } else {
        this.height = baseHeight;
      }
    }
  }

  /**
   * Calculate bounds for curved text rendering
   */
  private _calculateCurvedBounds(): { width: number; height: number } | null {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.font = this._buildFont();

    const chars = this.text.split('');
    const charWidths = chars.map(c => ctx.measureText(c).width);
    const spacing = (this.charSpacing || 0) / 1000 * this.fontSize;
    const totalTextWidth = charWidths.reduce((sum, w) => sum + w, 0) + spacing * Math.max(0, chars.length - 1);

    const intensity = this.curveIntensity / 100;
    const absIntensity = Math.abs(intensity);
    const arcAngle = 2 * Math.PI * absIntensity;

    if (arcAngle < 0.01) return null;

    const radius = totalTextWidth / arcAngle;
    const startAngle = intensity < 0
      ? -Math.PI / 2 - arcAngle / 2
      : Math.PI / 2 - arcAngle / 2;

    const sagitta = radius * (1 - Math.cos(arcAngle / 2));
    const offsetY = intensity < 0
      ? radius - sagitta / 2
      : -radius + sagitta / 2;

    // Calculate bounds by tracking character positions
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    let currentArcPos = 0;
    const charHeight = this.fontSize;

    chars.forEach((_, i) => {
      const charW = charWidths[i];
      const charArcPos = currentArcPos + charW / 2;

      const t = charArcPos / totalTextWidth;
      const angle = startAngle + arcAngle * t;

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius + offsetY;

      // Use diagonal of character box to account for rotation
      const halfDiag = Math.sqrt((charW / 2) ** 2 + (charHeight / 2) ** 2);
      minX = Math.min(minX, x - halfDiag);
      minY = Math.min(minY, y - halfDiag);
      maxX = Math.max(maxX, x + halfDiag);
      maxY = Math.max(maxY, y + halfDiag);

      currentArcPos += charW + spacing;
    });

    if (minX === Infinity) return null;

    // Add padding for stroke
    const strokePad = this.strokeWidth || 0;

    return {
      width: maxX - minX + strokePad * 2,
      height: maxY - minY + strokePad * 2
    };
  }

  /**
   * Main render method
   */
  _render(ctx: CanvasRenderingContext2D): void {
    if (this.curveIntensity === 0) {
      this._renderStraight(ctx);
    } else {
      this._renderCurved(ctx);
    }
  }

  /**
   * Render straight text (no curve)
   */
  private _renderStraight(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    ctx.font = this._buildFont();
    ctx.fillStyle = this.fill;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.stroke && this.strokeWidth) {
      ctx.strokeStyle = this.stroke;
      ctx.lineWidth = this.strokeWidth;
      ctx.strokeText(this.text, 0, 0);
    }
    ctx.fillText(this.text, 0, 0);

    ctx.restore();
  }

  /**
   * Render text along a curve using rotation-based positioning
   */
  private _renderCurved(ctx: CanvasRenderingContext2D): void {
    const text = this.text;
    if (!text) return;

    ctx.save();

    ctx.font = this._buildFont();
    ctx.fillStyle = this.fill;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.stroke && this.strokeWidth) {
      ctx.strokeStyle = this.stroke;
      ctx.lineWidth = this.strokeWidth;
    }

    // Measure characters
    const chars = text.split('');
    const charWidths = chars.map(c => ctx.measureText(c).width);
    const spacing = (this.charSpacing || 0) / 1000 * this.fontSize;
    const totalTextWidth = charWidths.reduce((sum, w) => sum + w, 0) + spacing * Math.max(0, chars.length - 1);

    const intensity = this.curveIntensity / 100;
    const absIntensity = Math.abs(intensity);

    const arcAngle = 2 * Math.PI * absIntensity;

    if (arcAngle < 0.01) {
      this._renderStraight(ctx);
      ctx.restore();
      return;
    }

    const radius = totalTextWidth / arcAngle;

    const startAngle = intensity < 0
      ? -Math.PI / 2 - arcAngle / 2
      : Math.PI / 2 - arcAngle / 2;

    const sagitta = radius * (1 - Math.cos(arcAngle / 2));

    const offsetY = intensity < 0
      ? radius - sagitta / 2
      : -radius + sagitta / 2;

    let currentArcPos = 0;

    chars.forEach((char, i) => {
      const charW = charWidths[i];
      const charArcPos = currentArcPos + charW / 2;

      const t = charArcPos / totalTextWidth;
      const angle = startAngle + arcAngle * t;

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius + offsetY;

      const rotation = intensity < 0
        ? angle + Math.PI / 2
        : angle - Math.PI / 2;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);

      if (this.stroke && this.strokeWidth) {
        ctx.strokeText(char, 0, 0);
      }
      ctx.fillText(char, 0, 0);

      ctx.restore();

      currentArcPos += charW + spacing;
    });

    ctx.restore();
  }

  /**
   * Build CSS font string
   */
  private _buildFont(): string {
    return `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px "${this.fontFamily}"`;
  }

  /**
   * Set curve intensity
   */
  setCurve(intensity: number): void {
    this.curveIntensity = Math.max(-100, Math.min(100, intensity));
    this._updateBoundsForCurve();
    this.dirty = true;
    this.setCoords();
    this.canvas?.requestRenderAll();
  }

  /**
   * Set text content and update bounds
   */
  setText(text: string): void {
    this.text = text;
    this._updateBoundsForText();
    this._updateBoundsForCurve();
    this.dirty = true;
    this.setCoords();
    this.canvas?.requestRenderAll();
  }

  /**
   * Update width based on text content
   */
  private _updateBoundsForText(): void {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.font = this._buildFont();
    const metrics = ctx.measureText(this.text);
    const textWidth = metrics.width;

    this.width = Math.max(textWidth, 10);
  }

  /**
   * Set font family
   */
  setFont(fontFamily: string): void {
    this.fontFamily = fontFamily;
    this._updateBoundsForText();
    this._updateBoundsForCurve();
    this.dirty = true;
    this.setCoords();
    this.canvas?.requestRenderAll();
  }

  /**
   * Set fill color
   */
  setFill(color: string): void {
    this.fill = color;
    this.dirty = true;
    this.canvas?.requestRenderAll();
  }

  /**
   * Set font weight and update bounds
   */
  setFontWeight(weight: string): void {
    this.fontWeight = weight;
    this._updateBoundsForText();
    this._updateBoundsForCurve();
    this.dirty = true;
    this.setCoords();
    this.canvas?.requestRenderAll();
  }

  /**
   * Set font style and update bounds
   */
  setFontStyle(style: string): void {
    this.fontStyle = style;
    this._updateBoundsForText();
    this._updateBoundsForCurve();
    this.dirty = true;
    this.setCoords();
    this.canvas?.requestRenderAll();
  }

  /**
   * Set font size and update bounds
   */
  setFontSize(size: number): void {
    this.fontSize = size;
    this._updateBoundsForText();
    this._updateBoundsForCurve();
    this.dirty = true;
    this.setCoords();
    this.canvas?.requestRenderAll();
  }

  /**
   * Set character spacing and update bounds
   */
  setCharSpacing(spacing: number): void {
    this.charSpacing = spacing;
    this._updateBoundsForText();
    this._updateBoundsForCurve();
    this.dirty = true;
    this.setCoords();
    this.canvas?.requestRenderAll();
  }

  /**
   * Public method to recalculate bounds after property changes
   */
  updateBounds(): void {
    this._updateBoundsForText();
    this._updateBoundsForCurve();
    this.dirty = true;
    this.setCoords();
    this.canvas?.requestRenderAll();
  }

  /**
   * Enter editing mode - show textarea overlay
   */
  enterEditing(): void {
    if (this._isEditing || !this.canvas) return;
    this._isEditing = true;

    const canvas = this.canvas as fabric.Canvas;
    const canvasEl = canvas.getElement();
    const container = canvasEl.parentElement;
    if (!container) return;

    // Get object's screen position
    const zoom = canvas.getZoom();
    const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const objCenter = this.getCenterPoint();
    const screenX = objCenter.x * zoom + vpt[4];
    const screenY = objCenter.y * zoom + vpt[5];

    // Create textarea
    const textarea = document.createElement('textarea');
    textarea.value = this.text;
    textarea.style.cssText = `
      position: absolute;
      left: ${screenX - (this.width! * zoom) / 2}px;
      top: ${screenY - (this.height! * zoom) / 2}px;
      width: ${this.width! * zoom}px;
      height: ${this.height! * zoom}px;
      font-family: ${this.fontFamily};
      font-size: ${this.fontSize * zoom}px;
      font-weight: ${this.fontWeight};
      font-style: ${this.fontStyle};
      color: ${this.fill};
      text-align: center;
      border: 2px solid #007bff;
      border-radius: 4px;
      padding: 8px;
      box-sizing: border-box;
      resize: none;
      outline: none;
      background: white;
      z-index: 1000;
    `;

    textarea.addEventListener('blur', () => this.exitEditing());
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.exitEditing();
      }
    });

    container.appendChild(textarea);
    textarea.focus();
    textarea.select();

    this._editingTextarea = textarea;
    this.dirty = true;
    canvas.requestRenderAll();
  }

  /**
   * Exit editing mode
   */
  exitEditing(): void {
    if (!this._isEditing || !this._editingTextarea) return;

    this.text = this._editingTextarea.value;
    this._editingTextarea.remove();
    this._editingTextarea = null;
    this._isEditing = false;

    this._updateBoundsForText();
    this._updateBoundsForCurve();
    this.dirty = true;
    this.setCoords();
    this.canvas?.requestRenderAll();
  }

  /**
   * Check if currently editing
   */
  get isEditing(): boolean {
    return this._isEditing;
  }

  /**
   * Generate SVG representation of the curved text
   */
  toSVG(): string {
    const left = this.left || 0;
    const top = this.top || 0;
    const angle = this.angle || 0;
    const scaleX = this.scaleX || 1;
    const scaleY = this.scaleY || 1;
    const opacity = this.opacity ?? 1;

    // Build transform attribute
    const transforms: string[] = [];
    transforms.push(`translate(${left}, ${top})`);
    if (angle !== 0) {
      transforms.push(`rotate(${angle})`);
    }
    if (scaleX !== 1 || scaleY !== 1) {
      transforms.push(`scale(${scaleX}, ${scaleY})`);
    }
    const transformAttr = transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : '';

    // For straight text, render as text element
    if (this.curveIntensity === 0) {
      const escapedText = this._escapeXml(this.text);
      return `<g${transformAttr}>
  <text x="0" y="0"
    font-family="${this._escapeXml(this.fontFamily)}"
    font-size="${this.fontSize}"
    font-weight="${this.fontWeight}"
    font-style="${this.fontStyle}"
    fill="${this._escapeXml(this.fill)}"
    text-anchor="middle"
    dominant-baseline="middle"
    opacity="${opacity}"
    ${this.stroke ? `stroke="${this._escapeXml(this.stroke)}" stroke-width="${this.strokeWidth}"` : ''}
  >${escapedText}</text>
</g>`;
    }

    // For curved text, render each character as positioned text
    return this._generateCurvedSVG(transformAttr, opacity);
  }

  /**
   * Generate SVG for curved text using positioned characters
   */
  private _generateCurvedSVG(transformAttr: string, opacity: number): string {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) {
      // Fallback to straight text
      const escapedText = this._escapeXml(this.text);
      return `<g${transformAttr}>
  <text x="0" y="0"
    font-family="${this._escapeXml(this.fontFamily)}"
    font-size="${this.fontSize}"
    fill="${this._escapeXml(this.fill)}"
    text-anchor="middle"
    dominant-baseline="middle"
    opacity="${opacity}"
  >${escapedText}</text>
</g>`;
    }

    ctx.font = this._buildFont();

    const chars = this.text.split('');
    const charWidths = chars.map(c => ctx.measureText(c).width);
    const spacing = (this.charSpacing || 0) / 1000 * this.fontSize;
    const totalTextWidth = charWidths.reduce((sum, w) => sum + w, 0) + spacing * Math.max(0, chars.length - 1);

    const intensity = this.curveIntensity / 100;
    const absIntensity = Math.abs(intensity);
    const arcAngle = 2 * Math.PI * absIntensity;

    if (arcAngle < 0.01) {
      const escapedText = this._escapeXml(this.text);
      return `<g${transformAttr}>
  <text x="0" y="0"
    font-family="${this._escapeXml(this.fontFamily)}"
    font-size="${this.fontSize}"
    fill="${this._escapeXml(this.fill)}"
    text-anchor="middle"
    dominant-baseline="middle"
    opacity="${opacity}"
  >${escapedText}</text>
</g>`;
    }

    const radius = totalTextWidth / arcAngle;
    const startAngle = intensity < 0
      ? -Math.PI / 2 - arcAngle / 2
      : Math.PI / 2 - arcAngle / 2;

    const sagitta = radius * (1 - Math.cos(arcAngle / 2));
    const offsetY = intensity < 0
      ? radius - sagitta / 2
      : -radius + sagitta / 2;

    const charElements: string[] = [];
    let currentArcPos = 0;

    chars.forEach((char, i) => {
      const charW = charWidths[i];
      const charArcPos = currentArcPos + charW / 2;

      const t = charArcPos / totalTextWidth;
      const angle = startAngle + arcAngle * t;

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius + offsetY;

      const rotation = intensity < 0
        ? (angle + Math.PI / 2) * (180 / Math.PI)
        : (angle - Math.PI / 2) * (180 / Math.PI);

      const escapedChar = this._escapeXml(char);
      charElements.push(`  <text x="${x.toFixed(2)}" y="${y.toFixed(2)}"
    font-family="${this._escapeXml(this.fontFamily)}"
    font-size="${this.fontSize}"
    font-weight="${this.fontWeight}"
    font-style="${this.fontStyle}"
    fill="${this._escapeXml(this.fill)}"
    text-anchor="middle"
    dominant-baseline="middle"
    transform="rotate(${rotation.toFixed(2)}, ${x.toFixed(2)}, ${y.toFixed(2)})"
    opacity="${opacity}"
    ${this.stroke ? `stroke="${this._escapeXml(this.stroke)}" stroke-width="${this.strokeWidth}"` : ''}
  >${escapedChar}</text>`);

      currentArcPos += charW + spacing;
    });

    return `<g${transformAttr}>
${charElements.join('\n')}
</g>`;
  }

  /**
   * Escape XML special characters
   */
  private _escapeXml(text: string): string {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Serialize
   */
  toObject(propertiesToInclude: string[] = []): Record<string, unknown> {
    return {
      ...super.toObject(propertiesToInclude),
      type: 'CurvedText',
      text: this.text,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fontWeight: this.fontWeight,
      fontStyle: this.fontStyle,
      fill: this.fill,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      charSpacing: this.charSpacing,
      curveIntensity: this.curveIntensity,
    };
  }

  /**
   * Deserialize from object
   */
  static fromObject(object: Record<string, unknown>): Promise<CurvedText> {
    const curvedText = new CurvedText({
      left: object.left as number,
      top: object.top as number,
      width: object.width as number,
      height: object.height as number,
      originX: object.originX as fabric.TOriginX,
      originY: object.originY as fabric.TOriginY,
      text: object.text as string,
      fontSize: object.fontSize as number,
      fontFamily: object.fontFamily as string,
      fontWeight: object.fontWeight as string,
      fontStyle: object.fontStyle as string,
      fill: object.fill as string,
      stroke: object.stroke as string,
      strokeWidth: object.strokeWidth as number,
      charSpacing: object.charSpacing as number,
      curveIntensity: object.curveIntensity as number,
      opacity: object.opacity as number,
      angle: object.angle as number,
      scaleX: object.scaleX as number,
      scaleY: object.scaleY as number,
    });

    // Preserve the data property (contains objectId and other metadata)
    if (object.data && typeof object.data === 'object') {
      curvedText.set('data', object.data);
    }

    return Promise.resolve(curvedText);
  }
}

// Register with fabric.js class registry
fabric.classRegistry.setClass(CurvedText);
fabric.classRegistry.setClass(CurvedText, 'CurvedText');

/**
 * Check if object is a CurvedText
 */
export function isCurvedText(obj: fabric.FabricObject): obj is CurvedText {
  return obj instanceof CurvedText;
}

/**
 * Create a CurvedText from a regular text object
 */
export function createCurvedTextFromText(
  source: fabric.IText | fabric.Text,
  curveIntensity: number = 0
): CurvedText {
  const tempCanvas = document.createElement('canvas');
  const ctx = tempCanvas.getContext('2d')!;
  const fontSize = source.fontSize || 40;
  ctx.font = `${source.fontStyle || 'normal'} ${source.fontWeight || 'normal'} ${fontSize}px "${source.fontFamily || 'Arial'}"`;
  const metrics = ctx.measureText(source.text || 'Text');
  const textWidth = metrics.width;

  const width = Math.max(textWidth, 10);

  const absIntensity = Math.abs(curveIntensity) / 100;
  const baseHeight = fontSize * 1.2;
  const curveHeight = absIntensity > 0.5 ? width : baseHeight + (width - baseHeight) * absIntensity;
  const height = Math.max(curveHeight, baseHeight);

  const sourceCenter = source.getCenterPoint();
  const scaleX = source.scaleX || 1;
  const scaleY = source.scaleY || 1;

  return new CurvedText({
    left: sourceCenter.x,
    top: sourceCenter.y,
    originX: 'center',
    originY: 'center',
    width,
    height,
    text: source.text || 'Text',
    fontSize: fontSize as number,
    fontFamily: source.fontFamily as string,
    fontWeight: source.fontWeight as string,
    fontStyle: source.fontStyle as string,
    fill: source.fill as string,
    stroke: source.stroke as string,
    strokeWidth: source.strokeWidth,
    charSpacing: source.charSpacing,
    curveIntensity,
    opacity: source.opacity,
    angle: source.angle,
    scaleX,
    scaleY,
  });
}

/**
 * Convert existing text to CurvedText on canvas
 */
export function convertToCurvedText(
  textObj: fabric.IText | fabric.Text,
  curveIntensity: number
): CurvedText {
  const canvas = textObj.canvas;
  const curved = createCurvedTextFromText(textObj, curveIntensity);

  if (canvas) {
    canvas.remove(textObj);
    canvas.add(curved);
    canvas.setActiveObject(curved);
    canvas.requestRenderAll();
  }

  return curved;
}

/**
 * Add double-click handler for editing
 */
export function setupCurvedTextEditing(canvas: fabric.Canvas): void {
  canvas.on('mouse:dblclick', (e) => {
    if (e.target && isCurvedText(e.target)) {
      e.target.enterEditing();
    }
  });
}
