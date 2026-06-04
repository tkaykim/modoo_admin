'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Package, Calendar, Clock, CreditCard, ArrowLeft, Download, LayoutList, MessageSquare, Paperclip } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import OrderAttachmentSection from '@/components/orders/OrderAttachmentSection';
import FactoryWorkView, { type FactoryWorkItem } from '@/components/factory/FactoryWorkView';
import { extractVariantsFromOptions } from '@/lib/orderUtils';
import type { Product, OrderItem, ProductColor, CanvasState, CustomFont } from '@/types/types';
import { formatKstDateOnly } from '@/lib/kst';
import { orderCategoryLabelShare, type OrderCategoryValue } from '@/lib/order-category';
import EditorCanvas from '@/components/editor/EditorCanvas';
import EditorRightPanel from '@/components/editor/EditorRightPanel';
import OrderModePanel from '@/components/editor/panels/OrderModePanel';
import { useCanvasStore } from '@/store/useCanvasStore';
import {
  parseCanvasState,
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
  downloadBlob,
  downloadUrl,
  sleep,
} from '@/lib/downloadUtils';

interface PublicOrder {
  id: string;
  order_status: string;
  order_category: string | null;
  parent_order_id: string | null;
  shipping_method: string;
  country_code: string | null;
  state: string | null;
  city: string | null;
  postal_code: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  deadline: string | null;
  factory_amount: number | null;
  factory_payment_date: string | null;
  factory_payment_status: 'pending' | 'completed' | 'cancelled' | null;
  factory_status: string | null;
  created_at: string;
  customer_note: string | null;
  attachment_urls: string[];
}

interface PublicOrderItem {
  id: string;
  product_id: string;
  product_title: string;
  quantity: number;
  canvas_state: Record<string, CanvasState>;
  color_selections: Record<string, unknown>;
  item_options: OrderItem['item_options'];
  thumbnail_url: string | null;
  image_urls?: OrderItem['image_urls'];
  text_svg_exports?: OrderItem['text_svg_exports'];
  custom_fonts?: CustomFont[] | string | null;
  assigned_manufacturer_id?: string | null;
  factory_status?: string | null;
  factory_amount?: number | null;
  factory_unit_price?: number | null;
  factory_price_confirmed_at?: string | null;
  factory_price_locked?: boolean | null;
  products?: {
    product_code: string | null;
    title: string;
    configuration: Product['configuration'];
    size_options: Product['size_options'];
    base_price: number;
    manufacturers?: { id: string; name: string } | null;
  } | null;
  created_at: string;
}

const orderStatusLabels: Record<string, string> = {
  payment_pending: '결제대기',
  payment_completed: '결제완료',
  in_production: '제작중',
  shipping: '배송중',
  delivered: '배송완료',
  cancelled: '취소',
  partially_cancelled: '부분취소',
};

const factoryStatusLabels: Record<string, string> = {
  pending: '대기중',
  assigned: '배정완료',
  in_progress: '작업중',
  completed: '작업완료',
  shipped: '출고완료',
  cancelled: '취소',
};

const factoryStatusOptions = [
  { value: 'assigned', label: '배정완료' },
  { value: 'in_progress', label: '작업중' },
  { value: 'completed', label: '작업완료' },
  { value: 'shipped', label: '출고완료' },
];

