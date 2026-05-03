'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { OrderItem, Order } from '@/types/types';
import {
  ClipboardList,
  Search,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Calendar,
  Package,
  LayoutList,
  BarChart3,
  Factory,
} from 'lucide-react';
import { formatKstDateTimeMedium, formatKstMonthDay } from '@/lib/kst';
import ConfirmPurchaseOrderModal from '@/components/orders/ConfirmPurchaseOrderModal';

type OrderWithManufacturer = Pick<Order, 'id' | 'customer_name' | 'customer_email' | 'order_status' | 'created_at'>;

type PurchaseOrderItemWithOrder = OrderItem & {
  orders: OrderWithManufacturer;
};

type ViewMode = 'orders' | 'summary';

const STATUS_OPTIONS = [
  { value: 'pending', label: '발주대기', color: 'bg-orange-100 text-orange-800' },
  { value: 'ordered', label: '발주완료', color: 'bg-blue-100 text-blue-800' },
  { value: 'received', label: '입고완료', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: '취소', color: 'bg-red-100 text-red-800' },
] as const;

const getStatusColor = (status: string) => {
  return STATUS_OPTIONS.find((s) => s.value === status)?.color || 'bg-gray-100 text-gray-800';
};

const getStatusLabel = (status: string) => {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label || status;
};

import { extractVariants, type VariantInfo } from '@/lib/orderUtils';

function ColorDot({ hex }: { hex?: string }) {
  if (!hex) return null;
  return (
    <span
      className="inline-block w-3 h-3 rounded-full border border-gray-300 shrink-0"
      style={{ backgroundColor: hex }}
    />
  );
}

function ImagePreviewModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="relative max-w-3xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-8 h-8 flex items-center justify-center bg-white rounded-full shadow-lg text-gray-600 hover:text-gray-900 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        <img
          src={src}
          alt={alt}
          className="w-full h-auto max-h-[85vh] object-contain rounded-lg shadow-2xl bg-white"
        />
        {alt && (
          <p className="text-center text-sm text-white/80 mt-3">{alt}</p>
        )}
      </div>
    </div>
  );
}

