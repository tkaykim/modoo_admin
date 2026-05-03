'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Factory, Order } from '@/types/types';
import { Package, Calendar, Clock, Plus, Factory as FactoryIcon, RotateCcw, Search, X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import AdminOrderCreator from '@/components/orders/AdminOrderCreator';
import FactoryAllocationModal from '@/components/orders/FactoryAllocationModal';
import RefundModal from '@/components/orders/RefundModal';
import { formatKstDateLong, formatKstDateShort, formatKstMonthDay } from '@/lib/kst';
import { orderCategoryLabel } from '@/lib/order-category';
import { isAdminLike } from '@/lib/auth-helpers';

// Extended order type with items from API (now includes factory fields)
type OrderItemSummary = {
  id: string;
  purchase_order_status?: string;
  design_title?: string | null;
  thumbnail_url?: string | null;
  assigned_manufacturer_id?: string | null;
  factory_status?: string | null;
  factory_amount?: number | null;
  deadline?: string | null;
  factory_payment_date?: string | null;
  factory_payment_status?: string | null;
};
type OrderWithItemCount = Order & {
  order_items?: { count: number }[] | OrderItemSummary[];
};

function getOrderSourceInfo(order: Pick<Order, 'id' | 'order_category'>): { label: string; color: string } {
  if (order.id.startsWith('ORDER-')) {
    return { label: '관리자생성주문', color: 'bg-purple-100 text-purple-800' };
  }
  if (order.order_category === 'salesman_direct') {
    return { label: '영업직접주문', color: 'bg-emerald-100 text-emerald-800' };
  }
  return { label: '고객직접주문', color: 'bg-sky-100 text-sky-800' };
}

export default function OrdersTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();

  // Detect return from editor: /orders?resumeProductId=xxx&designId=yyy
  const resumeProductId = searchParams.get('resumeProductId');
  const resumeDesignId = searchParams.get('designId');

  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedPaymentStatuses, setSelectedPaymentStatuses] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showOrderCreator, setShowOrderCreator] = useState(!!resumeProductId && !!resumeDesignId);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [allocationOrder, setAllocationOrder] = useState<OrderWithItemCount | null>(null);
  const [refundOrder, setRefundOrder] = useState<OrderWithItemCount | null>(null);

  const isFactoryUser = user?.role === 'factory';

  // Build orders SWR key — always fetch all, filter client-side
  const ordersKey = useMemo(() => {
    if (!user) return null;
    const params = new URLSearchParams();
    if (user.role === 'factory' && user.manufacturer_id) {
      params.set('factoryId', user.manufacturer_id);
    }
    return `/api/admin/orders${params.toString() ? `?${params}` : ''}`;
  }, [user]);

  const { data: orders = [], isLoading: loading, mutate: mutateOrders } = useSWR<OrderWithItemCount[]>(ordersKey);

  // Factories: fetch for admin, compute from profile for factory user
  const { data: fetchedFactories = [] } = useSWR<Factory[]>(
    isAdminLike(user?.role) ? '/api/admin/factories' : null
  );

  const factories = useMemo(() => {
    if (isAdminLike(user?.role)) return fetchedFactories;
    if (user?.role === 'factory' && user.manufacturer_id) {
      return [{
        id: user.manufacturer_id,
        name: user.manufacturer_name || user.email || '공장',
        email: user.email || null,
        phone_number: user.phone || null,
        address: null,
        is_active: true,
        created_at: user.created_at || new Date().toISOString(),
        updated_at: user.created_at || new Date().toISOString(),
      }];
    }
    return [];
  }, [user, fetchedFactories]);

  const getShortOrderId = (id: string): string => {
    const parts = id.split('-');
    return parts[parts.length - 1] || id;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      payment_pending: 'bg-amber-100 text-amber-800',
      payment_completed: 'bg-blue-100 text-blue-800',
      in_production: 'bg-yellow-100 text-yellow-800',
      shipping: 'bg-indigo-100 text-indigo-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      partially_cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPaymentStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getFactoryPaymentStatusLabel = (status: string | null) => {
    if (!status) return '-';
    const labels: Record<string, string> = {
      pending: '대기',
      completed: '완료',
      cancelled: '취소',
    };
    return labels[status] || status;
  };

  const getFactoryPaymentStatusColor = (status: string | null) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getFactoryStatusColor = (status: string | null) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    const colors: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-800',
      assigned: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      shipped: 'bg-indigo-100 text-indigo-800',
      cancelled: 'bg-red-100 text-red-800',
      mixed: 'bg-purple-100 text-purple-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getFactoryStatusLabel = (status: string | null) => {
    if (!status) return '-';
    const labels: Record<string, string> = {
      pending: '대기중',
      assigned: '배정완료',
      in_progress: '작업중',
      completed: '작업완료',
      shipped: '출고완료',
      cancelled: '취소',
      mixed: '혼합',
    };
    return labels[status] || status;
  };

  const [updatingFactoryStatusId, setUpdatingFactoryStatusId] = useState<string | null>(null);
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [editingAmountValue, setEditingAmountValue] = useState<string>('');
  const [savingAmountId, setSavingAmountId] = useState<string | null>(null);

  const handleFactoryAmountSave = useCallback(async (orderId: string) => {
    const numValue = editingAmountValue.trim() === '' ? null : Number(editingAmountValue.replace(/,/g, ''));
    if (numValue !== null && isNaN(numValue)) {
      setErrorMessage('유효한 금액을 입력해주세요.');
      return;
    }
    setSavingAmountId(orderId);
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, factoryAmount: numValue }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '금액 저장에 실패했습니다.');
      }
      mutateOrders();
      setEditingAmountId(null);
    } catch (error) {
      console.error('Error updating factory amount:', error);
      setErrorMessage(error instanceof Error ? error.message : '금액 저장에 실패했습니다.');
    } finally {
      setSavingAmountId(null);
    }
  }, [editingAmountValue, mutateOrders]);

  const handleFactoryStatusChange = useCallback(async (orderId: string, newStatus: string) => {
    setUpdatingFactoryStatusId(orderId);
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, factoryStatus: newStatus }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '상태 변경에 실패했습니다.');
      }
      mutateOrders();
    } catch (error) {
      console.error('Error updating factory status:', error);
      setErrorMessage(error instanceof Error ? error.message : '상태 변경에 실패했습니다.');
    } finally {
      setUpdatingFactoryStatusId(null);
    }
  }, [mutateOrders]);

  const factoryMap = useMemo(() => {
    const map = new Map<string, Factory>();
    factories.forEach((factory) => map.set(factory.id, factory));
    return map;
  }, [factories]);

  const toggleStatus = useCallback((status: string) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const togglePaymentStatus = useCallback((status: string) => {
    setSelectedPaymentStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  const getSortValue = useCallback((order: OrderWithItemCount, key: string): string | number | null => {
    switch (key) {
      case 'design':
        return getDesignTitles(order).toLowerCase() || null;
      case 'id':
        return order.id;
      case 'order_source':
        return getOrderSourceInfo(order).label;
      case 'order_category':
        return order.order_category || '';
      case 'item_count': {
        const c = getOrderItemCount(order);
        return typeof c === 'number' ? c : 0;
      }
      case 'factory_status': {
        const fSum = getMyFactorySummary(order);
        return fSum.status || '';
      }
      case 'deadline': {
        const fSum1 = getMyFactorySummary(order);
        return fSum1.deadline ? new Date(fSum1.deadline).getTime() : null;
      }
      case 'factory_amount': {
        const fSum2 = getMyFactorySummary(order);
        return fSum2.amount ?? null;
      }
      case 'factory_payment_date': {
        const fSum3 = getMyFactorySummary(order);
        return fSum3.payDate ? new Date(fSum3.payDate).getTime() : null;
      }
      case 'factory_payment_status': {
        const fSum4 = getMyFactorySummary(order);
        return fSum4.payStatus || '';
      }
      case 'customer_name':
        return order.customer_name?.toLowerCase() || '';
      case 'created_at':
        return new Date(order.created_at).getTime();
      case 'total_amount':
        return order.total_amount ?? 0;
      case 'order_status':
        return order.order_status || '';
      case 'payment_status':
        return order.payment_status || '';
      case 'factory':
        return getOrderFactoryLabel(order);
      case 'design_title': {
        const items = order.order_items as { design_title?: string | null }[] | undefined;
        return items?.map(i => i.design_title).filter(Boolean).join(', ').toLowerCase() || '';
      }
      default:
        return null;
    }
  }, [factoryMap]);

  const filteredOrders = useMemo(() => {
    let result = orders;

    // Status filter (multi-select)
    if (selectedStatuses.size > 0) {
      result = result.filter((o) => {
        if (isFactoryUser) {
          const fs = getMyFactorySummary(o).status;
          return selectedStatuses.has(fs);
        }
        return selectedStatuses.has(o.order_status);
      });
    }

    // Payment status filter (multi-select)
    if (selectedPaymentStatuses.size > 0) {
      result = result.filter((o) => selectedPaymentStatuses.has(o.payment_status));
    }

    // Text search (name, email, order ID)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((o) =>
        o.id.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.customer_email?.toLowerCase().includes(q)
      );
    }

    // Sorting
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const aVal = getSortValue(a, sortKey);
        const bVal = getSortValue(b, sortKey);
        const nullA = aVal === null || aVal === '';
        const nullB = bVal === null || bVal === '';
        if (nullA && nullB) return 0;
        if (nullA) return 1;
        if (nullB) return -1;
        let cmp = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          cmp = aVal - bVal;
        } else {
          cmp = String(aVal).localeCompare(String(bVal), 'ko');
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [orders, selectedStatuses, selectedPaymentStatuses, searchQuery, isFactoryUser, sortKey, sortDir, getSortValue]);

  // Get order item count from the API response
  const getOrderItemCount = (order: OrderWithItemCount) => {
    const items = order.order_items;
    if (!items || items.length === 0) return '-';
    if ('count' in items[0]) return items[0].count;
    return items.length;
  };

  const getThumbnails = (order: OrderWithItemCount): string[] => {
    const items = order.order_items;
    if (!items || items.length === 0) return [];
    if ('count' in (items[0] || {})) return [];
    const typed = items as { thumbnail_url?: string | null }[];
    return typed.map(i => i.thumbnail_url).filter((url): url is string => !!url);
  };

  const getItemCount = (order: OrderWithItemCount): number => {
    const items = order.order_items;
    if (!items || items.length === 0) return 0;
    if ('count' in (items[0] || {})) return (items[0] as { count: number }).count;
    return items.length;
  };

  const getDesignTitles = (order: OrderWithItemCount): string => {
    const items = order.order_items;
    if (!items || items.length === 0) return '';
    if ('count' in (items[0] || {})) return '';
    const typed = items as { design_title?: string | null }[];
    return typed.map(i => i.design_title).filter(Boolean).join(', ');
  };

  // Get purchase order status summary for admin view
  const getPurchaseOrderSummary = (order: OrderWithItemCount): { label: string; color: string } => {
    const items = order.order_items;
    if (!items || items.length === 0 || ('count' in (items[0] || {}))) {
      return { label: '-', color: 'bg-gray-100 text-gray-800' };
    }
    const statuses = (items as { id: string; purchase_order_status: string }[]).map(
      (i) => i.purchase_order_status
    );
    const allOrdered = statuses.every((s) => s === 'ordered' || s === 'received');
    const allPending = statuses.every((s) => s === 'pending');
    if (allPending) return { label: '발주대기', color: 'bg-orange-100 text-orange-800' };
    if (allOrdered) return { label: '발주완료', color: 'bg-green-100 text-green-800' };
    return { label: '부분발주', color: 'bg-blue-100 text-blue-800' };
  };

  const getFactoryLabelById = (manufacturerId: string | null | undefined) => {
    if (!manufacturerId) return '미배정';
    const factory = factoryMap.get(manufacturerId);
    return factory?.name || factory?.email || manufacturerId;
  };

  const getOrderFactoryLabel = (order: OrderWithItemCount): string => {
    const items = order.order_items as OrderItemSummary[] | undefined;
    if (!items || items.length === 0) return '미배정';
    const factoryIds = [...new Set(items.map((i) => i.assigned_manufacturer_id).filter(Boolean))] as string[];
    if (factoryIds.length === 0) return '미배정';
    const firstName = getFactoryLabelById(factoryIds[0]);
    if (factoryIds.length === 1) return firstName;
    return `${firstName} 외 ${factoryIds.length - 1}곳`;
  };

  const getOrderFactoryStatus = (order: OrderWithItemCount): string | null => {
    const items = order.order_items as OrderItemSummary[] | undefined;
    if (!items || items.length === 0) return null;
    const statuses = items.map((i) => i.factory_status).filter(Boolean) as string[];
    if (statuses.length === 0) return null;
    if (statuses.every((s) => s === statuses[0])) return statuses[0];
    return 'mixed';
  };

  const getMyFactoryItems = useCallback((order: OrderWithItemCount): OrderItemSummary[] => {
    const items = order.order_items as OrderItemSummary[] | undefined;
    if (!items) return [];
    if (!user?.manufacturer_id) return items;
    return items.filter((i) => i.assigned_manufacturer_id === user.manufacturer_id);
  }, [user?.manufacturer_id]);

  const getMyFactorySummary = useCallback((order: OrderWithItemCount) => {
    const myItems = getMyFactoryItems(order);
    if (myItems.length === 0) {
      return { status: 'assigned' as string, deadline: null as string | null, amount: null as number | null, payDate: null as string | null, payStatus: null as string | null };
    }
    const statuses = myItems.map((i) => i.factory_status).filter(Boolean) as string[];
    const status = statuses.length === 0 ? 'assigned' : (statuses.every((s) => s === statuses[0]) ? statuses[0] : 'mixed');
    const deadlines = myItems.map((i) => i.deadline).filter(Boolean) as string[];
    const deadline = deadlines.length > 0 ? deadlines.sort()[0] : null;
    const amount = myItems.reduce((sum, i) => sum + (i.factory_amount ?? 0), 0) || null;
    const payDates = myItems.map((i) => i.factory_payment_date).filter(Boolean) as string[];
    const payDate = payDates.length > 0 ? payDates.sort()[0] : null;
    const payStatuses = myItems.map((i) => i.factory_payment_status).filter(Boolean) as string[];
    const payStatus = payStatuses.length === 0 ? null : (payStatuses.every((s) => s === payStatuses[0]) ? payStatuses[0] : 'mixed');
    return { status, deadline, amount, payDate, payStatus };
  }, [getMyFactoryItems]);

  const handleOrderClick = useCallback((orderId: string) => {
    router.push(`/orders/${orderId}`);
  }, [router]);

  const handleStatusChange = useCallback(async (orderId: string, newStatus: Order['order_status']) => {
    setUpdatingStatusId(orderId);
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, orderStatus: newStatus }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '주문 상태 변경에 실패했습니다.');
      }
      mutateOrders(
        orders.map((o) => (o.id === orderId ? { ...o, order_status: newStatus } : o)),
        { revalidate: false }
      );
    } catch (error) {
      console.error('Error updating order status:', error);
      setErrorMessage(error instanceof Error ? error.message : '주문 상태 변경에 실패했습니다.');
    } finally {
      setUpdatingStatusId(null);
    }
  }, [orders, mutateOrders]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-xl font-semibold text-gray-900">주문 관리</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">총 {filteredOrders.length}개의 주문</p>
        </div>
        {!isFactoryUser && (
          <button
            onClick={() => setShowOrderCreator(true)}
            className="flex items-center gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">주문 생성</span>
            <span className="sm:hidden">생성</span>
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-gray-200/60 rounded-md p-2 sm:p-3 shadow-sm space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이름, 이메일, 주문 ID 검색..."
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(isFactoryUser ? [
            { value: 'assigned', label: '배정완료' },
            { value: 'in_progress', label: '작업중' },
            { value: 'completed', label: '작업완료' },
            { value: 'shipped', label: '출고완료' },
          ] : [
            { value: 'payment_pending', label: '결제대기' },
            { value: 'payment_completed', label: '결제완료' },
            { value: 'in_production', label: '제작중' },
            { value: 'shipping', label: '배송중' },
            { value: 'delivered', label: '배송완료' },
            { value: 'cancelled', label: '취소' },
          ]).map((filter) => (
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
        {!isFactoryUser && (
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[11px] sm:text-xs text-gray-400 mr-0.5">결제</span>
            {[
              { value: 'pending', label: '입금대기' },
              { value: 'completed', label: '결제완료' },
              { value: 'failed', label: '결제실패' },
              { value: 'refunded', label: '환불' },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => togglePaymentStatus(filter.value)}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors ${
                  selectedPaymentStatuses.has(filter.value)
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
            {selectedPaymentStatuses.size > 0 && (
              <button
                onClick={() => setSelectedPaymentStatuses(new Set())}
                className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
              >
                초기화
              </button>
            )}
          </div>
        )}
      </div>

      {/* Orders List */}
      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
        {errorMessage && (
          <div className="px-4 py-3 text-xs sm:text-sm text-red-700 bg-red-50 border-b border-red-100">
            {errorMessage}
          </div>
        )}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              {isFactoryUser ? (
                // Factory user table headers
                <tr>
                  {([
                    { key: 'design', label: '디자인' },
                    { key: 'id', label: '주문 ID' },
                    { key: 'order_category', label: '주문 구분' },
                    { key: 'item_count', label: '수량' },
                    { key: 'factory_status', label: '공장 배정 상태' },
                    { key: 'deadline', label: '마감일' },
                    { key: 'factory_amount', label: '공장배정금액' },
                    { key: 'factory_payment_date', label: '결제 예정일' },
                    { key: 'factory_payment_status', label: '결제 상태' },
                  ] as const).map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              ) : (
                // Admin table headers
                <tr>
                  {([
                    { key: 'design_title', label: '디자인 제목' },
                    { key: 'id', label: '주문 ID' },
                    { key: 'order_source', label: '주문 경로' },
                    { key: 'customer_name', label: '고객 정보' },
                    { key: 'created_at', label: '주문 일시' },
                    { key: 'total_amount', label: '금액' },
                    { key: 'order_status', label: '주문 상태' },
                    { key: 'payment_status', label: '결제상태' },
                    { key: 'factory', label: '공장 배정' },
                    { key: 'factory_status', label: '배정 상태' },
                  ] as const).map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    발주
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => handleOrderClick(order.id)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  {isFactoryUser ? (
                    // Factory user row - limited info, no personal data
                    <>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const thumbs = getThumbnails(order);
                            const count = getItemCount(order);
                            if (thumbs.length === 0) {
                              return (
                                <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0">
                                  <Package className="w-5 h-5 text-gray-400" />
                                </div>
                              );
                            }
                            return (
                              <div className="relative shrink-0" style={{ width: thumbs.length > 1 ? 48 : 40, height: 40 }}>
                                {thumbs.slice(0, 2).map((thumb, i) => (
                                  <img
                                    key={i}
                                    src={thumb}
                                    alt=""
                                    className="w-10 h-10 rounded object-cover border border-gray-200 absolute top-0"
                                    style={{ left: i * 8, zIndex: thumbs.length - i }}
                                  />
                                ))}
                                {count > 1 && (
                                  <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 flex items-center justify-center leading-none px-1 min-w-[18px] z-10">
                                    {count}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <div className="text-sm text-gray-900 max-w-[140px] truncate" title={getDesignTitles(order)}>
                            {getDesignTitles(order) || <span className="text-gray-400">-</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-mono text-blue-600" title={order.id}>{getShortOrderId(order.id)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {orderCategoryLabel(order.order_category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{getOrderItemCount(order)}</span>
                      </td>
                      {(() => {
                        const fSummary = getMyFactorySummary(order);
                        const fStatus = fSummary.status;
                        const fDeadline = fSummary.deadline;
                        const fAmount = fSummary.amount;
                        const fPayDate = fSummary.payDate;
                        const fPayStatus = fSummary.payStatus;
                        return (
                          <>
                            <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              {fStatus === 'mixed' ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getFactoryStatusColor('mixed')}`}>
                                  {getFactoryStatusLabel('mixed')}
                                </span>
                              ) : (
                                <select
                                  value={fStatus}
                                  onChange={(e) => handleFactoryStatusChange(order.id, e.target.value)}
                                  disabled={updatingFactoryStatusId === order.id || fStatus === 'shipped'}
                                  className={`px-2 py-1 rounded-md text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 ${getFactoryStatusColor(fStatus)}`}
                                >
                                  <option value="assigned">배정완료</option>
                                  <option value="in_progress">작업중</option>
                                  <option value="completed">작업완료</option>
                                  <option value="shipped">출고완료</option>
                                </select>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1 text-sm text-gray-900">
                                <Clock className="w-4 h-4 text-gray-400" />
                                {formatKstDateShort(fDeadline)}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              {editingAmountId === order.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={editingAmountValue}
                                    onChange={(e) => setEditingAmountValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleFactoryAmountSave(order.id);
                                      if (e.key === 'Escape') setEditingAmountId(null);
                                    }}
                                    autoFocus
                                    className="w-24 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="금액 입력"
                                  />
                                  <button
                                    onClick={() => handleFactoryAmountSave(order.id)}
                                    disabled={savingAmountId === order.id}
                                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {savingAmountId === order.id ? '...' : '저장'}
                                  </button>
                                  <button
                                    onClick={() => setEditingAmountId(null)}
                                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingAmountId(order.id);
                                    setEditingAmountValue(fAmount ? String(fAmount) : '');
                                  }}
                                  className="text-sm font-semibold text-gray-900 hover:text-blue-600 hover:underline transition-colors"
                                >
                                  {fAmount ? `${fAmount.toLocaleString()}원` : '금액 입력'}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-sm text-gray-900">{formatKstDateShort(fPayDate)}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getFactoryPaymentStatusColor(fPayStatus)}`}>
                                {getFactoryPaymentStatusLabel(fPayStatus)}
                              </span>
                            </td>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    // Admin row - full info
                    <>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900 max-w-[160px] truncate" title={
                          (order.order_items as { design_title?: string | null }[] | undefined)
                            ?.map(i => i.design_title)
                            .filter(Boolean)
                            .join(', ') || ''
                        }>
                          {(() => {
                            const titles = (order.order_items as { design_title?: string | null }[] | undefined)
                              ?.map(i => i.design_title)
                              .filter(Boolean) as string[] | undefined;
                            if (!titles || titles.length === 0) return <span className="text-gray-400">-</span>;
                            return titles.join(', ');
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-mono text-blue-600" title={order.id}>{getShortOrderId(order.id)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {(() => {
                          const src = getOrderSourceInfo(order);
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${src.color}`}>
                              {src.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{order.customer_name}</div>
                        <div className="text-xs text-gray-500">{order.customer_email}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-gray-600">
                          {formatKstMonthDay(order.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {order.total_amount.toLocaleString()}원
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={order.order_status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value as Order['order_status'])}
                          disabled={updatingStatusId === order.id}
                          className={`px-2 py-1 rounded-md text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 ${getStatusColor(order.order_status)}`}
                        >
                          <option value="payment_pending">결제대기</option>
                          <option value="payment_completed">결제완료</option>
                          <option value="in_production">제작중</option>
                          <option value="shipping">배송중</option>
                          <option value="delivered">배송완료</option>
                          <option value="cancelled">취소</option>
                          <option value="partially_cancelled">부분취소</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(order.payment_status)}`}>
                          {{pending:'입금대기',completed:'결제완료',failed:'결제실패',refunded:'환불'}[order.payment_status] || order.payment_status}
                        </span>
                      </td>
                      {(() => {
                        const factoryLabel = getOrderFactoryLabel(order);
                        const factoryStatus = getOrderFactoryStatus(order);
                        const hasFactory = factoryLabel !== '미배정';
                        return (
                          <>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`text-sm text-gray-900 ${!hasFactory && 'text-red-500'}`}>
                                {factoryLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              {hasFactory ? (
                                factoryStatus === 'mixed' ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getFactoryStatusColor('mixed')}`}>
                                    {getFactoryStatusLabel('mixed')}
                                  </span>
                                ) : (
                                  <select
                                    value={factoryStatus || 'pending'}
                                    onChange={(e) => handleFactoryStatusChange(order.id, e.target.value)}
                                    disabled={updatingFactoryStatusId === order.id}
                                    className={`px-2 py-1 rounded-md text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 ${getFactoryStatusColor(factoryStatus)}`}
                                  >
                                    <option value="pending">대기중</option>
                                    <option value="assigned">배정완료</option>
                                    <option value="in_progress">작업중</option>
                                    <option value="completed">작업완료</option>
                                    <option value="shipped">출고완료</option>
                                    <option value="cancelled">취소</option>
                                  </select>
                                )
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                          </>
                        );
                      })()}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {(() => {
                          const ps = getPurchaseOrderSummary(order);
                          return ps.label !== '-' ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${ps.color}`}>
                              {ps.label}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setAllocationOrder(order)}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                          >
                            <FactoryIcon className="w-3 h-3" />
                            공장배정
                          </button>
                          {order.payment_status === 'completed' && (
                            <button
                              onClick={() => setRefundOrder(order)}
                              className="flex items-center gap-1 px-3 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              환불
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List */}
        <div className="md:hidden divide-y divide-gray-200">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              onClick={() => handleOrderClick(order.id)}
              className="p-3 space-y-2 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              {isFactoryUser ? (
                /* Factory user mobile card */
                <>
                  <div className="flex items-start gap-3">
                    {(() => {
                      const thumbs = getThumbnails(order);
                      const count = getItemCount(order);
                      if (thumbs.length === 0) {
                        return (
                          <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center shrink-0">
                            <Package className="w-6 h-6 text-gray-400" />
                          </div>
                        );
                      }
                      return (
                        <div className="relative shrink-0" style={{ width: thumbs.length > 1 ? 56 : 48, height: 48 }}>
                          {thumbs.slice(0, 2).map((thumb, i) => (
                            <img
                              key={i}
                              src={thumb}
                              alt=""
                              className="w-12 h-12 rounded object-cover border border-gray-200 absolute top-0"
                              style={{ left: i * 8, zIndex: thumbs.length - i }}
                            />
                          ))}
                          {count > 1 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none px-1 min-w-[18px] z-10">
                              {count}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-900 truncate" title={getDesignTitles(order)}>
                            {getDesignTitles(order) || '-'}
                          </div>
                          <div className="text-[11px] font-mono text-blue-600 truncate" title={order.id}>{getShortOrderId(order.id)}</div>
                        </div>
                        {(() => {
                          const mSummary = getMyFactorySummary(order);
                          const mfs = mSummary.status;
                          return mfs === 'mixed' ? (
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${getFactoryStatusColor('mixed')}`}>
                              {getFactoryStatusLabel('mixed')}
                            </span>
                          ) : (
                            <div onClick={(e) => e.stopPropagation()}>
                              <select
                                value={mfs}
                                onChange={(e) => handleFactoryStatusChange(order.id, e.target.value)}
                                disabled={updatingFactoryStatusId === order.id || mfs === 'shipped'}
                                className={`px-1.5 py-0.5 rounded text-[11px] font-medium border-0 cursor-pointer disabled:opacity-60 ${getFactoryStatusColor(mfs)}`}
                              >
                                <option value="assigned">배정완료</option>
                                <option value="in_progress">작업중</option>
                                <option value="completed">작업완료</option>
                                <option value="shipped">출고완료</option>
                              </select>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                    <span>{orderCategoryLabel(order.order_category)}</span>
                    <span>수량: {getOrderItemCount(order)}</span>
                    {(() => {
                      const mfa = getMyFactorySummary(order).amount;
                      return (
                        <span onClick={(e) => e.stopPropagation()}>
                          {editingAmountId === order.id ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="text"
                                value={editingAmountValue}
                                onChange={(e) => setEditingAmountValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleFactoryAmountSave(order.id);
                                  if (e.key === 'Escape') setEditingAmountId(null);
                                }}
                                autoFocus
                                className="w-20 px-1.5 py-0.5 text-[11px] border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="금액"
                              />
                              <button
                                onClick={() => handleFactoryAmountSave(order.id)}
                                disabled={savingAmountId === order.id}
                                className="px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded disabled:opacity-50"
                              >
                                {savingAmountId === order.id ? '...' : '저장'}
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingAmountId(order.id);
                                setEditingAmountValue(mfa ? String(mfa) : '');
                              }}
                              className="font-medium text-gray-700 hover:text-blue-600 hover:underline"
                            >
                              {mfa ? `${mfa.toLocaleString()}원` : '금액 입력'}
                            </button>
                          )}
                        </span>
                      );
                    })()}
                  </div>
                  {(() => {
                    const mSummary3 = getMyFactorySummary(order);
                    return (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />마감: {formatKstDateShort(mSummary3.deadline)}</span>
                        <span>결제: {formatKstDateShort(mSummary3.payDate)}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getFactoryPaymentStatusColor(mSummary3.payStatus)}`}>
                          {getFactoryPaymentStatusLabel(mSummary3.payStatus)}
                        </span>
                      </div>
                    );
                  })()}
                </>
              ) : (
                /* Admin mobile card */
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="text-xs font-medium text-gray-900 truncate">{order.customer_name}</div>
                        {(() => {
                          const src = getOrderSourceInfo(order);
                          return (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${src.color}`}>
                              {src.label}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">{order.customer_email}</div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <select
                        value={order.order_status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value as any)}
                        disabled={updatingStatusId === order.id}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium border-0 cursor-pointer disabled:opacity-60 ${getStatusColor(order.order_status)}`}
                      >
                        <option value="payment_pending">결제대기</option>
                        <option value="payment_completed">결제완료</option>
                        <option value="in_production">제작중</option>
                        <option value="shipping">배송중</option>
                        <option value="delivered">배송완료</option>
                        <option value="cancelled">취소</option>
                        <option value="partially_cancelled">부분취소</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                    <span>{orderCategoryLabel(order.order_category)}</span>
                    <span className="font-medium text-gray-700">{order.total_amount.toLocaleString()}원</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getPaymentStatusColor(order.payment_status)}`}>{{pending:'입금대기',completed:'결제완료',failed:'결제실패',refunded:'환불'}[order.payment_status] || order.payment_status}</span>
                    {(() => {
                      const ps = getPurchaseOrderSummary(order);
                      return ps.label !== '-' ? (
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${ps.color}`}>{ps.label}</span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatKstDateLong(order.created_at)}</span>
                    {(() => {
                      const fl = getOrderFactoryLabel(order);
                      const fs = getOrderFactoryStatus(order);
                      const hasF = fl !== '미배정';
                      return (
                        <>
                          <span className={!hasF ? 'text-red-500' : ''}>{fl}</span>
                          {hasF && (
                            fs === 'mixed' ? (
                              <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${getFactoryStatusColor('mixed')}`}>
                                {getFactoryStatusLabel('mixed')}
                              </span>
                            ) : (
                              <div onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={fs || 'pending'}
                                  onChange={(e) => handleFactoryStatusChange(order.id, e.target.value)}
                                  disabled={updatingFactoryStatusId === order.id}
                                  className={`px-1.5 py-0.5 rounded text-[11px] font-medium border-0 cursor-pointer disabled:opacity-60 ${getFactoryStatusColor(fs)}`}
                                >
                                  <option value="pending">대기중</option>
                                  <option value="assigned">배정완료</option>
                                  <option value="in_progress">작업중</option>
                                  <option value="completed">작업완료</option>
                                  <option value="shipped">출고완료</option>
                                  <option value="cancelled">취소</option>
                                </select>
                              </div>
                            )
                          )}
                        </>
                      );
                    })()}
                    <span>{order.shipping_method === 'domestic' ? '국내배송' : order.shipping_method === 'international' ? '해외배송' : '픽업'}{order.shipping_method !== 'pickup' && order.address_line_1 ? ` · ${order.address_line_1}` : ''}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex-1" />
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setAllocationOrder(order); }}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                      >
                        <FactoryIcon className="w-3 h-3" />
                        공장배정
                      </button>
                      {order.payment_status === 'completed' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setRefundOrder(order); }}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          환불
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <Package className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2">주문이 없습니다</h3>
            <p className="text-xs sm:text-sm text-gray-500">새로운 주문이 들어오면 여기에 표시됩니다.</p>
          </div>
        )}
      </div>

      {/* Order Creator Modal */}
      {showOrderCreator && (
        <AdminOrderCreator
          onClose={() => {
            setShowOrderCreator(false);
            if (resumeProductId || resumeDesignId) {
              router.replace('/orders');
            }
          }}
          onSuccess={() => {
            if (resumeProductId || resumeDesignId) {
              router.replace('/orders');
            }
            mutateOrders();
          }}
          initialProductId={resumeProductId ?? undefined}
          initialDesignId={resumeDesignId ?? undefined}
        />
      )}

      {/* Factory Allocation Modal */}
      {allocationOrder && (
        <FactoryAllocationModal
          order={allocationOrder}
          factories={factories}
          onClose={() => setAllocationOrder(null)}
          onSuccess={() => {
            setAllocationOrder(null);
            mutateOrders();
          }}
        />
      )}

      {/* Refund Modal */}
      {refundOrder && (
        <RefundModal
          order={refundOrder}
          onClose={() => setRefundOrder(null)}
          onSuccess={() => {
            setRefundOrder(null);
            mutateOrders();
          }}
        />
      )}
    </div>
  );
}
