'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase-client';
import { OrderItem, Product, ProductSide, ObjectDimensions, CanvasState, CustomFont } from '@/types/types';
import { ChevronLeft, Palette, Ruler, Grid3x3, Download, Package, ZoomIn, ZoomOut, RotateCcw, Pencil, Save } from 'lucide-react';
import SingleSideCanvas from './canvas/SingleSideCanvas';
import { Canvas as FabricCanvas, Point as FabricPoint } from 'fabric';

interface OrderItemCanvasProps {
  orderItem: OrderItem;
  onBack: () => void;
}

type ImageUrlEntry = { url: string; path?: string; uploadedAt?: string };
type ImageUrlsBySide = Record<string, ImageUrlEntry[]>;
type TextSvgObjectUrlsBySide = Record<string, Record<string, string>>;

const parseCanvasState = (value: unknown): CanvasState | null => {
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

const normalizeColorToHex = (value: string): string | null => {
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

const escapeXml = (value: string): string => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const getTextSvgFromCanvasState = (canvasState: CanvasState, sideId: string): string | null => {
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
    `<svg xmlns=\"http://www.w3.org/2000/svg\"\n` +
    `     xmlns:xlink=\"http://www.w3.org/1999/xlink\"\n` +
    `     width=\"${canvasWidth}\"\n` +
    `     height=\"${canvasHeight}\"\n` +
    `     viewBox=\"0 0 ${canvasWidth} ${canvasHeight}\">\n` +
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
    const dataAttrs = printMethod ? ` data-print-method=\"${escapeXml(printMethod)}\"` : '';

    svgContent += `    <text\n` +
      `      id=\"text-${escapeXml(sideId)}-${index}\"\n` +
      `      x=\"0\"\n` +
      `      y=\"0\"\n` +
      `      font-family=\"${escapeXml(fontFamily)}\"\n` +
      `      font-size=\"${fontSize}\"\n` +
      `      fill=\"${escapeXml(fill)}\"\n` +
      `      font-weight=\"${escapeXml(fontWeight)}\"\n` +
      `      font-style=\"${escapeXml(fontStyle)}\"\n` +
      `      text-anchor=\"${textAnchor}\"\n` +
      `      transform=\"${transform}\"${dataAttrs}>`;

    const lines = text.split('\n');
    if (lines.length > 1) {
      lines.forEach((line, lineIndex) => {
        const dy = lineIndex === 0 ? 0 : fontSize * 1.2;
        svgContent += `\n      <tspan x=\"0\" dy=\"${dy}\">${escapeXml(line)}</tspan>`;
      });
      svgContent += '\n    </text>\n';
    } else {
      svgContent += `${escapeXml(text)}</text>\n`;
    }
  });

  svgContent += '  </g>\n</svg>';
  return svgContent;
};