// Shared item detail view — full-screen editor-like UI (read-only)
function SharedItemView({
  item,
  productColors,
  onBack,
  publicOrder,
}: {
  item: PublicOrderItem;
  productColors: ProductColor[];
  onBack: () => void;
  publicOrder: PublicOrder;
}) {
  const { setActiveSide } = useCanvasStore();
  const [isDownloading, setIsDownloading] = useState(false);

  // Build a Product-like object from the joined data
  const product = useMemo<Product | null>(() => {
    if (!item.products) return null;
    return {
      id: item.product_id,
      title: item.products.title || item.product_title,
      base_price: item.products.base_price ?? 0,
      // Prefer the order's frozen configuration snapshot over live product config
      // so later mockup/printArea edits don't retro-change this shared order.
      configuration:
        (Array.isArray((item as { configuration_snapshot?: unknown }).configuration_snapshot) &&
        ((item as { configuration_snapshot?: unknown[] }).configuration_snapshot!).length > 0
          ? (item as { configuration_snapshot?: Product['configuration'] }).configuration_snapshot
          : item.products.configuration) || [],
      size_options: item.products.size_options || null,
      product_code: item.products.product_code,
      manufacturers: item.products.manufacturers,
      sort_order: 0,
      is_active: true,
      is_featured: false,
      keywords: [],
      created_at: item.created_at,
      updated_at: item.created_at,
      category: null,
    };
  }, [item]);

  // Build OrderItem-like from PublicOrderItem
  const orderItem = useMemo<OrderItem>(() => item as unknown as OrderItem, [item]);

  const publicOrderData = useMemo(
    () => ({
      orderId: publicOrder.id,
      customerNote: publicOrder.customer_note ?? null,
      attachmentUrls: Array.isArray(publicOrder.attachment_urls) ? publicOrder.attachment_urls : [],
    }),
    [publicOrder.id, publicOrder.customer_note, publicOrder.attachment_urls]
  );

  const sides = product?.configuration || [];

  // Extract product color from canvas state
  const productColor = useMemo(() => {
    const states = Object.values(item.canvas_state || {});
    for (const stateRaw of states) {
      const state = parseCanvasState(stateRaw);
      if (typeof state?.productColor === 'string' && state.productColor.startsWith('#')) {
        return state.productColor;
      }
    }
    const variants = item.item_options?.variants;
    if (Array.isArray(variants) && variants.length > 0 && variants[0]?.color_hex) {
      return variants[0].color_hex;
    }
    return item.item_options?.color_hex || '#FFFFFF';
  }, [item.canvas_state, item.item_options]);

  const customFonts = useMemo(() => coerceCustomFonts(item.custom_fonts), [item.custom_fonts]);

  // Set initial active side
  useEffect(() => {
    if (sides.length > 0) {
      setActiveSide(sides[0].id);
    }
  }, [sides, setActiveSide]);

  // Download all handler
  const handleDownloadAll = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      const imageUrlsBySide = coerceImageUrlsBySide(item.image_urls);
      const fonts = coerceCustomFonts(item.custom_fonts);
      const textSvgExports = coerceTextSvgExports(item.text_svg_exports);
      const textSvgSideUrls: Record<string, string> = {};
      Object.entries(textSvgExports).forEach(([sideId, value]) => {
        if (sideId === '__objects') return;
        if (typeof value !== 'string' || !value) return;
        textSvgSideUrls[sideId] = value;
      });
      const textSvgObjectUrlsBySide = coerceTextSvgObjectUrlsBySide(textSvgExports.__objects);

      const files: Array<{ type: 'blob'; blob: Blob; filename: string } | { type: 'url'; url: string; filename: string }> = [];
      const seenUrls = new Set<string>();
      const prefix = `order-${item.id}`;

      // Image URLs
      Object.entries(imageUrlsBySide).forEach(([sideId, images]) => {
        images.forEach((image, index) => {
          if (!image?.url || seenUrls.has(image.url)) return;
          seenUrls.add(image.url);
          const ext = getFileExtensionFromName(image.path?.split('/').pop()) || getFileExtensionFromUrl(image.url) || 'jpg';
          files.push({ type: 'url', url: image.url, filename: buildFilename(`${prefix}-${sideId}-image-${index + 1}`, ext) });
        });
      });

      // Text SVG URLs
      Object.entries(textSvgSideUrls).forEach(([sideId, url]) => {
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        files.push({ type: 'url', url, filename: `${prefix}-${sideId}-text.svg` });
      });

      Object.entries(textSvgObjectUrlsBySide).forEach(([sideId, objectMap]) => {
        Object.entries(objectMap).forEach(([objectId, url]) => {
          if (!url || seenUrls.has(url)) return;
          seenUrls.add(url);
          files.push({ type: 'url', url, filename: `${prefix}-${sideId}-text-${sanitizeFilenameSegment(objectId)}.svg` });
        });
      });

      // Fallback: generate SVGs from canvas state
      const hasTrackedSvgs = Object.keys(textSvgSideUrls).length > 0 || Object.keys(textSvgObjectUrlsBySide).length > 0;
      if (!hasTrackedSvgs) {
        Object.entries(item.canvas_state || {}).forEach(([sideId, stateRaw]) => {
          const state = parseCanvasState(stateRaw);
          if (!state || !Array.isArray(state.objects)) return;
          const svg = getTextSvgFromCanvasState(state, sideId);
          if (!svg) return;
          files.push({ type: 'blob', blob: new Blob([svg], { type: 'image/svg+xml' }), filename: `${prefix}-${sideId}-text.svg` });
        });
      }

      // Fallback: extract image URLs from canvas state
      const hasTrackedImages = Object.keys(imageUrlsBySide).length > 0;
      if (!hasTrackedImages) {
        Object.entries(item.canvas_state || {}).forEach(([sideId, stateRaw]) => {
          const state = parseCanvasState(stateRaw);
          if (!state || !Array.isArray(state.objects)) return;
          let imageIndex = 0;
          state.objects.forEach((obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.data?.id === 'background-product-image') return;
            const objectType = typeof obj.type === 'string' ? obj.type.toLowerCase() : '';
            if (objectType !== 'image') return;
            imageIndex++;
            const data = obj.data as { supabaseUrl?: string; originalFileUrl?: string; originalFileName?: string; fileType?: string } | undefined;
            const url = data?.supabaseUrl || data?.originalFileUrl || obj.src;
            if (url && !seenUrls.has(url)) {
              seenUrls.add(url);
              const ext = getFileExtensionFromName(data?.originalFileName) || getFileExtensionFromUrl(url) || getFileExtensionFromType(data?.fileType) || 'png';
              files.push({ type: 'url', url, filename: buildFilename(`${prefix}-${sideId}-image-${imageIndex}`, ext) });
            }
          });
        });
      }

      // Custom fonts
      fonts.forEach((font) => {
        if (!font.url || seenUrls.has(font.url)) return;
        seenUrls.add(font.url);
        const ext = font.format || getFileExtensionFromUrl(font.url) || 'ttf';
        files.push({ type: 'url', url: font.url, filename: buildFilename(`${prefix}-font-${sanitizeFilenameSegment(font.fontFamily)}`, ext) });
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
  }, [item, isDownloading]);

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">제품 정보를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const PANEL_W = 480;

  return (
    <div className="h-screen relative overflow-hidden bg-neutral-700">
      {/* Full-screen canvas workspace */}
      <EditorCanvas
        sides={sides}
        isEditing={false}
        canvasStates={item.canvas_state}
        productColor={productColor}
        customFonts={customFonts.length > 0 ? customFonts : undefined}
        rightPanelWidth={PANEL_W}
      />

      {/* Floating UI overlay */}
      <div className="relative z-10 h-full flex flex-col pointer-events-none">
        {/* Header */}
        <div className="pointer-events-auto shrink-0">
          <div className="h-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 flex items-center px-3 gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              목록으로
            </button>
            <div className="h-4 w-px bg-gray-300" />
            <span className="text-xs font-medium text-gray-800 truncate">{item.product_title}</span>
            <div className="flex-1" />
            <button
              onClick={() => void handleDownloadAll()}
              disabled={isDownloading}
              className="flex items-center gap-1 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
            >
              {isDownloading ? (
                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              전체 다운로드
            </button>
          </div>
        </div>

        {/* Workspace area */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1" />
          <div className="pointer-events-auto flex">
            <EditorRightPanel wide>
              <OrderModePanel
                product={product}
                orderItem={orderItem}
                productColors={productColors}
                publicOrderData={publicOrderData}
              />
            </EditorRightPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SharedOrderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const shareToken = params?.shareToken as string;
  const initialItemId = searchParams?.get('item') || null;
  const factoryId = searchParams?.get('factory') || null;

  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [items, setItems] = useState<PublicOrderItem[]>([]);
  const [productColorsMap, setProductColorsMap] = useState<Record<string, ProductColor[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [pendingItem, setPendingItem] = useState<PublicOrderItem | null>(null);
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);

  useEffect(() => {
    if (!shareToken) return;
    fetchOrderData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareToken]);

  useEffect(() => {
    if (!deepLinkApplied && initialItemId && items.length > 0) {
      const found = items.find((i) => i.id === initialItemId);
      if (found) setSelectedItemId(found.id);
      setDeepLinkApplied(true);
    }
  }, [initialItemId, items, deepLinkApplied]);

  const fetchOrderData = async () => {
    setLoading(true);
    setError(null);

    try {
      const qs = factoryId ? `?factory=${encodeURIComponent(factoryId)}` : '';
      const response = await fetch(`/api/public/orders/${shareToken}${qs}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || '주문을 찾을 수 없습니다.');
      }

      const { data } = await response.json();
      const rawOrder = data.order;
      setOrder({
        ...rawOrder,
        customer_note: rawOrder.customer_note ?? null,
        attachment_urls: Array.isArray(rawOrder.attachment_urls) ? rawOrder.attachment_urls : [],
      });
      setItems(data.items || []);
      setProductColorsMap(data.productColors || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : '주문 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const patchItemStatus = async (
    item: PublicOrderItem,
    newStatus: string,
    opts?: { factoryAmount?: number; factoryUnitPrice?: number | null; factoryPriceMode?: string; confirm?: boolean }
  ) => {
    if (!shareToken) return false;
    setUpdatingItemId(item.id);
    try {
      const body: Record<string, unknown> = { itemId: item.id, factoryStatus: newStatus };
      if (factoryId) body.factory = factoryId;
      if (opts?.confirm) body.confirmFactoryPrice = true;
      if (opts?.factoryAmount !== undefined) body.factoryAmount = opts.factoryAmount;
      if (opts?.factoryUnitPrice !== undefined) body.factoryUnitPrice = opts.factoryUnitPrice;
      if (opts?.factoryPriceMode !== undefined) body.factoryPriceMode = opts.factoryPriceMode;
      const response = await fetch(`/api/public/orders/${shareToken}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(json?.error || '상태 변경에 실패했습니다.');
        return false;
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                factory_status: newStatus,
                factory_amount: opts?.factoryAmount !== undefined ? opts.factoryAmount : it.factory_amount,
                factory_price_confirmed_at: opts?.confirm ? new Date().toISOString() : it.factory_price_confirmed_at,
              }
            : it
        )
      );
      if (json?.data?.order_status) {
        setOrder((prev) => (prev ? { ...prev, order_status: json.data.order_status } : prev));
      }
      return true;
    } catch {
      alert('상태 변경에 실패했습니다.');
      return false;
    } finally {
      setUpdatingItemId(null);
    }
  };

  const formatDate = (dateString: string) => formatKstDateOnly(dateString);

  const handleAdminOrdersClick = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/orders');
      } else {
        router.push(`/login?redirect=${encodeURIComponent('/orders')}`);
      }
    } catch {
      router.push(`/login?redirect=${encodeURIComponent('/orders')}`);
    }
  };

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return items.find((item) => item.id === selectedItemId) || null;
  }, [items, selectedItemId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">주문 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">주문을 찾을 수 없습니다</h1>
          <p className="text-gray-600">{error || '유효하지 않은 링크입니다.'}</p>
        </div>
      </div>
    );
  }

  // Show full-screen editor-like view when an item is selected
  if (selectedItem && order) {
    return (
      <SharedItemView
        item={selectedItem}
        productColors={(productColorsMap[selectedItem.product_id] || []) as ProductColor[]}
        onBack={() => setSelectedItemId(null)}
        publicOrder={order}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">주문 상세 정보</h1>
              <p className="text-sm text-gray-500">주문 ID: {order.id}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <button
                type="button"
                onClick={() => void handleAdminOrdersClick()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <LayoutList className="w-4 h-4 shrink-0" />
                관리자 주문 목록
              </button>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                order.order_status === 'payment_pending' ? 'bg-amber-100 text-amber-800' :
                order.order_status === 'delivered' ? 'bg-green-100 text-green-800' :
                order.order_status === 'in_production' ? 'bg-yellow-100 text-yellow-800' :
                order.order_status === 'shipping' ? 'bg-indigo-100 text-indigo-800' :
                order.order_status === 'cancelled' || order.order_status === 'partially_cancelled' ? 'bg-red-100 text-red-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {orderStatusLabels[order.order_status] || order.order_status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 차액(추가) 주문 경고 — 작업자가 전체 주문으로 착각하지 않도록 최상단 고정 */}
        {order.order_category === 'surcharge' && (
          <div className="mb-6 rounded-lg border-2 border-orange-400 bg-orange-50 px-5 py-4">
            <p className="text-base font-bold text-orange-900">⚠ 차액(추가) 제작 주문 — 전체 주문이 아닙니다</p>
            <p className="mt-1.5 text-sm text-orange-800">
              {order.parent_order_id && (
                <>원주문 <span className="font-mono font-semibold">{order.parent_order_id}</span>의 </>
              )}
              <b>추가 제작분만</b> 포함된 주문입니다. 아래 표기된 수량은 <b>추가 수량</b>이니, 원주문과 별개로 이만큼만 추가 제작해 주세요.
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Order Items */}
          <div className="lg:col-span-2 space-y-4">
            {/* Order Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">주문일</span>
                </div>
                <p className="font-medium text-gray-900">{formatDate(order.created_at)}</p>
              </div>
              {order.deadline && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">마감일</span>
                  </div>
                  <p className="font-medium text-gray-900">{formatDate(order.deadline)}</p>
                </div>
              )}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <Package className="w-4 h-4" />
                  <span className="text-sm">주문 구분</span>
                </div>
                <p className="font-medium text-gray-900">
                  {orderCategoryLabelShare(order.order_category as OrderCategoryValue)}
                </p>
              </div>
            </div>

            {/* 작업 목록 — 로그인/링크 공통 컴포넌트 (동일 경험) */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <FactoryWorkView
                title="주문 상품"
                updatingItemId={updatingItemId}
                items={items.map((item): FactoryWorkItem => ({
                  id: item.id,
                  product_title: item.product_title,
                  design_title: null,
                  quantity: item.quantity,
                  thumbnail_url: item.thumbnail_url,
                  product_code: item.products?.product_code ?? null,
                  factory_status: item.factory_status,
                  factory_amount: item.factory_amount,
                  factory_unit_price: item.factory_unit_price ?? null,
                  factory_price_confirmed_at: item.factory_price_confirmed_at,
                  factory_price_locked: item.factory_price_locked ?? false,
                  variantsText: extractVariantsFromOptions(item.item_options, item.quantity)
                    .filter((v) => (v.quantity ?? 0) > 0)
                    .map((v) => `${v.color_name || ''}${v.size_name ? ' ' + v.size_name : ''} x${v.quantity}`.trim())
                    .join(', '),
                }))}
                onApply={async (workItem, payload) => {
                  const orig = items.find((i) => i.id === workItem.id);
                  if (!orig) return false;
                  const opts: { factoryAmount?: number; factoryUnitPrice?: number | null; factoryPriceMode?: string; confirm?: boolean } = {};
                  if (payload.price) {
                    opts.factoryAmount = payload.price.amount;
                    opts.factoryUnitPrice = payload.price.unitPrice;
                    opts.factoryPriceMode = payload.price.mode;
                    opts.confirm = true;
                  }
                  return await patchItemStatus(orig, payload.status, opts);
                }}
                onOpenDesign={(workItem) => setSelectedItemId(workItem.id)}
              />
            </div>
          </div>

          {/* Right Column - Factory Info */}
          <div className="space-y-4">
            {/* Order Summary for Factory */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-3">주문 요약</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">총 상품 수</span>
                  <span className="font-medium text-gray-900">{items.length}개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">총 수량</span>
                  <span className="font-medium text-gray-900">
                    {items.reduce((sum, item) => sum + item.quantity, 0)}개
                  </span>
                </div>
                {order.deadline && (
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-gray-600">마감일</span>
                    <span className="font-semibold text-red-600">{formatDate(order.deadline)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Factory Status — 품목별로 각 상품 카드에서 변경 */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-2">작업 상태</h2>
              <p className="text-sm text-gray-600">
                각 상품 카드에서 작업 상태를 변경할 수 있습니다.<br />
                &quot;작업중&quot;으로 바꿀 때 정산 단가를 한 번 확인합니다.
              </p>
            </div>


            {/* Customer Note & Attachments */}
            {(order.customer_note || order.attachment_urls.length > 0) && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                {order.customer_note && (
                  <div className={order.attachment_urls.length > 0 ? 'mb-4' : ''}>
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="w-4 h-4 text-gray-500" />
                      <h2 className="text-sm font-semibold text-gray-900">고객 요청사항</h2>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.customer_note}</p>
                  </div>
                )}
                {order.attachment_urls.length > 0 && (
                  <OrderAttachmentSection
                    orderId={order.id}
                    attachmentUrls={order.attachment_urls}
                    onUrlsUpdated={() => {}}
                    readonly
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-sm text-gray-500 text-center">
            이 페이지는 공유 링크를 통해 접근하였습니다.
          </p>
        </div>
      </footer>
    </div>
  );
}
