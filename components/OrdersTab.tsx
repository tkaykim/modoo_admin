'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Factory, Order } from '@/types/types';
import { Package, Calendar, Clock, Plus, Factory as FactoryIcon, RotateCcw, Search, X, ArrowUp, ArrowDown, ArrowUpDown, Trash2, ExternalLink } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import AdminOrderCreator from '@/components/orders/AdminOrderCreator';
import FactoryAllocationModal from '@/components/orders/FactoryAllocationModal';
import RefundModal from '@/components/orders/RefundModal';
import DeleteOrderModal from '@/components/orders/DeleteOrderModal';
import FactoryPriceConfirmModal, { type FactoryPriceResult } from '@/components/factory/FactoryPriceConfirmModal';
import { formatKstDateLong, formatKstDateShort, formatKstMonthDay } from '@/lib/kst';
import { orderCategoryLabel } from '@/lib/order-category';
import { isAdminLike } from '@/lib/auth-helpers';
import { checkPhone } from '@/lib/phone';
import { isNaverUnifiedOrder } from '@/lib/naver-commerce/unified-orders';

// Extended order type with items from API (now includes factory fields)
type OrderItemSummary = {
  id: string;
  purchase_order_status?: string;
  product_title?: string | null;
  design_title?: string | null;
  thumbnail_url?: string | null;
  quantity?: number | null;
  assigned_manufacturer_id?: string | null;
  factory_assigned_at?: string | null;
  factory_status?: string | null;
  factory_amount?: number | null;
  factory_unit_price?: number | null;
  factory_price_confirmed_at?: string | null;
  factory_price_locked?: boolean | null;
  deadline?: string | null;
  factory_payment_date?: string | null;
  factory_payment_status?: string | null;
};
type OrderWithItemCount = Order & {
  paid_at?: string | null;
  order_items?: { count: number }[] | OrderItemSummary[];
  partner_mall?: { id: string; name: string | null; slug: string | null } | null;
  order_source?: 'naver_smartstore';
  external_order_id?: string;
  naver_management_href?: string;
  naver_status_label?: string;
  naver_product_summary?: string;
  naver_option_summary?: string;
};

// 주문 처리 담당자 — orders.salesman_id(영업담당자)와 완전히 다른 개념이다.
type AssignmentRow = {
  order_id: string;
  assignee_profile_id: string | null;
  assignee_name: string | null;
  version: number;
  updated_at: string;
};
type AssignmentPayload = {
  enabled: boolean;
  can_claim: boolean;
  can_assign_others: boolean;
  viewer_id: string;
  viewer_name: string | null;
  assignments: AssignmentRow[];
};
type AssigneeOption = { id: string; name: string | null; email: string | null };
type StaffFilter = 'all' | 'mine' | 'unassigned';

const ORDER_SOURCE_FILTERS = [
  { value: 'naver_smartstore', label: '네이버 스마트스토어' },
  { value: 'partner_mall', label: '영업몰고객주문' },
  { value: 'salesman_direct', label: '영업직접주문' },
  { value: 'admin_created', label: '관리자생성' },
  { value: 'customer_direct', label: '고객직접' },
  { value: 'quick', label: '간이주문' },
  { value: 'surcharge', label: '차액주문' },
] as const;

type OrderSourceKey = typeof ORDER_SOURCE_FILTERS[number]['value'];

/**
 * 연락처 형식이 깨진 주문 — 목록에서 바로 눈에 띄게 한다.
 * 고객 오타(0104931766 등)로 연락이 닿지 않는 주문을 배송 전에 잡아내기 위함이다.
 * 값이 아예 비어 있는 옛 주문까지 빨갛게 칠하면 소음이 되므로, 입력은 됐는데 형식이 틀린 건만 표시한다.
 */
function hasBadContact(order: Pick<Order, 'customer_phone' | 'recipient_phone'>): boolean {
  const candidates = [order.customer_phone, order.recipient_phone].filter(
    (value): value is string => !!value && value.trim() !== ''
  );
  return candidates.some((value) => checkPhone(value).blocking);
}

function getOrderSourceInfo(
  order: Pick<OrderWithItemCount, 'id' | 'order_category' | 'partner_mall_id' | 'partner_mall' | 'order_source'>
): { label: string; color: string } {
  if (isNaverUnifiedOrder(order)) {
    return { label: '네이버 스마트스토어', color: 'bg-green-100 text-green-800' };
  }
  if (order.order_category === 'surcharge') {
    return { label: '차액주문', color: 'bg-orange-100 text-orange-800' };
  }
  if (order.order_category === 'quick') {
    return { label: '간이주문', color: 'bg-amber-100 text-amber-800' };
  }
  if (order.id.startsWith('ORDER-')) {
    return { label: '관리자생성주문', color: 'bg-purple-100 text-purple-800' };
  }
  if (order.order_category === 'salesman_direct') {
    return { label: '영업직접주문', color: 'bg-emerald-100 text-emerald-800' };
  }
  if (order.partner_mall_id) {
    return { label: '영업몰고객주문', color: 'bg-teal-100 text-teal-800' };
  }
  return { label: '고객직접주문', color: 'bg-sky-100 text-sky-800' };
}