const getFileExtensionFromName = (name?: string | null) => {
  if (!name) return null;
  const sanitized = name.split('?')[0].split('#')[0];
  const parts = sanitized.split('.');
  if (parts.length < 2) return null;
  const ext = parts.pop();
  if (!ext) return null;
  return ext.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const getFileExtensionFromUrl = (url?: string | null) => {
  if (!url) return null;
  const sanitized = url.split('?')[0].split('#')[0];
  const lastSegment = sanitized.split('/').pop() || '';
  return getFileExtensionFromName(lastSegment);
};

const getFileExtensionFromType = (fileType?: string | null) => {
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

const buildFilename = (base: string, extension?: string | null) => {
  if (!extension) return base;
  return `${base}.${extension}`;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parseJsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('Error parsing JSON value:', error);
    return null;
  }
};

const coerceImageUrlsBySide = (value: unknown): ImageUrlsBySide => {
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

const coerceTextSvgExports = (value: unknown): Record<string, unknown> => {
  const parsed = parseJsonValue(value);
  if (!isPlainRecord(parsed)) return {};
  return parsed;
};

const coerceTextSvgObjectUrlsBySide = (value: unknown): TextSvgObjectUrlsBySide => {
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

const sanitizeFilenameSegment = (value: string) => value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);

const coerceCustomFonts = (value: unknown): CustomFont[] => {
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function OrderItemCanvas({ orderItem, onBack }: OrderItemCanvasProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [dimensionsBySide, setDimensionsBySide] = useState<Record<string, ObjectDimensions[]>>({});
  const [productColors, setProductColors] = useState<Array<{ name: string; hex: string; color_code?: string }>>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  // Editor mode & zoom state
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [zoomLevels, setZoomLevels] = useState<Record<string, number>>({});
  const canvasRefs = useRef<Record<string, FabricCanvas>>({});

  const imageUrlsBySide = useMemo(() => coerceImageUrlsBySide(orderItem.image_urls), [orderItem.image_urls]);
  const customFonts = useMemo(() => coerceCustomFonts(orderItem.custom_fonts), [orderItem.custom_fonts]);

  const textSvgExports = useMemo(() => coerceTextSvgExports(orderItem.text_svg_exports), [orderItem.text_svg_exports]);
  const textSvgSideUrls = useMemo(() => {
    const result: Record<string, string> = {};
    Object.entries(textSvgExports).forEach(([sideId, value]) => {
      if (sideId === '__objects') return;
      if (typeof value !== 'string' || !value) return;
      result[sideId] = value;
    });
    return result;
  }, [textSvgExports]);
  const textSvgObjectUrlsBySide = useMemo(() => {
    return coerceTextSvgObjectUrlsBySide(textSvgExports.__objects);
  }, [textSvgExports]);

  const sideNameById = useMemo(() => {
    const map = new Map<string, string>();
    product?.configuration?.forEach((side) => {
      map.set(side.id, side.name);
    });
    return map;
  }, [product]);

  const getItemColorHex = () => {
    const variants = orderItem.item_options?.variants;
    if (Array.isArray(variants) && variants.length > 0 && variants[0]?.color_hex) {
      return variants[0].color_hex;
    }
    return orderItem.item_options?.color_hex || '#FFFFFF';
  };

  const getAppliedProductColorHex = useCallback(() => {
    // Order data (color_selections / variants) takes priority over canvas_state
    // because a previous admin save may have persisted a stale default into canvas_state.
    const colorSelections = orderItem.color_selections as { productColor?: string } | undefined;
    if (typeof colorSelections?.productColor === 'string' && colorSelections.productColor.startsWith('#')) {
      return colorSelections.productColor;
    }
    const variants = orderItem.item_options?.variants;
    if (Array.isArray(variants) && variants.length > 0 && variants[0]?.color_hex) {
      return variants[0].color_hex;
    }
    if (orderItem.item_options?.color_hex) {
      return orderItem.item_options.color_hex;
    }
    // Last resort: check canvas_state
    for (const canvasStateRaw of Object.values(orderItem.canvas_state || {})) {
      const canvasState = parseCanvasState(canvasStateRaw);
      if (typeof canvasState?.productColor === 'string' && canvasState.productColor.startsWith('#')) {
        return canvasState.productColor;
      }
    }
    return '#FFFFFF';
  }, [orderItem.color_selections, orderItem.canvas_state, orderItem.item_options]);

  // Store canvas refs for zoom control and serialization
  const handleCanvasRef = useCallback((canvas: FabricCanvas, sideId: string) => {
    canvasRefs.current[sideId] = canvas;
  }, []);

  const handleZoomChange = useCallback((sideId: string, zoom: number) => {
    setZoomLevels((prev) => ({ ...prev, [sideId]: zoom }));
  }, []);

  const handleZoom = useCallback((sideId: string, direction: 'in' | 'out' | 'reset') => {
    const canvas = canvasRefs.current[sideId];
    if (!canvas) return;

    const currentZoom = canvas.getZoom();
    let nextZoom: number;

    if (direction === 'reset') {
      nextZoom = 1;
      // Reset viewport pan as well
      const vpt = canvas.viewportTransform;
      if (vpt) {
        vpt[4] = 0;
        vpt[5] = 0;
      }
    } else if (direction === 'in') {
      nextZoom = Math.min(currentZoom + 0.2, 5);
    } else {
      nextZoom = Math.max(currentZoom - 0.2, 0.2);
    }

    const center = new FabricPoint(canvas.width! / 2, canvas.height! / 2);
    canvas.zoomToPoint(center, nextZoom);
    canvas.requestRenderAll();
    setZoomLevels((prev) => ({ ...prev, [sideId]: nextZoom }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!product) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const updatedCanvasState: Record<string, unknown> = { ...orderItem.canvas_state };

      for (const side of product.configuration) {
        const canvas = canvasRefs.current[side.id];
        if (!canvas) continue;

        const objects = canvas.getObjects().filter((obj) => {
          const objData = obj as { data?: { id?: string } };
          return objData.data?.id !== 'background-product-image';
        });

        const serializedObjects = objects.map((obj) => obj.toObject(['data', 'objectId', 'widthMm', 'heightMm']));

        const existingState = parseCanvasState(orderItem.canvas_state?.[side.id]);
        updatedCanvasState[side.id] = {
          ...existingState,
          objects: serializedObjects,
        };
      }

      const response = await fetch('/api/admin/orders/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderItemId: orderItem.id,
          canvasState: updatedCanvasState,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '저장에 실패했습니다.');
      }

      setIsEditMode(false);
    } catch (error) {
      console.error('Error saving canvas state:', error);
      setSaveError(error instanceof Error ? error.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }, [product, orderItem.id, orderItem.canvas_state]);

  useEffect(() => {
    fetchProduct();
  }, [orderItem.product_id]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('products')
        .select('*, manufacturers(id, name)')
        .eq('id', orderItem.product_id)
        .single();

      if (error) throw error;

      setProduct(data);

      // Fetch product colors for single-layer products (no colorOptions in config)
      const hasLayerColorOptions = data.configuration.some((side: ProductSide) =>
        side.layers?.some((layer) => Array.isArray(layer.colorOptions) && layer.colorOptions.length > 0)
      );
      if (!hasLayerColorOptions) {
        const colorId = orderItem.item_options?.variants?.[0]?.color_id ?? orderItem.item_options?.color_id;
        const appliedColorHex = getAppliedProductColorHex();
        if (appliedColorHex || colorId) {
          fetchProductColors(orderItem.product_id, colorId, appliedColorHex);
        }
      }
    } catch (error) {
      console.error('Error fetching product:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductColors = async (productId: string, colorId?: string, colorHex?: string) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('product_colors')
        .select(`
          id,
          manufacturer_color_id,
          manufacturer_colors (
            id,
            name,
            hex,
            color_code
          )
        `)
        .eq('product_id', productId)
        .eq('is_active', true);

      if (error) throw error;

      if (data && data.length > 0) {
        // Find matching color by hex or color_id
        type ManufacturerColor = { id: string; name: string; hex: string; color_code?: string };
        let matchedColor: ManufacturerColor | null = null;

        for (const item of data) {
          const mc = item.manufacturer_colors as unknown as ManufacturerColor | null;
          if (!mc) continue;

          if (colorHex && mc.hex.toLowerCase() === colorHex.toLowerCase()) {
            matchedColor = mc;
            break;
          }
          if (colorId && item.manufacturer_color_id === colorId) {
            matchedColor = mc;
            break;
          }
        }

        // If no specific match found, use the first available color
        if (!matchedColor && data[0]?.manufacturer_colors) {
          matchedColor = data[0].manufacturer_colors as unknown as ManufacturerColor;
        }

        if (matchedColor) {
          setProductColors([{
            name: matchedColor.name,
            hex: matchedColor.hex,
            color_code: matchedColor.color_code,
          }]);
        }
      }
    } catch (error) {
      console.error('Error fetching product colors:', error);
    }
  };

  const handleCanvasReady = useCallback((canvas: FabricCanvas, sideId: string, canvasScale: number) => {
    // Extract colors and dimensions from the rendered canvas
    const currentSide = product?.configuration.find(s => s.id === sideId);
    if (!currentSide) return;

    const objects = canvas.getObjects();
    const dimensions: ObjectDimensions[] = [];

    const canvasStateRaw = orderItem.canvas_state?.[sideId];
    const canvasState = parseCanvasState(canvasStateRaw);
    const stateObjects = Array.isArray(canvasState?.objects) ? canvasState.objects : [];
    const stateDimensionsById = new Map<string, { widthMm?: number; heightMm?: number; printMethod?: string }>();

    stateObjects.forEach((stateObj) => {
      if (!stateObj || typeof stateObj !== 'object') return;
      const typedObj = stateObj as {
        objectId?: string;
        widthMm?: number;
        heightMm?: number;
        printMethod?: string;
        data?: { objectId?: string; widthMm?: number; heightMm?: number; printMethod?: string };
      };
      const objectId = typedObj.data?.objectId || typedObj.objectId;
      const widthMm = typeof typedObj.widthMm === 'number'
        ? typedObj.widthMm
        : typedObj.data?.widthMm;
      const heightMm = typeof typedObj.heightMm === 'number'
        ? typedObj.heightMm
        : typedObj.data?.heightMm;
      // Check both top-level and data.printMethod (fabric objects may store it in either location)
      const printMethod = typedObj.data?.printMethod || typedObj.printMethod;
      if (objectId) {
        stateDimensionsById.set(objectId, { widthMm, heightMm, printMethod });
      }
    });

    const printArea = currentSide.printArea;

    let pixelToMmRatio = 1;
    const productWidthMm = currentSide.realLifeDimensions?.productWidthMm || 0;
    if (productWidthMm > 0 && printArea.width > 0) {
      pixelToMmRatio = productWidthMm / printArea.width;
    }

    // Track seen objectIds to prevent duplicates
    const seenObjectIds = new Set<string>();

    objects.forEach((obj) => {
      // Skip the background image
      const objData = obj as { data?: { id?: string; objectId?: string; printMethod?: string; backgroundRemovalRequested?: boolean } };
      if (objData.data?.id === 'background-product-image') {
        return;
      }

      const objectId = objData.data?.objectId;

      // Skip duplicate objects (same objectId already processed)
      if (objectId && seenObjectIds.has(objectId)) {
        return;
      }
      if (objectId) {
        seenObjectIds.add(objectId);
      }

      const stateInfo = objectId ? stateDimensionsById.get(objectId) : undefined;
      const printMethod = objData.data?.printMethod || stateInfo?.printMethod;
      const backgroundRemovalRequested = objData.data?.backgroundRemovalRequested || false;

      // Calculate dimensions
      const fill = obj.fill;
      const colors = new Set<string>();
      const addColor = (colorValue: unknown) => {
        if (typeof colorValue !== 'string') return;
        const normalized = normalizeColorToHex(colorValue);
        if (normalized) {
          colors.add(normalized);
        }
      };

      addColor(fill);
      addColor(obj.stroke);

      if (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox') {
        const textObj = obj as {
          styles?: Record<string, Record<string, { fill?: string; stroke?: string }>>;
        };
        if (textObj.styles) {
          Object.values(textObj.styles).forEach((lineStyles) => {
            Object.values(lineStyles).forEach((charStyle) => {
              addColor(charStyle.fill);
              addColor(charStyle.stroke);
            });
          });
        }
      }

      if (fill && typeof fill === 'object' && 'colorStops' in fill) {
        const gradient = fill as { colorStops?: unknown };
        const stops = gradient.colorStops;
        if (Array.isArray(stops)) {
          stops.forEach((stop) => {
            if (stop && typeof stop === 'object' && 'color' in stop) {
              addColor((stop as { color?: string }).color);
            }
          });
        } else if (stops && typeof stops === 'object') {
          Object.values(stops).forEach((stop) => {
            if (stop && typeof stop === 'object' && 'color' in stop) {
              addColor((stop as { color?: string }).color);
            }
          });
        }
      }

      let preview = '';
      try {
        const bounds = obj.getBoundingRect();
        const padding = 12;
        const left = Math.max(0, bounds.left - padding);
        const top = Math.max(0, bounds.top - padding);
        const width = bounds.width + (padding * 2);
        const height = bounds.height + (padding * 2);

        preview = canvas.toDataURL({
          format: 'png',
          quality: 0.8,
          multiplier: 1,
          left,
          top,
          width,
          height,
        });
      } catch (error) {
        console.error('Error generating object preview:', error);
      }

      // The object is scaled on the canvas, so we need to divide by canvasScale
      // to get the original size, then multiply by pixelToMmRatio
      const objWidthOnCanvas = (obj.width || 0) * (obj.scaleX || 1);
      const objHeightOnCanvas = (obj.height || 0) * (obj.scaleY || 1);

      // Convert back to original pixel size (before canvas scaling)
      const objWidthOriginal = objWidthOnCanvas / canvasScale;
      const objHeightOriginal = objHeightOnCanvas / canvasScale;

      const objWithMm = obj as unknown as {
        widthMm?: number;
        heightMm?: number;
      };

      const objectWidthMm = typeof objWithMm.widthMm === 'number'
        ? objWithMm.widthMm
        : stateInfo?.widthMm;
      const objectHeightMm = typeof objWithMm.heightMm === 'number'
        ? objWithMm.heightMm
        : stateInfo?.heightMm;

      const resolvedWidthMm = typeof objectWidthMm === 'number'
        ? objectWidthMm
        : objWidthOriginal * pixelToMmRatio;
      const resolvedHeightMm = typeof objectHeightMm === 'number'
        ? objectHeightMm
        : objHeightOriginal * pixelToMmRatio;

      let objectType = obj.type || 'Object';
      objectType = objectType.charAt(0).toUpperCase() + objectType.slice(1);

      const dimension: ObjectDimensions = {
        objectId,
        sideId,
        rawType: obj.type,
        objectType,
        widthMm: resolvedWidthMm,
        heightMm: resolvedHeightMm,
        fill: fill && typeof fill === 'string' && fill !== 'transparent' ? fill : undefined,
        colors: colors.size > 0 ? Array.from(colors) : undefined,
        preview: preview || undefined,
        printMethod: printMethod as ObjectDimensions['printMethod'],
        backgroundRemovalRequested,
      };

      // Add text content for text objects (including CurvedText)
      const objTypeLower = (obj.type || '').toLowerCase();
      if (objTypeLower === 'text' || objTypeLower === 'i-text' || objTypeLower === 'textbox' || objTypeLower === 'curvedtext') {
        const textObj = obj as {
          text?: string;
          fontFamily?: string;
          fontSize?: number;
          fontWeight?: string | number;
          fontStyle?: string;
          textAlign?: string;
          lineHeight?: number;
          curveIntensity?: number;
        };
        const text = textObj.text || '';
        dimension.text = text.substring(0, 20) + (text.length > 20 ? '...' : '');
        dimension.fontFamily = textObj.fontFamily;
        dimension.fontSize = textObj.fontSize;
        dimension.fontWeight = textObj.fontWeight;
        dimension.fontStyle = textObj.fontStyle;
        dimension.textAlign = textObj.textAlign;
        dimension.lineHeight = textObj.lineHeight;

        // CurvedText specific properties
        if (objTypeLower === 'curvedtext' && typeof textObj.curveIntensity === 'number') {
          dimension.curveIntensity = textObj.curveIntensity;
        }
      }

      dimensions.push(dimension);
    });

    setDimensionsBySide(prev => ({ ...prev, [sideId]: dimensions }));
  }, [orderItem.canvas_state, product]);

  const objectDimensions = useMemo(() => {
    return Object.values(dimensionsBySide).flat();
  }, [dimensionsBySide]);

  // Size options are now objects with label and size_code
  interface SizeOptionObj {
    label: string;
    size_code: string;
  }
  const rawSizeOptions = (product?.size_options ?? []) as (string | SizeOptionObj)[];
  const sizeOptions: SizeOptionObj[] = rawSizeOptions.map((opt) =>
    typeof opt === 'string' ? { label: opt, size_code: opt } : opt
  );

  const sizeQuantities = useMemo(() => {
    if (!sizeOptions.length) {
      return new Map<string, number>();
    }

    const map = new Map<string, number>();

    const findSizeOption = (sizeId?: string, sizeName?: string): SizeOptionObj | undefined => {
      // size_id is now size_code, size_name is label
      if (sizeId) {
        const byCode = sizeOptions.find((opt) => opt.size_code.toLowerCase() === sizeId.toLowerCase());
        if (byCode) return byCode;
      }
      if (sizeName) {
        const byLabel = sizeOptions.find((opt) => opt.label.toLowerCase() === sizeName.toLowerCase());
        if (byLabel) return byLabel;
      }
      // Fallback: return a synthetic option
      const fallbackLabel = sizeName || sizeId || 'unknown';
      return { label: fallbackLabel, size_code: sizeId || fallbackLabel };
    };

    const addQuantity = (sizeId?: string, sizeName?: string, quantity?: number) => {
      if (!quantity || quantity <= 0) return;
      const sizeOpt = findSizeOption(sizeId, sizeName);
      if (!sizeOpt) return;
      // Key by size_code to ensure uniqueness
      const key = sizeOpt.size_code;
      map.set(key, (map.get(key) || 0) + quantity);
    };

    const variants = orderItem.item_options?.variants ?? [];
    if (variants.length > 0) {
      variants.forEach((variant) => {
        addQuantity(variant.size_id, variant.size_name, variant.quantity);
      });
    } else {
      addQuantity(orderItem.item_options?.size_id, orderItem.item_options?.size_name, orderItem.quantity);
    }

    return map;
  }, [orderItem.item_options, orderItem.quantity, sizeOptions]);

  // Get selected mockup colors based on whether it's multi-layer or single-layer
  const getMockupColorInfo = useMemo(() => {
    if (!product) return [];

    const hasLayerColorOptions = product.configuration.some((side: ProductSide) =>
      side.layers?.some((layer) => Array.isArray(layer.colorOptions) && layer.colorOptions.length > 0)
    );

    if (hasLayerColorOptions) {
      // Multi-layer product: get colors from canvas_state.layerColors and match with colorCode
      const colorsMap = new Map<
        string,
        { name: string; hex: string; colorCode?: string; labelParts: Set<string> }
      >();

      const addLayerColors = (side: ProductSide, layerColors: Record<string, unknown> | undefined) => {
        if (!layerColors || !side.layers) return 0;
        let added = 0;

        Object.entries(layerColors).forEach(([layerId, colorHex]) => {
          if (typeof colorHex !== 'string' || !colorHex.startsWith('#')) return;
          const layer = side.layers?.find(l => l.id === layerId);
          if (!layer) return;

          const colorOption = layer.colorOptions?.find(
            option => option.hex.toLowerCase() === colorHex.toLowerCase()
          );

          const existing = colorsMap.get(layer.id);
          if (existing && existing.hex.toLowerCase() === colorHex.toLowerCase()) {
            existing.labelParts.add(side.name);
            return;
          }

          if (existing) {
            existing.labelParts.add(side.name);
            return;
          }

          colorsMap.set(layer.id, {
            name: layer.name,
            hex: colorHex,
            colorCode: colorOption?.colorCode,
            labelParts: new Set([side.name]),
          });
          added += 1;
        });

        return added;
      };

      product.configuration.forEach((side: ProductSide) => {
        const canvasStateRaw = orderItem.canvas_state[side.id];
        const canvasState = parseCanvasState(canvasStateRaw);
        addLayerColors(side, canvasState?.layerColors as Record<string, unknown> | undefined);
      });

      if (colorsMap.size === 0 && orderItem.color_selections) {
        product.configuration.forEach((side: ProductSide) => {
          const sideColors = orderItem.color_selections?.[side.id];
          if (sideColors && typeof sideColors === 'object') {
            addLayerColors(side, sideColors as Record<string, unknown>);
          }
        });
      }

      return Array.from(colorsMap.values()).map((entry) => ({
        name: entry.name,
        hex: entry.hex,
        colorCode: entry.colorCode,
        label: Array.from(entry.labelParts).join(', '),
      }));
    } else {
      // Single-layer product: show the applied mockup filter color
      const appliedColorHex = getAppliedProductColorHex();

      const matchedColor = appliedColorHex
        ? productColors.find(
            color => color.hex.toLowerCase() === appliedColorHex?.toLowerCase()
          )
        : undefined;

      if (matchedColor && appliedColorHex) {
        return [{
          name: matchedColor.name,
          hex: appliedColorHex,
          colorCode: matchedColor.color_code,
          label: undefined
        }];
      }

      if (appliedColorHex) {
        return [{
          name: orderItem.item_options?.variants?.[0]?.color_name || orderItem.item_options?.color_name || 'Selected Color',
          hex: appliedColorHex,
          colorCode: orderItem.item_options?.variants?.[0]?.color_code || orderItem.item_options?.color_code,
          label: undefined
        }];
      }

      return [];
    }
  }, [getAppliedProductColorHex, orderItem.canvas_state, orderItem.color_selections, product, productColors]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const downloadDataUrl = async (dataUrl: string, filename: string) => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    downloadBlob(blob, filename);
  };

  const downloadUrl = async (url: string, filename: string) => {
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

  const handleDownloadFont = async (font: CustomFont) => {
    const ext = font.format || getFileExtensionFromUrl(font.url) || 'ttf';
    const filename = buildFilename(`font-${sanitizeFilenameSegment(font.fontFamily)}`, ext);
    await downloadUrl(font.url, filename);
  };

  const isTextObjectType = (rawType?: string | null) => {
    const normalized = (rawType || '').toLowerCase();
    return normalized === 'i-text' || normalized === 'itext' || normalized === 'text' || normalized === 'textbox' || normalized === 'curvedtext';
  };

  const getPrintMethodName = (method?: string | null): string => {
    // Default to DTF if no method specified
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

  const getPrintMethodColor = (method?: string | null): string => {
    // Default to DTF color if no method specified
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

  const findTextSvgUrlForObject = (objectId: string, preferredSideId?: string | null) => {
    if (preferredSideId && textSvgObjectUrlsBySide[preferredSideId]?.[objectId]) {
      return { sideId: preferredSideId, url: textSvgObjectUrlsBySide[preferredSideId][objectId] };
    }

    for (const [sideId, objectMap] of Object.entries(textSvgObjectUrlsBySide)) {
      const url = objectMap?.[objectId];
      if (url) return { sideId, url };
    }

    return null;
  };

  const findCanvasObjectByObjectId = (objectId: string) => {
    const canvasStates = orderItem.canvas_state || {};
    for (const [sideId, sideStateRaw] of Object.entries(canvasStates)) {
      const canvasState = parseCanvasState(sideStateRaw);
      const objects = Array.isArray(canvasState?.objects) ? canvasState.objects : [];
      for (const rawObject of objects) {
        if (!rawObject || typeof rawObject !== 'object') continue;
        const typed = rawObject as {
          objectId?: string;
          src?: string;
          type?: string;
          data?: {
            objectId?: string;
            originalFileUrl?: string;
            supabaseUrl?: string;
            supabasePath?: string;
            originalFileName?: string;
            fileType?: string;
          };
        };
        const id = typed.data?.objectId || typed.objectId;
        if (id !== objectId) continue;
        return {
          sideId,
          src: typeof typed.src === 'string' ? typed.src : undefined,
          type: typed.type,
          data: typed.data,
        };
      }
    }
    return null;
  };

  const handleDownloadObjectAsset = async (dimension: ObjectDimensions, index: number) => {
    const objectId = dimension.objectId;
    const safeObjectId = objectId ? sanitizeFilenameSegment(objectId) : String(index + 1);
    const resolvedSideId = dimension.sideId;
    const rawType = (dimension.rawType || dimension.objectType || '').toLowerCase();
    const basePrefix = `order-${orderItem.id}`;

    try {
      if (objectId && isTextObjectType(rawType)) {
        const svgAsset = findTextSvgUrlForObject(objectId, resolvedSideId);
        if (svgAsset?.url) {
          const filename = `${basePrefix}-${svgAsset.sideId}-text-${safeObjectId}.svg`;
          await downloadUrl(svgAsset.url, filename);
          return;
        }

        if (resolvedSideId && textSvgSideUrls[resolvedSideId]) {
          const filename = `${basePrefix}-${resolvedSideId}-text.svg`;
          await downloadUrl(textSvgSideUrls[resolvedSideId], filename);
          return;
        }

        if (resolvedSideId) {
          const canvasState = parseCanvasState(orderItem.canvas_state?.[resolvedSideId]);
          if (canvasState?.objects?.length) {
            const filteredTextObject = canvasState.objects.find((obj) => {
              if (!obj || typeof obj !== 'object') return false;
              const type = typeof obj.type === 'string' ? obj.type.toLowerCase() : '';
              if (!isTextObjectType(type)) return false;
              const id = (obj as { objectId?: string; data?: { objectId?: string } }).data?.objectId
                || (obj as { objectId?: string }).objectId;
              return id === objectId;
            });
            if (filteredTextObject) {
              const svg = getTextSvgFromCanvasState({ ...canvasState, objects: [filteredTextObject] }, resolvedSideId);
              if (svg) {
                downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${basePrefix}-${resolvedSideId}-text-${safeObjectId}.svg`);
                return;
              }
            }
          }
        }
      }

      if (objectId && rawType === 'image') {
        const canvasObject = findCanvasObjectByObjectId(objectId);
        const sideId = resolvedSideId || canvasObject?.sideId;
        const data = canvasObject?.data;
        const trackedSideImages = sideId ? imageUrlsBySide[sideId] : undefined;

        const supabaseUrl = typeof data?.supabaseUrl === 'string' ? data.supabaseUrl : undefined;
        const supabasePath = typeof data?.supabasePath === 'string' ? data.supabasePath : undefined;
        const originalFileUrl = typeof data?.originalFileUrl === 'string' ? data.originalFileUrl : undefined;
        const src = typeof canvasObject?.src === 'string' ? canvasObject.src : undefined;

        let urlToDownload = supabaseUrl || originalFileUrl || src;
        let trackedIndex = -1;
        if (trackedSideImages?.length) {
          trackedIndex = trackedSideImages.findIndex((img) => {
            if (supabaseUrl && img.url === supabaseUrl) return true;
            if (supabasePath && img.path === supabasePath) return true;
            return false;
          });
          if (trackedIndex >= 0) {
            urlToDownload = trackedSideImages[trackedIndex].url;
          } else if (trackedSideImages.length === 1 && !supabaseUrl && !supabasePath) {
            urlToDownload = trackedSideImages[0].url;
            trackedIndex = 0;
          }
        }

        if (urlToDownload) {
          const ext = getFileExtensionFromName(data?.originalFileName)
            || getFileExtensionFromUrl(urlToDownload)
            || getFileExtensionFromType(data?.fileType)
            || 'png';
          const fileIndexSuffix = trackedIndex >= 0 ? String(trackedIndex + 1) : safeObjectId;
          const filename = buildFilename(`${basePrefix}-${sideId || 'image'}-image-${fileIndexSuffix}`, ext);
          if (urlToDownload.startsWith('data:')) {
            await downloadDataUrl(urlToDownload, filename);
          } else {
            await downloadUrl(urlToDownload, filename);
          }
          return;
        }
      }

      if (dimension.preview && dimension.preview.startsWith('data:')) {
        await downloadDataUrl(dimension.preview, buildFilename(`${basePrefix}-object-${safeObjectId}`, 'png'));
        return;
      }

      if (objectId) {
        const asset = findCanvasObjectByObjectId(objectId);
        const url = asset?.src;
        if (url) {
          const ext = getFileExtensionFromUrl(url) || getFileExtensionFromType(asset?.type) || 'png';
          await downloadUrl(url, buildFilename(`${basePrefix}-object-${safeObjectId}`, ext));
          return;
        }
      }

      alert('다운로드 가능한 에셋을 찾지 못했습니다.');
    } catch (error) {
      console.error('Error downloading object asset:', error);
      alert('다운로드 중 오류가 발생했습니다.');
    }
  };

  const handleDownloadDesignFiles = async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      const files: Array<{ type: 'blob'; blob: Blob; filename: string } | { type: 'url'; url: string; filename: string }> = [];
      const seenUrls = new Set<string>();
      const prefix = `order-${orderItem.id}`;

      Object.entries(imageUrlsBySide).forEach(([sideId, images]) => {
        images.forEach((image, index) => {
          if (!image?.url) return;
          if (seenUrls.has(image.url)) return;
          seenUrls.add(image.url);
          const ext = getFileExtensionFromName(image.path?.split('/').pop())
            || getFileExtensionFromUrl(image.url)
            || 'jpg';
          files.push({
            type: 'url',
            url: image.url,
            filename: buildFilename(`${prefix}-${sideId}-image-${index + 1}`, ext),
          });
        });
      });

      Object.entries(textSvgSideUrls).forEach(([sideId, url]) => {
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        files.push({ type: 'url', url, filename: `${prefix}-${sideId}-text.svg` });
      });

      Object.entries(textSvgObjectUrlsBySide).forEach(([sideId, objectMap]) => {
        Object.entries(objectMap).forEach(([objectId, url]) => {
          if (!url || seenUrls.has(url)) return;
          seenUrls.add(url);
          files.push({
            type: 'url',
            url,
            filename: `${prefix}-${sideId}-text-${sanitizeFilenameSegment(objectId)}.svg`,
          });
        });
      });

      const hasAnyTrackedSvgs = Object.keys(textSvgSideUrls).length > 0 || Object.keys(textSvgObjectUrlsBySide).length > 0;
      const hasAnyTrackedImages = Object.keys(imageUrlsBySide).length > 0;

      const canvasStates = orderItem.canvas_state || {};

      if (!hasAnyTrackedSvgs) {
        Object.entries(canvasStates).forEach(([sideId, canvasStateRaw]) => {
          const parsedState = parseCanvasState(canvasStateRaw) as CanvasState | null;
          if (!parsedState || !Array.isArray(parsedState.objects)) return;
          const textSvg = getTextSvgFromCanvasState(parsedState, sideId);
          if (!textSvg) return;
          files.push({
            type: 'blob',
            blob: new Blob([textSvg], { type: 'image/svg+xml' }),
            filename: `${prefix}-${sideId}-text.svg`,
          });
        });
      }

      if (!hasAnyTrackedImages) {
        Object.entries(canvasStates).forEach(([sideId, canvasStateRaw]) => {
          const parsedState = parseCanvasState(canvasStateRaw) as CanvasState | null;
          if (!parsedState || !Array.isArray(parsedState.objects)) return;

          let imageIndex = 0;
          parsedState.objects.forEach((obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.data?.id === 'background-product-image') return;

            const objectType = typeof obj.type === 'string' ? obj.type.toLowerCase() : '';
            if (objectType !== 'image') return;

            imageIndex += 1;
            const fileIndex = imageIndex;

            const data = obj.data as {
              originalFileUrl?: string;
              supabaseUrl?: string;
              originalFileName?: string;
              fileType?: string;
            } | undefined;

            const originalUrl = typeof data?.supabaseUrl === 'string'
              ? data.supabaseUrl
              : typeof data?.originalFileUrl === 'string'
              ? data.originalFileUrl
              : typeof (obj as { src?: string }).src === 'string'
              ? (obj as { src: string }).src
              : null;

            if (originalUrl && !seenUrls.has(originalUrl)) {
              seenUrls.add(originalUrl);
              const extension = getFileExtensionFromName(data?.originalFileName)
                || getFileExtensionFromUrl(originalUrl)
                || getFileExtensionFromType(data?.fileType)
                || 'png';
              const filename = buildFilename(`${prefix}-${sideId}-image-${fileIndex}`, extension);
              files.push({ type: 'url', url: originalUrl, filename });
            }
          });
        });
      }

      // Add custom fonts
      customFonts.forEach((font) => {
        if (!font.url || seenUrls.has(font.url)) return;
        seenUrls.add(font.url);
        const ext = font.format || getFileExtensionFromUrl(font.url) || 'ttf';
        files.push({
          type: 'url',
          url: font.url,
          filename: buildFilename(`${prefix}-font-${sanitizeFilenameSegment(font.fontFamily)}`, ext),
        });
      });

      if (files.length === 0) {
        alert('다운로드할 파일이 없습니다.');
        return;
      }

      for (const file of files) {
        if (file.type === 'blob') {
          downloadBlob(file.blob, file.filename);
        } else {
          await downloadUrl(file.url, file.filename);
        }
        await sleep(120);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">제품 정보를 불러올 수 없습니다.</p>
        <button
          onClick={onBack}
          className="mt-4 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">디자인 미리보기</h2>
            <p className="text-sm text-gray-500 mt-1">{orderItem.product_title}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isEditMode ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditMode(false)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 bg-gray-100 px-3 py-2 rounded-md hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 text-sm font-medium text-white bg-green-600 px-3 py-2 rounded-md hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className="flex items-center gap-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md hover:bg-amber-100 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                편집 모드
              </button>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-md">
                <Grid3x3 className="w-4 h-4" />
                전체 캔버스 보기
              </div>
              <button
                type="button"
                onClick={handleDownloadDesignFiles}
                disabled={isDownloading}
                className="flex items-center gap-2 text-sm font-medium text-white bg-blue-600 px-3 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                {isDownloading ? '다운로드 중...' : '전체 에셋 다운로드'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Save error */}
      {saveError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {saveError}
        </div>
      )}

      {/* Retouch request banner */}
      {orderItem.retouch_requested && (
        <div className="text-sm font-semibold text-orange-800 bg-orange-100 border border-orange-300 rounded-md px-4 py-2.5">
          담당자 리터치 요청됨 — 자주 사용되는 위치로 변경하여 작업을 진행해주세요.
        </div>
      )}

      {/* Edit mode banner */}
      {isEditMode && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          편집 모드 활성화 — 객체를 선택하여 이동/크기 조절할 수 있습니다. 스크롤로 확대/축소, Space+드래그로 이동할 수 있습니다. 변경사항은 저장 버튼을 눌러야 반영됩니다.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Canvas Preview */}
        <div className="lg:col-span-2 bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
          <div className="mb-6">
            {/* Options Quantity Table */}
            <h3 className="text-sm font-semibold text-gray-700 mb-3">주문 옵션</h3>
            {sizeOptions.length > 0 ? (
              <div className="overflow-hidden rounded-md border border-gray-200">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-gray-50 text-black">
                    <tr>
                      {sizeOptions.map((size) => (
                          <th key={size.size_code} className="px-3 py-2 text-center font-medium border border-gray-200">
                            {size.label} ({size.size_code})
                          </th>
                        ))}
                      <th className="px-3 py-2 text-center font-medium border border-gray-200 bg-gray-100">
                        합계
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-black">
                    <tr>
                      {sizeOptions.map((size) => {
                        const quantity = sizeQuantities.get(size.size_code);
                        return (
                          <td key={size.size_code} className="px-3 py-2 text-center border border-gray-200">
                            {quantity && quantity > 0 ? quantity : '-'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center border border-gray-200 bg-gray-100 font-semibold">
                        {Array.from(sizeQuantities.values()).reduce((sum, qty) => sum + qty, 0) || '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">사이즈 옵션이 없습니다.</p>
            )}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {product.configuration.map((side) => {
              const canvasState = orderItem.canvas_state[side.id] as CanvasState | string | null;
              if (!canvasState) return null;

              const sideZoom = zoomLevels[side.id] ?? 1;

              return (
                <div key={side.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">{side.name}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleZoom(side.id, 'out')}
                        className="p-1 text-gray-500 hover:bg-gray-200 rounded transition-colors"
                        title="축소"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-gray-500 w-10 text-center tabular-nums">
                        {Math.round(sideZoom * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => handleZoom(side.id, 'in')}
                        className="p-1 text-gray-500 hover:bg-gray-200 rounded transition-colors"
                        title="확대"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleZoom(side.id, 'reset')}
                        className="p-1 text-gray-500 hover:bg-gray-200 rounded transition-colors"
                        title="초기화"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-center items-center bg-gray-50 rounded-md p-3 min-h-125 overflow-hidden">
                    <SingleSideCanvas
                      side={side}
                      canvasState={canvasState}
                      productColor={getItemColorHex()}
                      width={400}
                      height={500}
                      isEdit={isEditMode}
                      enableZoomPan
                      onZoomChange={(zoom) => handleZoomChange(side.id, zoom)}
                      onCanvasReady={(canvas, sideId, scale) => {
                        handleCanvasRef(canvas, sideId);
                        handleCanvasReady(canvas, sideId, scale);
                      }}
                      renderFromCanvasStateOnly
                      customFonts={customFonts}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel - Colors and Dimensions */}
        <div className="space-y-4">
          {/* Product Information */}
          <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-5 h-5 text-gray-600" />
              <h3 className="text-base font-semibold text-gray-900">제품정보</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-sm text-gray-500 shrink-0">제품명:</span>
                <span className="text-sm font-medium text-gray-900">{product.title}</span>
              </div>
              {product.product_code && (
                <div className="flex items-start gap-2">
                  <span className="text-sm text-gray-500 shrink-0">제품코드:</span>
                  <span className="text-sm font-medium text-gray-900 font-mono">{product.product_code}</span>
                </div>
              )}
              {product.manufacturers?.name && (
                <div className="flex items-start gap-2">
                  <span className="text-sm text-gray-500 shrink-0">제조사:</span>
                  <span className="text-sm font-medium text-gray-900">{product.manufacturers.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Design Color Information */}
          <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-5 h-5 text-gray-600" />
              <h3 className="text-base font-semibold text-gray-900">디자인 색상</h3>
            </div>
            {getMockupColorInfo.length > 0 ? (
              <div className="space-y-2">
                {getMockupColorInfo.map((color, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-2 border border-gray-200 rounded-md"
                  >
                    <div
                      className="w-10 h-10 rounded border border-gray-300 flex-shrink-0"
                      style={{ backgroundColor: color.hex }}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{color.name}</p>
                      {color.label && (
                        <p className="text-xs text-gray-400">{color.label}</p>
                      )}
                      {color.colorCode && (
                        <p className="text-xs text-gray-500 font-mono">{color.colorCode}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">제품 색상 정보가 없습니다.</p>
          )}
          </div>

          {/* Object Information */}
          <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Ruler className="w-5 h-5 text-gray-600" />
              <h3 className="text-base font-semibold text-gray-900">객체 정보</h3>
            </div>
            {objectDimensions.length > 0 ? (
              <div className="space-y-3">
                {objectDimensions.map((dimension, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-md ${dimension.backgroundRemovalRequested ? 'border-2 border-red-400 bg-red-50/30' : 'border border-gray-200 bg-gray-50'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative w-16 h-16 rounded border border-gray-200 bg-white flex items-center justify-center shrink-0 overflow-hidden">
                        {dimension.preview ? (
                          <img
                            src={dimension.preview}
                            alt={dimension.objectType}
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-xs text-gray-400">No Preview</span>
                        )}
                        {dimension.backgroundRemovalRequested && (
                          <div className="absolute bottom-0 left-0 right-0 bg-red-600 text-white text-[8px] font-bold text-center py-0.5">
                            배경제거
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900">
                            {dimension.objectType}
                            {dimension.sideId && (
                              <span className="ml-2 text-xs font-normal text-gray-500">
                                {sideNameById.get(dimension.sideId) || dimension.sideId}
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleDownloadObjectAsset(dimension, index)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded transition-colors"
                              title="객체 에셋 다운로드"
                            >
                              <Download className="w-3 h-3" />
                              다운로드
                            </button>
                            {dimension.colors?.[0] && dimension.rawType !== 'image' && (
                              <div
                                className="w-4 h-4 rounded-full border border-gray-300"
                                style={{ backgroundColor: dimension.colors[0] }}
                              />
                            )}
                          </div>
                        </div>
                        {dimension.text && (
                          <p className="text-xs text-gray-600 mb-1 italic">&quot;{dimension.text}&quot;</p>
                        )}
                        {(dimension.fontFamily ||
                          dimension.fontWeight ||
                          dimension.fontStyle ||
                          dimension.textAlign ||
                          dimension.lineHeight ||
                          (typeof dimension.curveIntensity === 'number' && dimension.curveIntensity !== 0)) && (
                          <div className="text-xs text-gray-600 mb-2 space-y-1">
                            {dimension.fontFamily && (
                              <div>
                                <span className="text-gray-500">폰트:</span>
                                <span className="ml-1 font-medium text-gray-900">
                                  {dimension.fontFamily}
                                </span>
                              </div>
                            )}
                            {dimension.fontWeight && (
                              <div>
                                <span className="text-gray-500">굵기:</span>
                                <span className="ml-1 font-medium text-gray-900">
                                  {dimension.fontWeight}
                                </span>
                              </div>
                            )}
                            {dimension.fontStyle && (
                              <div>
                                <span className="text-gray-500">스타일:</span>
                                <span className="ml-1 font-medium text-gray-900">
                                  {dimension.fontStyle}
                                </span>
                              </div>
                            )}
                            {dimension.textAlign && (
                              <div>
                                <span className="text-gray-500">정렬:</span>
                                <span className="ml-1 font-medium text-gray-900">
                                  {dimension.textAlign}
                                </span>
                              </div>
                            )}
                            {typeof dimension.lineHeight === 'number' && (
                              <div>
                                <span className="text-gray-500">줄간격:</span>
                                <span className="ml-1 font-medium text-gray-900">
                                  {dimension.lineHeight}
                                </span>
                              </div>
                            )}
                            {typeof dimension.curveIntensity === 'number' && dimension.curveIntensity !== 0 && (
                              <div>
                                <span className="text-gray-500">곡률:</span>
                                <span className="ml-1 font-medium text-gray-900">
                                  {dimension.curveIntensity > 0 ? '+' : ''}{dimension.curveIntensity}%
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">너비:</span>
                            <span className="ml-1 font-medium text-gray-900">
                              {dimension.widthMm.toFixed(1)} mm
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">높이:</span>
                            <span className="ml-1 font-medium text-gray-900">
                              {dimension.heightMm.toFixed(1)} mm
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <div>
                            <span className="text-xs text-gray-500">인쇄방법:</span>
                            <span className={`ml-1 text-xs font-medium px-2 py-0.5 rounded ${getPrintMethodColor(dimension.printMethod)}`}>
                              {getPrintMethodName(dimension.printMethod)}
                            </span>
                          </div>
                          {dimension.backgroundRemovalRequested && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700">
                              배경제거 요청
                            </span>
                          )}
                        </div>
                        {dimension.rawType !== 'image' && (
                          dimension.colors && dimension.colors.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {dimension.colors.map((color) => (
                                <div key={color} className="flex items-center gap-1 text-xs">
                                  <span
                                    className="w-3 h-3 rounded border border-gray-300"
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className="font-mono text-gray-600">{color}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-gray-500">색상 정보 없음</p>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">크기 정보가 없습니다.</p>
            )}
          </div>

          {/* Custom Fonts */}
          {customFonts.length > 0 && (
            <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
                </svg>
                <h3 className="text-base font-semibold text-gray-900">커스텀 폰트</h3>
              </div>
              <div className="space-y-2">
                {customFonts.map((font, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 border border-gray-200 rounded-md bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {font.fontFamily}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {font.fileName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDownloadFont(font)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded transition-colors ml-2"
                      title="폰트 다운로드"
                    >
                      <Download className="w-3 h-3" />
                      다운로드
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
