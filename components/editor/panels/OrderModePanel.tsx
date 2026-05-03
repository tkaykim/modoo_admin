'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Package, Palette, Ruler, Download, Type, ImageIcon, MessageSquare } from 'lucide-react';
import OrderAttachmentSection from '@/components/orders/OrderAttachmentSection';
import {
  Product,
  ProductSide,
  ProductColor,
  OrderItem,
  ObjectDimensions,
  CanvasState,
  CustomFont,
} from '@/types/types';
import DesignChatPanel from '@/components/orders/DesignChatPanel';
import { useAuthStore } from '@/store/useAuthStore';
import { useCanvasStore } from '@/store/useCanvasStore';
import {
  parseCanvasState,
  normalizeColorToHex,
  coerceImageUrlsBySide,
  coerceTextSvgExports,
  coerceTextSvgObjectUrlsBySide,
  coerceCustomFonts,
  getTextSvgFromCanvasState,
  getFileExtensionFromName,
  getFileExtensionFromUrl,
  getFileExtensionFromType,
  buildFilename,
  sanitizeFilenameSegment,
  isTextObjectType,
  downloadBlob,
  downloadDataUrl,
  downloadUrl,
  sleep,
  ImageUrlsBySide,
  TextSvgObjectUrlsBySide,
} from '@/lib/downloadUtils';
import { normalizePrintMethod, getPrintMethodDisplayName } from '@/lib/printPricingConfig';
import { isAdminLike } from '@/lib/auth-helpers';

const printMethodColorClass = (method?: string | null): string => {
  const colorMap: Record<string, string> = {
    dtf: 'bg-blue-100 text-blue-700',
    dtg: 'bg-cyan-100 text-cyan-700',
    screen_printing: 'bg-green-100 text-green-700',
    embroidery: 'bg-purple-100 text-purple-700',
    applique: 'bg-amber-100 text-amber-700',
  };
  return (method && colorMap[method]) || 'bg-gray-100 text-gray-600';
};

export type PublicOrderPanelData = {
  orderId: string;
  customerNote: string | null;
  attachmentUrls: string[];
};

interface OrderModePanelProps {
  product: Product;
  orderItem: OrderItem;
  productColors: ProductColor[];
  orderId?: string;
  /** 공유 링크 등 비로그인 컨텍스트: 관리자 API 대신 이 값으로 메모·첨부 표시 */
  publicOrderData?: PublicOrderPanelData;
}