function getOrderSourceKey(
  order: Pick<OrderWithItemCount, 'id' | 'order_category' | 'partner_mall_id' | 'order_source'>
): OrderSourceKey {
  if (isNaverUnifiedOrder(order)) return 'naver_smartstore';
  if (order.order_category === 'surcharge') return 'surcharge';
  if (order.order_category === 'quick') return 'quick';
  if (order.id.startsWith('ORDER-')) return 'admin_created';
  if (order.order_category === 'salesman_direct') return 'salesman_direct';
  if (order.partner_mall_id) return 'partner_mall';
  return 'customer_direct';
}

function hasUnassignedFactoryItem(order: OrderWithItemCount): boolean {
  const items = order.order_items;
  if (!items || items.length === 0 || 'count' in items[0]) return false;
  return (items as OrderItemSummary[]).some((item) => !item.assigned_manufacturer_id);
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
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showOrderCreator, setShowOrderCreator] = useState(!!resumeProductId && !!resumeDesignId);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [allocationOrder, setAllocationOrder] = useState<OrderWithItemCount | null>(null);
  const [refundOrder, setRefundOrder] = useState<OrderWithItemCount | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<OrderWithItemCount | null>(null);
  const isSuperAdmin = user?.role === 'super_admin';

  const isFactoryUser = user?.role === 'factory';

  // Build orders SWR key — always fetch all, filter client-side
  const ordersKey = useMemo(() => {
    if (!user) return null;
    const params = new URLSearchParams();
    if (user.role === 'factory' && user.manufacturer_id) {
      params.set('factoryId', user.manufacturer_id);
    } else {
      params.set('includeNaver', '1');
    }
    return `/api/admin/orders${params.toString() ? `?${params}` : ''}`;
  }, [user]);

  const { data: orders = [], isLoading: loading, mutate: mutateOrders } = useSWR<OrderWithItemCount[]>(ordersKey);

  // ── 주문 처리 담당자 (영업담당자와 별개 개념) ──────────────────────────────
  // 주문 목록과 분리된 훅이다. 이쪽이 실패해도 주문 목록은 그대로 보여야 한다.
  const {
    data: assignmentPayload,
    error: assignmentError,
    isLoading: assignmentLoading,
    mutate: mutateAssignments,
  } = useSWR<AssignmentPayload>(
    !isFactoryUser && user ? '/api/admin/order-assignments' : null,
    // 두 담당자가 동시에 보는 화면이라 전역 설정(revalidateOnFocus:false)을 여기서만 뒤집는다.
    { revalidateOnFocus: true, refreshInterval: 30000 },
  );

  const assignmentFeatureOn = !isFactoryUser && assignmentPayload?.enabled === true;
  // 로딩 중이거나 실패했으면 '미배정'으로 단정하지 않는다.
  const assignmentReady = assignmentFeatureOn && !assignmentError && !assignmentLoading;
  const canClaim = assignmentPayload?.can_claim === true;
  const canAssignOthers = assignmentPayload?.can_assign_others === true;

  const assignmentByOrderId = useMemo(() => {
    const map = new Map<string, AssignmentRow>();
    (assignmentPayload?.assignments ?? []).forEach((row) => map.set(row.order_id, row));
    return map;
  }, [assignmentPayload]);

  // 자식(차액) 주문은 자체 배정 행을 만들지 않고 부모 주문의 담당자를 따른다.
  const getAssignment = useCallback(
    (order: OrderWithItemCount): AssignmentRow | null =>
      assignmentByOrderId.get(order.parent_order_id ?? order.id) ?? null,
    [assignmentByOrderId],
  );

  const [staffFilter, setStaffFilter] = useState<StaffFilter>('all');
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);

  const { data: assigneePayload } = useSWR<{ assignees: AssigneeOption[] }>(
    assignmentFeatureOn && canAssignOthers ? '/api/admin/order-assignees' : null,
  );
  const assigneeOptions = useMemo(() => assigneePayload?.assignees ?? [], [assigneePayload]);

  const runAssignmentAction = useCallback(
    async (orderId: string, body: Record<string, unknown>) => {
      setAssigningOrderId(orderId);
      setErrorMessage(null);
      try {
        const res = await fetch(`/api/admin/order-assignments/${encodeURIComponent(orderId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorMessage(payload?.error || '담당자를 변경하지 못했습니다.');
        }
      } catch {
        setErrorMessage('담당자를 변경하지 못했습니다.');
      } finally {
        // 성공이든 충돌이든 최신 상태로 맞춘다.
        await mutateAssignments();
        setAssigningOrderId(null);
      }
    },
    [mutateAssignments],
  );

  const handleClaim = useCallback(
    (orderId: string) => runAssignmentAction(orderId, { action: 'claim' }),
    [runAssignmentAction],
  );

  const handleRelease = useCallback(
    (orderId: string, version: number) => runAssignmentAction(orderId, { action: 'release', expected_version: version }),
    [runAssignmentAction],
  );

  const handleAssignTo = useCallback(
    (orderId: string, assigneeProfileId: string, version: number) =>
      runAssignmentAction(orderId, {
        action: 'assign',
        assignee_profile_id: assigneeProfileId,
        expected_version: version,
      }),
    [runAssignmentAction],
  );

  const viewerId = assignmentPayload?.viewer_id ?? user?.id ?? null;

  /**
   * 담당자 칩(select)에 넣을 항목.
   * 일반 관리자는 본인에게만 배정할 수 있으므로 본인만, super_admin 은 배정 후보 전원.
   * 현재 담당자가 목록 밖(예: 관리자가 보는 타인 담당)이면 표시가 비지 않도록 끼워 넣는다.
   */
  const getAssigneeChoices = useCallback(
    (current: AssignmentRow | null) => {
      const choices: { id: string; label: string }[] = [];
      if (canAssignOthers) {
        assigneeOptions.forEach((o) => choices.push({ id: o.id, label: o.name || o.email || '이름 없음' }));
      } else if (canClaim && viewerId) {
        choices.push({ id: viewerId, label: assignmentPayload?.viewer_name || user?.name || '나' });
      }
      const currentId = current?.assignee_profile_id;
      if (currentId && !choices.some((c) => c.id === currentId)) {
        choices.push({ id: currentId, label: current?.assignee_name || '현재 담당자' });
      }
      return choices;
    },
    [canAssignOthers, canClaim, assigneeOptions, viewerId, assignmentPayload?.viewer_name, user?.name],
  );

  /** 칩에서 고른 값에 따라 claim · release · assign 중 알맞은 전이를 부른다. */
  const handleAssigneeSelect = useCallback(
    (order: OrderWithItemCount, nextId: string) => {
      const current = getAssignment(order);
      const currentId = current?.assignee_profile_id ?? '';
      const version = current?.version ?? 0;
      if (nextId === currentId) return;
      if (!nextId) {
        void handleRelease(order.id, version);
        return;
      }
      if (nextId === viewerId && !currentId) {
        void handleClaim(order.id);
        return;
      }
      void handleAssignTo(order.id, nextId, version);
    },
    [getAssignment, handleRelease, handleClaim, handleAssignTo, viewerId],
  );

  const sourceCounts = useMemo(() => {
    const counts = ORDER_SOURCE_FILTERS.reduce((acc, filter) => {
      acc[filter.value] = 0;
      return acc;
    }, {} as Record<OrderSourceKey, number>);

    orders.forEach((order) => {
      const key = getOrderSourceKey(order);
      counts[key] += 1;
    });

    return counts;
  }, [orders]);
  const partnerMallOrderCount = sourceCounts.partner_mall ?? 0;

  const staffCounts = useMemo(() => {
    if (!assignmentReady) return { mine: 0, unassigned: 0 };
    let mine = 0;
    let unassigned = 0;
    orders.forEach((order) => {
      if (isNaverUnifiedOrder(order)) return;
      const assignment = getAssignment(order);
      if (assignment?.assignee_profile_id && assignment.assignee_profile_id === user?.id) mine += 1;
      else if (!assignment?.assignee_profile_id && order.parent_order_id == null) unassigned += 1;
    });
    return { mine, unassigned };
  }, [orders, assignmentReady, getAssignment, user?.id]);

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
  const [pendingFactoryStart, setPendingFactoryStart] = useState<{
    orderId: string;
    item: OrderItemSummary;
  } | null>(null);

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
    const order = orders.find((o) => o.id === orderId);
    const orderItems = (order?.order_items || []) as OrderItemSummary[];
    const factoryItems =
      user?.role === 'factory' && user.manufacturer_id
        ? orderItems.filter((item) => item.assigned_manufacturer_id === user.manufacturer_id)
        : orderItems;

    if (isFactoryUser && newStatus === 'in_progress') {
      if (factoryItems.length !== 1) {
        router.push(`/orders/${orderId}`);
        return;
      }

      const [item] = factoryItems;
      if (!item.factory_price_locked) {
        setPendingFactoryStart({ orderId, item });
        return;
      }
    }

    setUpdatingFactoryStatusId(orderId);
    try {
      const body: Record<string, unknown> = { orderId, factoryStatus: newStatus };
      if (isFactoryUser && factoryItems.length === 1) {
        body.orderItemId = factoryItems[0].id;
      }
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
  }, [isFactoryUser, mutateOrders, orders, router, user?.manufacturer_id, user?.role]);

  const handleConfirmFactoryStart = useCallback(async (result: FactoryPriceResult) => {
    if (!pendingFactoryStart) return;
    const { orderId, item } = pendingFactoryStart;
    setUpdatingFactoryStatusId(orderId);
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          orderItemId: item.id,
          factoryStatus: 'in_progress',
          confirmFactoryPrice: true,
          factoryAmount: result.amount,
          factoryUnitPrice: result.unitPrice,
          factoryPriceMode: result.mode,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '상태 변경에 실패했습니다.');
      }
      setPendingFactoryStart(null);
      mutateOrders();
    } catch (error) {
      console.error('Error starting factory work:', error);
      setErrorMessage(error instanceof Error ? error.message : '상태 변경에 실패했습니다.');
    } finally {
      setUpdatingFactoryStatusId(null);
    }
  }, [mutateOrders, pendingFactoryStart]);

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

  const toggleSource = useCallback((source: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
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

  const getMyFactoryItems = useCallback((order: OrderWithItemCount): OrderItemSummary[] => {
    const items = order.order_items as OrderItemSummary[] | undefined;
    if (!items) return [];
    if (!user?.manufacturer_id) return items;
    return items.filter((i) => i.assigned_manufacturer_id === user.manufacturer_id);
  }, [user?.manufacturer_id]);

  const getMyFactorySummary = useCallback((order: OrderWithItemCount) => {
    const myItems = getMyFactoryItems(order);
    if (myItems.length === 0) {
      return { status: 'assigned' as string, deadline: null as string | null, amount: null as number | null, payDate: null as string | null, payStatus: null as string | null, assignedAt: null as string | null };
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
    const assignedDates = myItems.map((i) => i.factory_assigned_at).filter(Boolean) as string[];
    const assignedAt = assignedDates.length > 0 ? assignedDates.sort()[0] : null;
    return { status, deadline, amount, payDate, payStatus, assignedAt };
  }, [getMyFactoryItems]);

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
      case 'assignee': {
        // 영업담당자(salesman) 정렬. 주문 처리 담당자는 staff_assignee 다.
        const salesmanName = order.attributed_salesman?.display_name?.toLowerCase() || '';
        const salesmanCode = order.attributed_salesman?.salesman_code?.toLowerCase() || '';
        return salesmanName || salesmanCode || '';
      }
      case 'staff_assignee':
        return getAssignment(order)?.assignee_name?.toLowerCase() || '';
      case 'created_at':
        return new Date(order.created_at).getTime();
      case 'paid_at':
        return order.paid_at ? new Date(order.paid_at).getTime() : null;
      case 'factory_assigned_at': {
        const fa = getMyFactorySummary(order).assignedAt;
        return fa ? new Date(fa).getTime() : null;
      }
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
  }, [factoryMap, getAssignment]);

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

    if (selectedSources.size > 0) {
      result = result.filter((o) => selectedSources.has(getOrderSourceKey(o)));
    }

    // 주문 처리 담당 필터. 배정 정보를 신뢰할 수 있을 때만 적용한다.
    if (assignmentReady && staffFilter !== 'all') {
      result = result.filter((o) => {
        if (isNaverUnifiedOrder(o)) return false;
        const assignment = getAssignment(o);
        if (staffFilter === 'mine') {
          return !!user?.id && assignment?.assignee_profile_id === user.id;
        }
        // 미배정 = 배정행 없음 또는 담당자 null. 자식 주문은 부모를 따르므로 목록에 따로 쌓지 않는다.
        return !assignment?.assignee_profile_id && o.parent_order_id == null;
      });
    }

    // Text search (name, email, order ID, design title, mall, salesman)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((o) => {
        const designTitles = (o.order_items as { design_title?: string | null }[] | undefined)
          ?.map(i => i.design_title)
          .filter(Boolean)
          .join(', ')
          .toLowerCase() || '';
        const mallName = o.partner_mall?.name?.toLowerCase() || '';
        const salesmanName = o.attributed_salesman?.display_name?.toLowerCase() || '';
        const salesmanCode = o.attributed_salesman?.salesman_code?.toLowerCase() || '';
        const naverProduct = o.naver_product_summary?.toLowerCase() || '';
        const naverOption = o.naver_option_summary?.toLowerCase() || '';
        const externalOrderId = o.external_order_id?.toLowerCase() || '';
        return (
          o.id.toLowerCase().includes(q) ||
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_email?.toLowerCase().includes(q) ||
          mallName.includes(q) ||
          salesmanName.includes(q) ||
          salesmanCode.includes(q) ||
          naverProduct.includes(q) ||
          naverOption.includes(q) ||
          externalOrderId.includes(q) ||
          designTitles.includes(q)
        );
      });
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
    } else {
      // 기본 정렬 — 관리자: 결제일(미결제는 주문 생성일) 최신순. 결제되면 결제 시점 기준으로 위로 올라온다.
      // 공장 계정: 배정일(없으면 주문 생성일) 최신순. 배정받은 순서대로 위에서부터 보인다.
      const defaultSortTime = (o: OrderWithItemCount) =>
        new Date((isFactoryUser ? getMyFactorySummary(o).assignedAt : o.paid_at) || o.created_at).getTime();
      result = [...result].sort((a, b) => defaultSortTime(b) - defaultSortTime(a));
    }

    return result;
  }, [orders, selectedStatuses, selectedPaymentStatuses, selectedSources, searchQuery, isFactoryUser, sortKey, sortDir, getSortValue, getMyFactorySummary, assignmentReady, staffFilter, getAssignment, user?.id]);

  // Get order item count from the API response
  const getOrderItemCount = (order: OrderWithItemCount) => {
    const items = order.order_items;
    if (!items || items.length === 0) return '-';
    if ('count' in items[0]) return items[0].count;
    if (isNaverUnifiedOrder(order)) {
      return (items as OrderItemSummary[]).reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
    }
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

  const fieldSalesOpsSummary = useMemo(() => {
    const fieldOrders = orders.filter((order) => getOrderSourceKey(order) === 'partner_mall');
    const pendingOrders = fieldOrders.filter((order) => order.payment_status === 'pending');
    const activeSalesmen = new Set(
      fieldOrders
        .map((order) => order.attributed_salesman?.salesman_code || order.attributed_salesman?.display_name || order.salesman_id)
        .filter(Boolean)
    );
    const activeMalls = new Set(fieldOrders.map((order) => order.partner_mall_id).filter(Boolean));
    return {
      total: fieldOrders.length,
      pendingPayment: pendingOrders.length,
      pendingAmount: pendingOrders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0),
      completedAmount: fieldOrders
        .filter((order) => order.payment_status === 'completed')
        .reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0),
      unassignedFactory: fieldOrders.filter(hasUnassignedFactoryItem).length,
      activeSalesmen: activeSalesmen.size,
      activeMalls: activeMalls.size,
    };
  }, [orders]);

  const handleOrderClick = useCallback((order: OrderWithItemCount) => {
    if (isNaverUnifiedOrder(order)) {
      router.push(order.naver_management_href || `/naver-commerce?orderId=${encodeURIComponent(order.external_order_id || '')}`);
      return;
    }
    router.push(`/orders/${order.id}`);
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
      <FactoryPriceConfirmModal
        open={!!pendingFactoryStart}
        itemTitle={
          pendingFactoryStart?.item.design_title ||
          pendingFactoryStart?.item.product_title ||
          '배정 작업'
        }
        quantity={pendingFactoryStart?.item.quantity ?? null}
        initialAmount={pendingFactoryStart?.item.factory_amount ?? 0}
        defaultUnitPrice={
          pendingFactoryStart?.item.factory_unit_price ??
          (pendingFactoryStart?.item.factory_amount && pendingFactoryStart.item.quantity
            ? Math.round(Number(pendingFactoryStart.item.factory_amount) / Number(pendingFactoryStart.item.quantity))
            : null)
        }
        submitting={!!pendingFactoryStart && updatingFactoryStatusId === pendingFactoryStart.orderId}
        onConfirm={handleConfirmFactoryStart}
        onClose={() => setPendingFactoryStart(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-xl font-semibold text-gray-900">주문 관리</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            총 {filteredOrders.length}개의 주문{!isFactoryUser && ` · 영업몰 고객 ${partnerMallOrderCount}건`}
          </p>
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

      {!isFactoryUser && (
        <div className="bg-teal-50 border border-teal-100 rounded-md px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-teal-900">영업몰 운영 요약</p>
              <p className="text-[11px] text-teal-700 mt-0.5">
                파트너몰 고객 주문만 집계합니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[620px]">
              <button
                type="button"
                onClick={() => setSelectedSources(new Set(['partner_mall']))}
                className="rounded bg-white/80 px-3 py-2 text-left ring-1 ring-teal-100 hover:bg-white"
              >
                <div className="text-[11px] text-teal-700">영업몰 주문</div>
                <div className="mt-0.5 text-sm font-bold text-gray-900 tabular-nums">
                  {fieldSalesOpsSummary.total.toLocaleString('ko-KR')}건
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedSources(new Set(['partner_mall']));
                  setSelectedPaymentStatuses(new Set(['pending']));
                }}
                className="rounded bg-white/80 px-3 py-2 text-left ring-1 ring-teal-100 hover:bg-white"
              >
                <div className="text-[11px] text-teal-700">결제대기</div>
                <div className="mt-0.5 text-sm font-bold text-gray-900 tabular-nums">
                  {fieldSalesOpsSummary.pendingPayment.toLocaleString('ko-KR')}건
                </div>
                <div className="text-[10px] text-gray-500 tabular-nums">
                  {fieldSalesOpsSummary.pendingAmount.toLocaleString('ko-KR')}원
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedSources(new Set(['partner_mall']));
                  setSortKey('factory');
                  setSortDir('asc');
                }}
                className="rounded bg-white/80 px-3 py-2 text-left ring-1 ring-teal-100 hover:bg-white"
              >
                <div className="text-[11px] text-teal-700">공장 미배정</div>
                <div className="mt-0.5 text-sm font-bold text-gray-900 tabular-nums">
                  {fieldSalesOpsSummary.unassignedFactory.toLocaleString('ko-KR')}건
                </div>
                <div className="text-[10px] text-gray-500">
                  클릭 시 영업몰 우선 정렬
                </div>
              </button>
              <div className="rounded bg-white/70 px-3 py-2 ring-1 ring-teal-100">
                <div className="text-[11px] text-teal-700">담당/몰</div>
                <div className="mt-0.5 text-sm font-bold text-gray-900 tabular-nums">
                  {fieldSalesOpsSummary.activeSalesmen.toLocaleString('ko-KR')}명 · {fieldSalesOpsSummary.activeMalls.toLocaleString('ko-KR')}몰
                </div>
                <div className="text-[10px] text-gray-500 tabular-nums">
                  결제완료 {fieldSalesOpsSummary.completedAmount.toLocaleString('ko-KR')}원
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white border border-gray-200/60 rounded-md p-2 sm:p-3 shadow-sm space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이름, 이메일, 주문 ID, 디자인명, 파트너몰, 영업담당자 검색..."
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
        {!isFactoryUser && (
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[11px] sm:text-xs text-gray-400 mr-0.5">경로</span>
            {ORDER_SOURCE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => toggleSource(filter.value)}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors ${
                  selectedSources.has(filter.value)
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter.label}
                <span className={`ml-1 tabular-nums ${selectedSources.has(filter.value) ? 'text-white/80' : 'text-gray-400'}`}>
                  {sourceCounts[filter.value] ?? 0}
                </span>
              </button>
            ))}
            {selectedSources.size > 0 && (
              <button
                onClick={() => setSelectedSources(new Set())}
                className="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
              >
                초기화
              </button>
            )}
          </div>
        )}
        {assignmentFeatureOn && (
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[11px] sm:text-xs text-gray-400 mr-0.5">담당</span>
            {([
              { value: 'all', label: '전체' },
              { value: 'mine', label: '내 담당', count: staffCounts.mine },
              { value: 'unassigned', label: '미배정', count: staffCounts.unassigned },
            ] as const).map((filter) => (
              <button
                key={filter.value}
                onClick={() => setStaffFilter(filter.value)}
                disabled={!assignmentReady}
                title={assignmentReady ? undefined : '담당자 정보를 불러오는 중입니다.'}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  staffFilter === filter.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter.label}
                {'count' in filter && (
                  <span className={`ml-1 tabular-nums ${staffFilter === filter.value ? 'text-white/80' : 'text-gray-400'}`}>
                    {filter.count}
                  </span>
                )}
              </button>
            ))}
            {assignmentError && (
              <span className="text-[11px] sm:text-xs text-red-600">담당자 정보를 불러오지 못했습니다</span>
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
                    { key: 'factory_assigned_at', label: '배정일' },
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
                    { key: 'assignee', label: '영업담당자' },
                    ...(assignmentFeatureOn ? [{ key: 'staff_assignee', label: '주문 담당' } as const] : []),
                    { key: 'customer_name', label: '고객 정보' },
                    { key: 'created_at', label: '주문 일시' },
                    { key: 'paid_at', label: '결제일' },
                    { key: 'total_amount', label: '금액' },
                    { key: 'order_status', label: '주문 상태' },
                    { key: 'payment_status', label: '결제상태' },
                    { key: 'factory', label: '공장 배정' },
                    { key: 'factory_status', label: '배정 상태' },
                    { key: 'factory_assigned_at', label: '공장배정일' },
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
                  data-order-source={order.order_source || 'modoo'}
                  onClick={() => handleOrderClick(order)}
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
                        const fAssignedAt = fSummary.assignedAt;
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
                              <span className="text-sm text-gray-900">{formatKstDateShort(fAssignedAt)}</span>
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
                            <div className="flex flex-col gap-0.5">
                              <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${src.color}`}>
                                {src.label}
                              </span>
                              {order.partner_mall?.name && (
                                <span className="text-[10px] text-gray-500 max-w-[120px] truncate" title={order.partner_mall.name}>
                                  {order.partner_mall.name}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {(() => {
                          const salesmanName = order.attributed_salesman?.display_name;
                          const code = order.attributed_salesman?.salesman_code;
                          if (!salesmanName) {
                            return <span className="text-xs text-gray-400">미지정</span>;
                          }
                          return (
                            <div className="text-xs leading-tight">
                              <div className="text-gray-900">{salesmanName}</div>
                              {code && <div className="text-[10px] text-gray-500">{code}</div>}
                            </div>
                          );
                        })()}
                      </td>
                      {assignmentFeatureOn && (
                        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {isNaverUnifiedOrder(order) ? (
                            <span className="text-[11px] font-medium text-green-700">네이버 전용</span>
                          ) : (() => {
                            if (assignmentError) {
                              return <span className="text-[11px] text-red-500">불러오기 실패</span>;
                            }
                            if (assignmentLoading) {
                              return <span className="text-[11px] text-gray-400">확인 중…</span>;
                            }
                            const assignment = getAssignment(order);
                            const assigneeId = assignment?.assignee_profile_id ?? null;
                            const isChild = order.parent_order_id != null;
                            const isMine = !!viewerId && assigneeId === viewerId;
                            const busy = assigningOrderId === order.id;

                            // 자식(차액) 주문은 원주문 담당을 따르므로 여기서 바꾸지 않는다.
                            if (isChild) {
                              return (
                                <span className="text-[11px] text-gray-400">
                                  {assignment?.assignee_name ? `${assignment.assignee_name} (원주문)` : '원주문 따름'}
                                </span>
                              );
                            }

                            const choices = getAssigneeChoices(assignment);
                            // 일반 관리자는 타인 담당을 건드릴 수 없다. 표시는 하되 잠근다.
                            const locked =
                              (!canClaim && !canAssignOthers) ||
                              (!canAssignOthers && !!assigneeId && !isMine);

                            return (
                              <select
                                value={assigneeId ?? ''}
                                onChange={(e) => handleAssigneeSelect(order, e.target.value)}
                                disabled={busy || locked}
                                title={locked ? '본인 담당 주문만 변경할 수 있습니다.' : '담당자 변경'}
                                className={`px-2 py-1 rounded-md text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-60 disabled:cursor-not-allowed ${
                                  assigneeId
                                    ? isMine
                                      ? 'bg-indigo-100 text-indigo-800'
                                      : 'bg-gray-100 text-gray-700'
                                    : 'bg-gray-50 text-gray-500'
                                }`}
                              >
                                <option value="">미배정</option>
                                {choices.map((choice) => (
                                  <option key={choice.id} value={choice.id}>
                                    {choice.label}
                                  </option>
                                ))}
                              </select>
                            );
                          })()}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-medium text-gray-900">{order.customer_name}</div>
                          {!isNaverUnifiedOrder(order) && hasBadContact(order) && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 shrink-0"
                              title="연락처 형식이 올바르지 않습니다. 주문 상세에서 정정하세요."
                            >
                              연락처 이상
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{order.customer_email}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-gray-600">
                          {formatKstMonthDay(order.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs ${order.paid_at ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                          {formatKstMonthDay(order.paid_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {order.total_amount.toLocaleString()}원
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {isNaverUnifiedOrder(order) ? (
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(order.order_status)}`}>
                            {order.naver_status_label || '네이버 상태 확인'}
                          </span>
                        ) : (
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
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(order.payment_status)}`}>
                          {isNaverUnifiedOrder(order) && '네이버페이 · '}
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
                              <span className={`text-sm text-gray-900 ${!hasFactory && !isNaverUnifiedOrder(order) ? 'text-red-500' : ''}`}>
                                {isNaverUnifiedOrder(order) ? '네이버 전용' : factoryLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              {isNaverUnifiedOrder(order) ? (
                                <span className="text-xs text-gray-400">-</span>
                              ) : hasFactory ? (
                                factoryStatus === 'mixed' ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getFactoryStatusColor('mixed')}`}>
                                    {getFactoryStatusLabel('mixed')}
                                  </span>
                                ) : isFactoryUser ? (
                                  // 공장: 목록에선 상태를 읽기전용으로만 표시. 변경은 주문을 열어 품목별로(단가 확인 포함) 진행.
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getFactoryStatusColor(factoryStatus)}`}>
                                    {getFactoryStatusLabel(factoryStatus)}
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
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`text-xs ${hasFactory ? 'text-gray-900' : 'text-gray-400'}`}>
                                {hasFactory && !isNaverUnifiedOrder(order) ? formatKstMonthDay(getMyFactorySummary(order).assignedAt) : '-'}
                              </span>
                            </td>
                          </>
                        );
                      })()}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {(() => {
                          if (isNaverUnifiedOrder(order)) return <span className="text-xs text-gray-400">-</span>;
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
                          {isNaverUnifiedOrder(order) ? (
                            <button
                              data-testid="naver-order-manage"
                              onClick={() => handleOrderClick(order)}
                              className="flex items-center gap-1 px-3 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              네이버 주문 관리
                            </button>
                          ) : (
                            <>
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
                              {isSuperAdmin && (
                                <button
                                  onClick={() => setDeleteOrder(order)}
                                  className="flex items-center gap-1 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                  title="주문 영구 삭제 (super-admin)"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  삭제
                                </button>
                              )}
                            </>
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
              data-order-source={order.order_source || 'modoo'}
              onClick={() => handleOrderClick(order)}
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
                        {!isNaverUnifiedOrder(order) && hasBadContact(order) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 shrink-0">
                            연락처 이상
                          </span>
                        )}
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
                      {order.partner_mall?.name && (
                        <div className="text-[11px] text-teal-700 truncate">
                          {order.partner_mall.name}
                        </div>
                      )}
                      {order.attributed_salesman?.display_name && (
                        <div className="text-[11px] text-gray-500 truncate">
                          {order.attributed_salesman.display_name}
                          {order.attributed_salesman.salesman_code ? ` · ${order.attributed_salesman.salesman_code}` : ''}
                        </div>
                      )}
                      {assignmentFeatureOn && (isNaverUnifiedOrder(order) ? (
                        <div className="text-[11px] font-medium text-green-700">담당 네이버 전용</div>
                      ) : (() => {
                        if (assignmentError) return <div className="text-[11px] text-red-500">담당 정보 실패</div>;
                        if (assignmentLoading) return <div className="text-[11px] text-gray-400">담당 확인 중…</div>;
                        const assignment = getAssignment(order);
                        const assigneeId = assignment?.assignee_profile_id ?? null;
                        const isMine = !!viewerId && assigneeId === viewerId;
                        if (order.parent_order_id != null) {
                          return (
                            <div className="text-[11px] text-gray-400 truncate">
                              담당 {assignment?.assignee_name ? `${assignment.assignee_name} (원주문)` : '원주문 따름'}
                            </div>
                          );
                        }
                        const choices = getAssigneeChoices(assignment);
                        const locked =
                          (!canClaim && !canAssignOthers) || (!canAssignOthers && !!assigneeId && !isMine);
                        return (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[11px] text-gray-400">담당</span>
                            <select
                              value={assigneeId ?? ''}
                              onChange={(e) => handleAssigneeSelect(order, e.target.value)}
                              disabled={assigningOrderId === order.id || locked}
                              className={`px-1.5 py-0.5 rounded text-[11px] font-medium border-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                                assigneeId
                                  ? isMine
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-gray-100 text-gray-700'
                                  : 'bg-gray-50 text-gray-500'
                              }`}
                            >
                              <option value="">미배정</option>
                              {choices.map((choice) => (
                                <option key={choice.id} value={choice.id}>
                                  {choice.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })())}
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      {isNaverUnifiedOrder(order) ? (
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${getStatusColor(order.order_status)}`}>
                          {order.naver_status_label || '네이버 상태 확인'}
                        </span>
                      ) : (
                        <select
                          value={order.order_status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value as Order['order_status'])}
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
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                    <span>{orderCategoryLabel(order.order_category)}</span>
                    <span className="font-medium text-gray-700">{order.total_amount.toLocaleString()}원</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getPaymentStatusColor(order.payment_status)}`}>{isNaverUnifiedOrder(order) && '네이버페이 · '}{{pending:'입금대기',completed:'결제완료',failed:'결제실패',refunded:'환불'}[order.payment_status] || order.payment_status}</span>
                    {(() => {
                      if (isNaverUnifiedOrder(order)) return null;
                      const ps = getPurchaseOrderSummary(order);
                      return ps.label !== '-' ? (
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${ps.color}`}>{ps.label}</span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatKstDateLong(order.created_at)}</span>
                    {order.paid_at && (
                      <span className="text-gray-600">결제 {formatKstMonthDay(order.paid_at)}</span>
                    )}
                    {(() => {
                      const fl = getOrderFactoryLabel(order);
                      const fs = getOrderFactoryStatus(order);
                      const hasF = fl !== '미배정';
                      return (
                        <>
                          <span className={!hasF && !isNaverUnifiedOrder(order) ? 'text-red-500' : ''}>{isNaverUnifiedOrder(order) ? '네이버 전용' : fl}</span>
                          {hasF && !isNaverUnifiedOrder(order) && (
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
                      {isNaverUnifiedOrder(order) ? (
                        <button
                          data-testid="naver-order-manage"
                          onClick={(e) => { e.stopPropagation(); handleOrderClick(order); }}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          네이버 주문 관리
                        </button>
                      ) : (
                        <>
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
                          {isSuperAdmin && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteOrder(order); }}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                              title="주문 영구 삭제 (super-admin)"
                            >
                              <Trash2 className="w-3 h-3" />
                              삭제
                            </button>
                          )}
                        </>
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

      {/* Delete Order Modal (super_admin only) */}
      {deleteOrder && (
        <DeleteOrderModal
          order={deleteOrder}
          onClose={() => setDeleteOrder(null)}
          onSuccess={() => {
            setDeleteOrder(null);
            mutateOrders();
          }}
        />
      )}
    </div>
  );
}