export default function PurchaseOrdersTab() {
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateType, setDateType] = useState<'ordered' | 'created'>('created');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('orders');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [confirmItems, setConfirmItems] = useState<{ id: string; product_title: string; quantity: number }[] | null>(null);

  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedStatuses.size === 1) {
      params.set('status', [...selectedStatuses][0]);
    }
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (dateFrom) {
      params.set('dateFrom', dateFrom);
      params.set('dateType', dateType);
    }
    if (dateTo) {
      params.set('dateTo', dateTo);
      params.set('dateType', dateType);
    }
    const qs = params.toString();
    return `/api/admin/purchase-orders${qs ? `?${qs}` : ''}`;
  }, [selectedStatuses, searchQuery, dateFrom, dateTo, dateType]);

  const {
    data: items = [],
    isLoading,
    mutate,
  } = useSWR<PurchaseOrderItemWithOrder[]>(swrKey);

  const filteredItems = useMemo(() => {
    if (selectedStatuses.size <= 1) return items;
    return items.filter((item) => selectedStatuses.has(item.purchase_order_status));
  }, [items, selectedStatuses]);

  const groupedByOrder = useMemo(() => {
    const map = new Map<
      string,
      { order: PurchaseOrderItemWithOrder['orders']; items: PurchaseOrderItemWithOrder[] }
    >();
    for (const item of filteredItems) {
      const orderId = item.order_id;
      if (!map.has(orderId)) {
        map.set(orderId, { order: item.orders, items: [] });
      }
      map.get(orderId)!.items.push(item);
    }
    return map;
  }, [filteredItems]);

  const summaryData = useMemo(() => {
    const map = new Map<string, { productTitle: string; variants: Map<string, { colorName?: string; colorHex?: string; colorCode?: string; sizeName?: string; totalQty: number; pendingQty: number }> }>();
    for (const item of filteredItems) {
      const variants = extractVariants(item);
      for (const v of variants) {
        const qty = v.quantity ?? item.quantity ?? 1;
        if (qty === 0) continue;
        const productKey = item.product_title;
        if (!map.has(productKey)) {
          map.set(productKey, { productTitle: productKey, variants: new Map() });
        }
        const variantKey = `${v.color_name || '-'}_${v.size_name || '-'}`;
        const entry = map.get(productKey)!;
        const existing = entry.variants.get(variantKey);
        if (existing) {
          existing.totalQty += qty;
          if (item.purchase_order_status === 'pending') existing.pendingQty += qty;
        } else {
          entry.variants.set(variantKey, {
            colorName: v.color_name,
            colorHex: v.color_hex,
            colorCode: v.color_code,
            sizeName: v.size_name,
            totalQty: qty,
            pendingQty: item.purchase_order_status === 'pending' ? qty : 0,
          });
        }
      }
    }
    return map;
  }, [filteredItems]);

  const toggleStatus = useCallback((status: string) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  }, [filteredItems, selectedIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleOrderExpand = useCallback((orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const handleBulkStatusChange = useCallback(
    async (newStatus: string) => {
      if (selectedIds.size === 0) return;
      const ids = [...selectedIds];
      setUpdatingIds(new Set(ids));
      setErrorMessage(null);
      try {
        const response = await fetch('/api/admin/purchase-orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderItemIds: ids, status: newStatus }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || '상태 변경에 실패했습니다.');
        }
        setSelectedIds(new Set());
        mutate();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '상태 변경에 실패했습니다.');
      } finally {
        setUpdatingIds(new Set());
      }
    },
    [selectedIds, mutate]
  );

  const handleSingleStatusChange = useCallback(
    async (itemId: string, newStatus: string) => {
      // 발주완료(ordered)로 변경 시 단가 입력 모달
      if (newStatus === 'ordered') {
        const item = items.find((i) => i.id === itemId);
        if (item) {
          setConfirmItems([{ id: item.id, product_title: item.product_title, quantity: item.quantity }]);
          return;
        }
      }
      setUpdatingIds((prev) => new Set(prev).add(itemId));
      setErrorMessage(null);
      try {
        const response = await fetch('/api/admin/purchase-orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderItemIds: [itemId], status: newStatus }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || '상태 변경에 실패했습니다.');
        }
        mutate();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '상태 변경에 실패했습니다.');
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [mutate, items]
  );

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return formatKstMonthDay(dateString);
  };

  const formatDateTime = (dateString: string) => formatKstDateTimeMedium(dateString);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pendingCount = filteredItems.filter((i) => i.purchase_order_status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-xl font-semibold text-gray-900">발주 관리</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            총 {filteredItems.length}건
            {pendingCount > 0 && (
              <span className="text-orange-600 font-medium ml-1">
                (발주대기 {pendingCount}건)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
          <button
            onClick={() => setViewMode('orders')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              viewMode === 'orders' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            주문건별
          </button>
          <button
            onClick={() => setViewMode('summary')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              viewMode === 'summary' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            제품 요약
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200/60 rounded-md p-2 sm:p-3 shadow-sm space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="제품명, 주문 ID 검색..."
              className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={dateType}
              onChange={(e) => setDateType(e.target.value as 'ordered' | 'created')}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="created">주문일 기준</option>
              <option value="ordered">발주일 기준</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">~</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_OPTIONS.filter((s) => s.value !== 'cancelled').map((filter) => (
            <button
              key={filter.value}
              onClick={() => toggleStatus(filter.value)}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors ${
                selectedStatuses.has(filter.value)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
          {selectedStatuses.size > 0 && (
            <button
              onClick={() => setSelectedStatuses(new Set())}
              className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions */}
      {viewMode === 'orders' && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          <span className="text-xs font-medium text-blue-800">
            {selectedIds.size}건 선택됨
          </span>
          <div className="flex-1" />
          <button
            onClick={() => {
              const selected = items.filter((i) => selectedIds.has(i.id));
              setConfirmItems(selected.map((i) => ({ id: i.id, product_title: i.product_title, quantity: i.quantity })));
            }}
            className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            발주 확정 (단가 입력)
          </button>
          <button
            onClick={() => handleBulkStatusChange('received')}
            className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            입고완료 처리
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 rounded transition-colors"
          >
            취소
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="px-4 py-3 text-xs sm:text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {errorMessage}
        </div>
      )}

      {/* Main Content */}
      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
        {viewMode === 'orders' ? (
          <OrdersView
            groupedByOrder={groupedByOrder}
            expandedOrders={expandedOrders}
            toggleOrderExpand={toggleOrderExpand}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            updatingIds={updatingIds}
            handleSingleStatusChange={handleSingleStatusChange}
            formatDate={formatDate}
            formatDateTime={formatDateTime}
            filteredItems={filteredItems}
            onImageClick={(src, alt) => setPreviewImage({ src, alt })}
          />
        ) : (
          <SummaryView summaryData={summaryData} />
        )}

        {filteredItems.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <ClipboardList className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2">
              발주 항목이 없습니다
            </h3>
            <p className="text-xs sm:text-sm text-gray-500">
              조건에 맞는 발주 항목이 없습니다.
            </p>
          </div>
        )}
      </div>

      {previewImage && (
        <ImagePreviewModal
          src={previewImage.src}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {confirmItems && confirmItems.length > 0 && (
        <ConfirmPurchaseOrderModal
          items={confirmItems}
          onClose={() => setConfirmItems(null)}
          onSuccess={() => {
            setConfirmItems(null);
            setSelectedIds(new Set());
            mutate();
          }}
        />
      )}
    </div>
  );
}

function OrdersView({
  groupedByOrder,
  expandedOrders,
  toggleOrderExpand,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  updatingIds,
  handleSingleStatusChange,
  formatDate,
  formatDateTime,
  filteredItems,
  onImageClick,
}: {
  groupedByOrder: Map<string, { order: PurchaseOrderItemWithOrder['orders']; items: PurchaseOrderItemWithOrder[] }>;
  expandedOrders: Set<string>;
  toggleOrderExpand: (orderId: string) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  updatingIds: Set<string>;
  handleSingleStatusChange: (itemId: string, status: string) => void;
  formatDate: (d: string | null) => string;
  formatDateTime: (d: string) => string;
  filteredItems: PurchaseOrderItemWithOrder[];
  onImageClick: (src: string, alt: string) => void;
}) {
  if (groupedByOrder.size === 0) return null;

  return (
    <div className="divide-y divide-gray-200">
      {/* Select all header */}
      <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
        <input
          type="checkbox"
          checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
          onChange={toggleSelectAll}
          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-[11px] text-gray-500">전체 선택</span>
      </div>

      {[...groupedByOrder.entries()].map(([orderId, { order, items }]) => {
        const isExpanded = expandedOrders.has(orderId) || groupedByOrder.size <= 5;
        const allPending = items.every((i) => i.purchase_order_status === 'pending');
        const allDone = items.every(
          (i) => i.purchase_order_status === 'ordered' || i.purchase_order_status === 'received'
        );

        return (
          <div key={orderId}>
            {/* Order Header */}
            <div
              onClick={() => toggleOrderExpand(orderId)}
              className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs font-mono text-blue-600">{orderId}</span>
                <span className="text-xs text-gray-700 font-medium truncate">
                  {order.customer_name}
                </span>
                <span className="text-[11px] text-gray-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(order.created_at)}
                </span>
                <span className="text-[11px] text-gray-400">{items.length}개 아이템</span>
                {(() => {
                  const factoryIds = [...new Set(items.map((i) => i.assigned_manufacturer_id).filter(Boolean))] as string[];
                  const factoryNames = items
                    .filter((i) => i.assigned_manufacturer_id && i.manufacturers)
                    .map((i) => i.manufacturers!.name);
                  const uniqueNames = [...new Set(factoryNames)];
                  const hasFactory = factoryIds.length > 0;
                  const label = uniqueNames.length === 0
                    ? (hasFactory ? '공장' : '공장배정전')
                    : uniqueNames.length === 1
                    ? uniqueNames[0]
                    : `${uniqueNames[0]} 외 ${uniqueNames.length - 1}곳`;
                  return (
                    <span className={`inline-flex items-center gap-1 text-[11px] ${hasFactory ? 'text-indigo-600' : 'text-red-500'}`}>
                      <Factory className="w-3 h-3" />
                      {label}
                    </span>
                  );
                })()}
              </div>
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                  allPending
                    ? 'bg-orange-100 text-orange-800'
                    : allDone
                    ? 'bg-green-100 text-green-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {allPending ? '발주대기' : allDone ? '발주완료' : '부분발주'}
              </span>
            </div>

            {/* Order Items */}
            {isExpanded && (
              <div className="bg-gray-50/50">
                {items.map((item) => {
                  const variants = extractVariants(item);
                  const isUpdating = updatingIds.has(item.id);

                  return (
                    <div
                      key={item.id}
                      className="px-3 py-2 ml-6 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0 self-start sm:self-center mt-0.5 sm:mt-0"
                      />

                      {/* Thumbnail */}
                      {item.thumbnail_url && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onImageClick(item.thumbnail_url!, item.design_title || item.product_title);
                          }}
                          className="shrink-0 rounded overflow-hidden border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-zoom-in"
                        >
                          <img
                            src={item.thumbnail_url}
                            alt=""
                            className="w-10 h-10 object-cover"
                          />
                        </button>
                      )}

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {item.product_title}
                          {item.products?.product_code && (
                            <span className="text-gray-400 font-normal ml-1">
                              ({item.products.product_code})
                            </span>
                          )}
                        </div>
                        {item.design_title && (
                          <div className="text-[11px] text-purple-600 truncate mt-0.5">
                            {item.design_title}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {variants.filter(v => (v.quantity ?? 0) > 0).map((v, vi) => (
                            <span
                              key={vi}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600"
                            >
                              <ColorDot hex={v.color_hex} />
                              {v.color_name && <span>{v.color_name}</span>}
                              {v.size_name && <span>{v.size_name}</span>}
                              <span className="font-medium">x{v.quantity ?? item.quantity}</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Ordered Date */}
                      <div className="text-[11px] text-gray-400 shrink-0">
                        {item.purchase_ordered_at
                          ? `발주: ${formatDate(item.purchase_ordered_at)}`
                          : ''}
                      </div>

                      {/* Status Dropdown */}
                      <select
                        value={item.purchase_order_status}
                        onChange={(e) => handleSingleStatusChange(item.id, e.target.value)}
                        disabled={isUpdating}
                        onClick={(e) => e.stopPropagation()}
                        className={`px-2 py-1 rounded-md text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 shrink-0 ${getStatusColor(
                          item.purchase_order_status
                        )}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryView({
  summaryData,
}: {
  summaryData: Map<string, { productTitle: string; variants: Map<string, { colorName?: string; colorHex?: string; colorCode?: string; sizeName?: string; totalQty: number; pendingQty: number }> }>;
}) {
  if (summaryData.size === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              제품
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              색상
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              사이즈
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              총 수량
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              발주대기
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {[...summaryData.entries()].map(([productKey, { productTitle, variants }]) =>
            [...variants.entries()].map(([variantKey, v], vi) => (
              <tr key={`${productKey}-${variantKey}`} className="hover:bg-gray-50">
                {vi === 0 ? (
                  <td
                    className="px-4 py-2.5 text-sm font-medium text-gray-900"
                    rowSpan={variants.size}
                  >
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400 shrink-0" />
                      {productTitle}
                    </div>
                  </td>
                ) : null}
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                    <ColorDot hex={v.colorHex} />
                    {v.colorName || '-'}
                    {v.colorCode && (
                      <span className="text-[11px] text-gray-400">({v.colorCode})</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-sm text-gray-700">{v.sizeName || '-'}</td>
                <td className="px-4 py-2.5 text-sm text-gray-900 text-right font-medium">
                  {v.totalQty}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {v.pendingQty > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      {v.pendingQty}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <Check className="w-3 h-3 mr-0.5" />
                      완료
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