export default function OrderModePanel({
  product,
  orderItem,
  productColors,
  orderId,
  publicOrderData,
}: OrderModePanelProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { canvasMap, canvasVersion } = useCanvasStore();
  const user = useAuthStore((s) => s.user);

  const [customerNote, setCustomerNote] = useState<string | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);

  useEffect(() => {
    if (publicOrderData) {
      setCustomerNote(publicOrderData.customerNote ?? null);
      setAttachmentUrls(Array.isArray(publicOrderData.attachmentUrls) ? publicOrderData.attachmentUrls : []);
      return;
    }
    if (!orderId) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders?orderId=${orderId}`);
        if (!res.ok) return;
        const { data } = await res.json();
        const order = Array.isArray(data) ? data[0] : data;
        if (order) {
          setCustomerNote(order.customer_note || null);
          setAttachmentUrls(order.attachment_urls || []);
        }
      } catch { /* ignore */ }
    })();
  }, [orderId, publicOrderData]);

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

  // Compute object dimensions from canvas state
  const objectDimensions = useMemo(() => {
    const dimensions: ObjectDimensions[] = [];
    const sides = product.configuration || [];

    for (const side of sides) {
      const canvasStateRaw = orderItem.canvas_state?.[side.id];
      const canvasState = parseCanvasState(canvasStateRaw);
      if (!canvasState || !Array.isArray(canvasState.objects)) continue;

      const printArea = side.printArea;
      let pixelToMmRatio = 1;
      const productWidthMm = side.realLifeDimensions?.productWidthMm || 0;
      if (productWidthMm > 0 && printArea.width > 0) {
        pixelToMmRatio = productWidthMm / printArea.width;
      }

      for (const obj of canvasState.objects) {
        if (!obj || typeof obj !== 'object') continue;
        if (obj.data?.id === 'background-product-image') continue;

        const objectId = obj.data?.objectId || obj.objectId;
        const rawPrintMethod = obj.data?.printMethod || obj.printMethod;
        const printMethod = normalizePrintMethod(rawPrintMethod) || rawPrintMethod;

        const colors: string[] = [];
        const addColor = (v: unknown) => {
          if (typeof v !== 'string') return;
          const normalized = normalizeColorToHex(v);
          if (normalized && !colors.includes(normalized)) colors.push(normalized);
        };
        addColor(obj.fill);
        addColor(obj.stroke);

        const objWidth = (obj.width || 0) * (obj.scaleX || 1);
        const objHeight = (obj.height || 0) * (obj.scaleY || 1);

        const widthMm = typeof obj.data?.widthMm === 'number'
          ? obj.data.widthMm
          : typeof obj.widthMm === 'number'
          ? obj.widthMm
          : objWidth * pixelToMmRatio;

        const heightMm = typeof obj.data?.heightMm === 'number'
          ? obj.data.heightMm
          : typeof obj.heightMm === 'number'
          ? obj.heightMm
          : objHeight * pixelToMmRatio;

        let objectType = obj.type || 'Object';
        objectType = objectType.charAt(0).toUpperCase() + objectType.slice(1);

        const backgroundRemovalRequested = obj.data?.backgroundRemovalRequested || false;

        const dimension: ObjectDimensions = {
          objectId,
          sideId: side.id,
          rawType: obj.type,
          objectType,
          widthMm,
          heightMm,
          fill: obj.fill && typeof obj.fill === 'string' && obj.fill !== 'transparent' ? obj.fill : undefined,
          colors: colors.length > 0 ? colors : undefined,
          printMethod: printMethod as ObjectDimensions['printMethod'],
          backgroundRemovalRequested,
        };

        const typeLower = (obj.type || '').toLowerCase();
        if (isTextObjectType(typeLower)) {
          const text = obj.text || '';
          dimension.text = text.substring(0, 30) + (text.length > 30 ? '...' : '');
          dimension.fontFamily = obj.fontFamily;
          dimension.fontSize = obj.fontSize;
          dimension.fontWeight = obj.fontWeight;
          dimension.fontStyle = obj.fontStyle;
          dimension.textAlign = obj.textAlign;
          dimension.lineHeight = obj.lineHeight;
          if (typeLower === 'curvedtext' && typeof obj.curveIntensity === 'number') {
            dimension.curveIntensity = obj.curveIntensity;
          }
        }

        dimensions.push(dimension);
      }
    }

    return dimensions;
  }, [product, orderItem.canvas_state]);

  // Static fallback previews extracted from canvas_state JSON.
  // Unlike objectPreviews (which relies on live canvas toDataURL and can fail due to
  // timing / image-decode races), these are available immediately from the stored data.
  const staticImagePreviews = useMemo(() => {
    const urls: Record<string, string> = {};
    const sides = product.configuration || [];
    for (const side of sides) {
      const canvasStateRaw = orderItem.canvas_state?.[side.id];
      const canvasState = parseCanvasState(canvasStateRaw);
      if (!canvasState || !Array.isArray(canvasState.objects)) continue;
      for (const obj of canvasState.objects) {
        if (!obj || typeof obj !== 'object') continue;
        if (obj.data?.id === 'background-product-image') continue;
        const objectId = obj.data?.objectId || obj.objectId;
        if (!objectId) continue;
        if ((obj.type || '').toLowerCase() !== 'image') continue;
        const src = obj.data?.supabaseUrl || obj.data?.originalFileUrl || obj.src;
        if (typeof src === 'string' && src) urls[objectId] = src;
      }
    }
    return urls;
  }, [product, orderItem.canvas_state]);

  // Generate object previews from live canvas using per-object toDataURL
  const objectPreviews = useMemo(() => {
    const previews: Record<string, string> = {};
    const sides = product.configuration || [];

    for (const side of sides) {
      const canvas = canvasMap[side.id];
      if (!canvas) continue;

      const objects = canvas.getObjects().filter((obj) => {
        if (obj.excludeFromExport) return false;
        const d = obj as { data?: { id?: string; objectId?: string } };
        if (d.data?.id === 'background-product-image') return false;
        return true;
      });

      for (const obj of objects) {
        const d = obj as { data?: { objectId?: string } };
        const objectId = d.data?.objectId;
        if (!objectId) continue;

        try {
          previews[objectId] = obj.toDataURL({
            format: 'png',
            quality: 0.9,
            multiplier: 1,
          });
        } catch {
          // skip
        }
      }
    }

    return previews;
    // canvasVersion triggers regeneration when objects finish loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasMap, product.configuration, canvasVersion]);

  const mockupColorInfo = useMemo(() => {
    if (!product) return [];
    const appliedColorHex = getAppliedProductColorHex();
    if (appliedColorHex) {
      // Try to find matching manufacturer color from productColors for richer data
      const matchingPc = productColors.find(
        (pc) => pc.manufacturer_colors?.hex === appliedColorHex
      );
      const mc = matchingPc?.manufacturer_colors;
      const colorName = mc?.name || orderItem.item_options?.variants?.[0]?.color_name || orderItem.item_options?.color_name || 'Selected Color';
      const colorCode = mc?.color_code || orderItem.item_options?.variants?.[0]?.color_code || orderItem.item_options?.color_code;
      const colorLabel = mc?.label;
      return [{ name: colorName, hex: appliedColorHex, colorCode, colorLabel }];
    }
    return [];
  }, [product, productColors, getAppliedProductColorHex, orderItem.item_options]);

  interface SizeOptionObj { label: string; size_code: string }
  const rawSizeOptions = (product?.size_options ?? []) as (string | SizeOptionObj)[];
  const sizeOptions: SizeOptionObj[] = rawSizeOptions.map((opt) =>
    typeof opt === 'string' ? { label: opt, size_code: opt } : opt
  );

  const sizeQuantities = useMemo(() => {
    const map = new Map<string, number>();
    if (!sizeOptions.length) return map;

    const findSizeOption = (sizeId?: string, sizeName?: string) => {
      if (sizeId) {
        const byCode = sizeOptions.find((opt) => opt.size_code.toLowerCase() === sizeId.toLowerCase());
        if (byCode) return byCode;
      }
      if (sizeName) {
        const byLabel = sizeOptions.find((opt) => opt.label.toLowerCase() === sizeName.toLowerCase());
        if (byLabel) return byLabel;
      }
      const fallbackLabel = sizeName || sizeId || 'unknown';
      return { label: fallbackLabel, size_code: sizeId || fallbackLabel };
    };

    const addQty = (sizeId?: string, sizeName?: string, quantity?: number) => {
      if (!quantity || quantity <= 0) return;
      const opt = findSizeOption(sizeId, sizeName);
      if (!opt) return;
      map.set(opt.size_code, (map.get(opt.size_code) || 0) + quantity);
    };

    const variants = orderItem.item_options?.variants ?? [];
    if (variants.length > 0) {
      variants.forEach((v) => addQty(v.size_id, v.size_name, v.quantity));
    } else {
      addQty(orderItem.item_options?.size_id, orderItem.item_options?.size_name, orderItem.quantity);
    }

    return map;
  }, [orderItem.item_options, orderItem.quantity, sizeOptions]);

  // Download helpers
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
        const id = rawObject.data?.objectId || rawObject.objectId;
        if (id !== objectId) continue;
        return { sideId, src: rawObject.src, type: rawObject.type, data: rawObject.data };
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
          await downloadUrl(svgAsset.url, `${basePrefix}-${svgAsset.sideId}-text-${safeObjectId}.svg`);
          return;
        }
        if (resolvedSideId && textSvgSideUrls[resolvedSideId]) {
          await downloadUrl(textSvgSideUrls[resolvedSideId], `${basePrefix}-${resolvedSideId}-text.svg`);
          return;
        }
        if (resolvedSideId) {
          const cs = parseCanvasState(orderItem.canvas_state?.[resolvedSideId]);
          if (cs?.objects?.length) {
            const filtered = cs.objects.find((o) => {
              if (!o || typeof o !== 'object') return false;
              const t = typeof o.type === 'string' ? o.type.toLowerCase() : '';
              if (!isTextObjectType(t)) return false;
              return (o.data?.objectId || o.objectId) === objectId;
            });
            if (filtered) {
              const svg = getTextSvgFromCanvasState({ ...cs, objects: [filtered] }, resolvedSideId);
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
        if (trackedSideImages?.length) {
          const trackedIndex = trackedSideImages.findIndex((img) => {
            if (supabaseUrl && img.url === supabaseUrl) return true;
            if (supabasePath && img.path === supabasePath) return true;
            return false;
          });
          if (trackedIndex >= 0) {
            urlToDownload = trackedSideImages[trackedIndex].url;
          } else if (trackedSideImages.length === 1 && !supabaseUrl && !supabasePath) {
            urlToDownload = trackedSideImages[0].url;
          }
        }

        if (urlToDownload) {
          const ext = getFileExtensionFromName(data?.originalFileName) || getFileExtensionFromUrl(urlToDownload) || getFileExtensionFromType(data?.fileType) || 'png';
          const filename = buildFilename(`${basePrefix}-${sideId || 'image'}-image-${safeObjectId}`, ext);
          if (urlToDownload.startsWith('data:')) {
            await downloadDataUrl(urlToDownload, filename);
          } else {
            await downloadUrl(urlToDownload, filename);
          }
          return;
        }
      }

      alert('다운로드 가능한 에셋을 찾지 못했습니다.');
    } catch (error) {
      console.error('Error downloading object asset:', error);
      alert('다운로드 중 오류가 발생했습니다.');
    }
  };

  const handleDownloadFont = async (font: CustomFont) => {
    const ext = font.format || getFileExtensionFromUrl(font.url) || 'ttf';
    const filename = buildFilename(`font-${sanitizeFilenameSegment(font.fontFamily)}`, ext);
    await downloadUrl(font.url, filename);
  };

  return (
    <>
      {/* Retouch Request Banner */}
      {orderItem.retouch_requested && (
        <div className="p-2.5 border-b border-orange-200 bg-orange-50 text-[11px] font-semibold text-orange-800">
          담당자 리터치 요청됨
        </div>
      )}

      {/* Customer Note & Attachments */}
      <div className="p-3 border-b">
        {customerNote && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">고객 요청사항</h3>
            </div>
            <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{customerNote}</p>
          </div>
        )}
        {(orderId || publicOrderData) && (
          <OrderAttachmentSection
            orderId={publicOrderData?.orderId ?? orderId ?? ''}
            attachmentUrls={attachmentUrls}
            onUrlsUpdated={setAttachmentUrls}
            compact
            readonly={!!publicOrderData}
            isAdmin={isAdminLike(user?.role)}
          />
        )}
      </div>

      {/* Size/Quantity Table */}
      {sizeOptions.length > 0 && (() => {
        const mobileSizeOptions = sizeOptions.filter((size) => {
          const qty = sizeQuantities.get(size.size_code);
          return qty && qty > 0;
        });
        const totalQtySum = Array.from(sizeQuantities.values()).reduce((sum, qty) => sum + qty, 0);
        const totalQtyCell = totalQtySum > 0 ? totalQtySum : '-';

        const renderSizeTable = (sizes: typeof sizeOptions) => (
          <div className="overflow-hidden rounded border border-gray-200">
            <table className="w-full text-[11px] border-collapse">
              <thead className="bg-gray-50 text-black">
                <tr>
                  {sizes.map((size) => (
                    <th key={size.size_code} className="px-2 py-1.5 text-center font-medium border border-gray-200">
                      <div>{size.label}</div>
                      {size.size_code && size.size_code !== size.label && (
                        <div className="text-[9px] font-normal text-gray-400 font-mono">{size.size_code}</div>
                      )}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-center font-medium border border-gray-200 bg-gray-100">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-black">
                <tr>
                  {sizes.map((size) => {
                    const quantity = sizeQuantities.get(size.size_code);
                    return (
                      <td key={size.size_code} className="px-2 py-1.5 text-center border border-gray-200">
                        {quantity && quantity > 0 ? <span className="font-semibold">{quantity}</span> : '-'}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center border border-gray-200 bg-gray-100 font-bold">
                    {totalQtyCell}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );

        return (
          <div className="p-3 border-b">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">주문 옵션</h3>
            {/* 모바일: 수량이 있는 사이즈만 표시 */}
            <div className="block md:hidden">
              {mobileSizeOptions.length > 0 ? renderSizeTable(mobileSizeOptions) : renderSizeTable(sizeOptions)}
            </div>
            {/* 데스크톱: 모든 사이즈 표시 */}
            <div className="hidden md:block">
              {renderSizeTable(sizeOptions)}
            </div>
            <div className="mt-2 flex justify-end text-[11px] text-gray-600">
              <span>
                총 수량{' '}
                <span className="font-semibold text-gray-900 tabular-nums">{totalQtySum}</span>
              </span>
            </div>
          </div>
        );
      })()}

      {/* Product Info + Color */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-1.5 mb-2">
          <Package className="w-3.5 h-3.5 text-gray-500" />
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">제품 정보</h3>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-start gap-1.5">
            <span className="text-[11px] text-gray-400 shrink-0 w-12">제품명</span>
            <span className="text-[11px] font-medium text-gray-800">{product.title}</span>
          </div>
          {product.product_code && (
            <div className="flex items-start gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0 w-12">코드</span>
              <span className="text-[11px] font-medium text-gray-800 font-mono">{product.product_code}</span>
            </div>
          )}
          {product.manufacturers?.name && (
            <div className="flex items-start gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0 w-12">제조사</span>
              <span className="text-[11px] font-medium text-gray-800">{product.manufacturers.name}</span>
            </div>
          )}
          {/* Color inline */}
          {mockupColorInfo.length > 0 && mockupColorInfo.map((color, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0 w-12 mt-0.5">원감</span>
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full border border-gray-300 shrink-0"
                  style={{ backgroundColor: color.hex }}
                />
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-gray-800">{color.name}</span>
                  <div className="flex items-center gap-1.5">
                    {color.colorCode && (
                      <span className="text-[10px] font-medium text-gray-500 font-mono">{color.colorCode}</span>
                    )}
                    <span className="text-[10px] text-gray-400 font-mono">{color.hex}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Design Specifications */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Ruler className="w-3.5 h-3.5 text-gray-500" />
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">디자인 사양</h3>
        </div>
        {objectDimensions.length > 0 ? (
          <div className="space-y-3">
            {(product.configuration || []).map((side) => {
              const sideObjects = objectDimensions.filter((d) => d.sideId === side.id);
              if (sideObjects.length === 0) return null;
              return (
                <div key={side.id}>
                  <div className="text-[11px] font-bold text-gray-700 mb-2 pb-1 border-b border-gray-100">[{side.name}]</div>
                  <div className="space-y-3">
                    {sideObjects.map((dim, index) => {
                      const preview = dim.objectId
                        ? (objectPreviews[dim.objectId] || staticImagePreviews[dim.objectId])
                        : undefined;
                      return (
                        <div key={index} className="border border-gray-200 rounded-lg bg-gray-50/50 overflow-hidden">
                          {/* Preview image */}
                          <div className="bg-white flex items-center justify-center p-3 border-b border-gray-100 max-h-52">
                            {preview ? (
                              <img
                                src={preview}
                                alt={dim.text || dim.objectType}
                                className="max-w-full max-h-44 object-contain"
                              />
                            ) : (
                              <div className="text-gray-300 py-4">
                                {isTextObjectType((dim.rawType || '').toLowerCase()) ? (
                                  <Type className="w-8 h-8" />
                                ) : (
                                  <ImageIcon className="w-8 h-8" />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Object details */}
                          <div className="p-2.5">
                            <div className="flex items-start justify-between mb-1.5">
                              <span className="text-[11px] font-semibold text-gray-800 leading-tight">
                                {dim.text || dim.objectType}
                              </span>
                              <button
                                onClick={() => void handleDownloadObjectAsset(dim, objectDimensions.indexOf(dim))}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50 rounded transition-colors shrink-0 ml-1"
                              >
                                <Download className="w-2.5 h-2.5" />
                              </button>
                            </div>
                            <div className="space-y-0.5 text-[10px]">
                              <div className="flex gap-1">
                                <span className="text-gray-400 shrink-0 w-7">방식</span>
                                <span className={`font-medium px-1 rounded ${printMethodColorClass(dim.printMethod)}`}>
                                  {getPrintMethodDisplayName(dim.printMethod || 'dtf')}
                                </span>
                              </div>
                              <div className="flex gap-1">
                                <span className="text-gray-400 shrink-0 w-7">크기</span>
                                <span className="text-gray-700">
                                  {dim.widthMm >= dim.heightMm
                                    ? `가로기준 ${(dim.widthMm / 10).toFixed(1)}cm`
                                    : `세로기준 ${(dim.heightMm / 10).toFixed(1)}cm`}
                                </span>
                              </div>
                              {dim.colors && dim.colors.length > 0 && (
                                <div className="flex gap-1 items-center">
                                  <span className="text-gray-400 shrink-0 w-7">색상</span>
                                  <div className="flex flex-wrap gap-1">
                                    {dim.colors.map((c) => (
                                      <span key={c} className="inline-flex items-center gap-0.5">
                                        <span className="w-2.5 h-2.5 rounded-sm border border-gray-300" style={{ backgroundColor: c }} />
                                        <span className="font-mono text-gray-500">{c}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {dim.fontFamily && (
                                <div className="flex gap-1">
                                  <span className="text-gray-400 shrink-0 w-7">폰트</span>
                                  <span className="text-gray-700 truncate">{dim.fontFamily}</span>
                                </div>
                              )}
                              {dim.backgroundRemovalRequested && (
                                <div className="mt-1">
                                  <span className="font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                    배경제거 요청
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">객체 정보가 없습니다.</p>
        )}
      </div>

      {/* Design Chat */}
      <div className="p-3 border-b">
        <DesignChatPanel
          orderItemId={orderItem.id}
          productTitle={product.title}
          designTitle={orderItem.design_title || undefined}
          compact
        />
      </div>

      {/* Custom Fonts */}
      {customFonts.length > 0 && (
        <div className="p-3 border-b">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">커스텀 폰트</h3>
          <div className="space-y-1">
            {customFonts.map((font, i) => (
              <div key={i} className="flex items-center justify-between p-1.5 border border-gray-200 rounded bg-gray-50/50">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-gray-800 truncate">{font.fontFamily}</p>
                  <p className="text-[10px] text-gray-400 truncate">{font.fileName}</p>
                </div>
                <button
                  onClick={() => void handleDownloadFont(font)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50 rounded transition-colors ml-2"
                >
                  <Download className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
