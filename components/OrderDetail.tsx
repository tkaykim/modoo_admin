'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { CoBuyParticipant, Factory, Order, OrderItem } from '@/types/types';
import { ChevronLeft, ChevronDown, CreditCard, Package, Factory as FactoryIcon, Download, Share2, Copy, Check, Link2Off, RotateCcw, MessageSquare, User, Receipt, Truck, Link2, Pencil, X, Loader2, Send, Plus, Trash2 } from 'lucide-react';
import RefundModal from '@/components/orders/RefundModal';
import DesignChatPanel from '@/components/orders/DesignChatPanel';
import OrderAttachmentSection from '@/components/orders/OrderAttachmentSection';
import AddOrderItemModal from '@/components/orders/AddOrderItemModal';
import OrderProfitSection from '@/components/orders/OrderProfitSection';
import { extractVariants } from '@/lib/orderUtils';
import { formatKstDateLong, formatKstDateTimeMedium, getKstYYYYMMDD } from '@/lib/kst';
import { orderCategoryBadgeClass, orderCategoryLabel } from '@/lib/order-category';

type CoBuyParticipantSummary = Pick<
  CoBuyParticipant,
  | 'id'
  | 'cobuy_session_id'
  | 'name'
  | 'email'
  | 'phone'
  | 'selected_size'
  | 'payment_status'
  | 'payment_amount'
  | 'paid_at'
  | 'joined_at'
>;

interface OrderDetailProps {
  order: Order;
  onBack: () => void;
  onUpdate: () => void;
  onOrderUpdate: (order: Order) => void;
  factories: Factory[];
  canAssign: boolean;
  loadingFactories: boolean;
  isFactoryUser?: boolean;
  initialAddItemDesignId?: string | null;
}

export default function OrderDetail({
  order,
  onBack,
  onUpdate,
  onOrderUpdate,
  factories,
  canAssign,
  loadingFactories,
  isFactoryUser = false,
  initialAddItemDesignId,
}: OrderDetailProps) {
  const router = useRouter();
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddItemModal, setShowAddItemModal] = useState(!!initialAddItemDesignId);
  const [expandedFactoryItemId, setExpandedFactoryItemId] = useState<string | null>(null);
  const [itemAlloc, setItemAlloc] = useState<Record<string, { factory_id: string; amount: string; deadline: string; pay_date: string; pay_status: string }>>({});
  const [savingItemAlloc, setSavingItemAlloc] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [editingOrderItem, setEditingOrderItem] = useState<OrderItem | null>(null);
  const [editingSummaryField, setEditingSummaryField] = useState<'discount' | 'surcharge' | null>(null);
  const [editingSummaryValue, setEditingSummaryValue] = useState('');
  const [savingSummaryField, setSavingSummaryField] = useState(false);
  const [cobuySession, setCobuySession] = useState<{ id: string; title: string } | null>(null);
  const [cobuyError, setCobuyError] = useState<string | null>(null);
  const [downloadingCobuyExcel, setDownloadingCobuyExcel] = useState(false);
  const [cobuyParticipantSessionId, setCobuyParticipantSessionId] = useState<string | null>(null);
  const [cobuyParticipants, setCobuyParticipants] = useState<CoBuyParticipantSummary[]>([]);
  const [loadingCobuyParticipants, setLoadingCobuyParticipants] = useState(false);
  const [cobuyParticipantsError, setCobuyParticipantsError] = useState<string | null>(null);

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [factoryAccordionOpen, setFactoryAccordionOpen] = useState(false);
  const [chatItemId, setChatItemId] = useState<string | null>(null);
  const [localAttachmentUrls, setLocalAttachmentUrls] = useState<string[]>(order.attachment_urls || []);

  // Share link state
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [generatingShareLink, setGeneratingShareLink] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [sendingDesignItemId, setSendingDesignItemId] = useState<string | null>(null);

  // Logen shipping state
  const [showLogenModal, setShowLogenModal] = useState(false);
  const [logenLoading, setLogenLoading] = useState(false);
  const [logenError, setLogenError] = useState<string | null>(null);
  const [trackingHistory, setTrackingHistory] = useState<any[] | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const handleSendDesign = useCallback(async (itemId: string) => {
    if (!confirm('고객에게 시안 확인 이메일을 발송하시겠습니까?')) return;
    setSendingDesignItemId(itemId);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/items/${itemId}/send-design`, {
        method: 'POST',
      });
      if (res.ok) {
        setOrderItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, design_status: 'design_shared', design_shared_at: new Date().toISOString() }
              : item
          )
        );
        alert('시안 확인 이메일이 발송되었습니다.');
      } else {
        const data = await res.json();
        alert(data.error || '발송에 실패했습니다.');
      }
    } catch {
      alert('발송 중 오류가 발생했습니다.');
    } finally {
      setSendingDesignItemId(null);
    }
  }, [order.id]);

  useEffect(() => {
    fetchOrderItems();
  }, [order.id]);

  useEffect(() => {
    fetchCobuySession();
  }, [order.id]);

  useEffect(() => {
    if (order.order_category !== 'cobuy') {
      setCobuyParticipantSessionId(null);
      setCobuyParticipants([]);
      setCobuyParticipantsError(null);
      setLoadingCobuyParticipants(false);
      return;
    }

    fetchCobuyParticipants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.order_category]);

  // No longer syncing order-level factory fields — they are now on order_items

  // Fetch existing share token on mount
  useEffect(() => {
    if (canAssign) {
      fetchShareToken();
    }
  }, [order.id, canAssign]);

  const fetchShareToken = async () => {
    try {
      const response = await fetch(`/api/admin/orders/share?orderId=${order.id}`);
      if (response.ok) {
        const { data } = await response.json();
        setShareUrl(data?.share_url || null);
      }
    } catch (error) {
      console.error('Error fetching share token:', error);
    }
  };

  const handleGenerateShareLink = async () => {
    setGeneratingShareLink(true);
    setShareError(null);
    try {
      const response = await fetch('/api/admin/orders/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || '공유 링크 생성에 실패했습니다.');
      }

      const { data } = await response.json();
      setShareUrl(data?.share_url || null);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : '공유 링크 생성에 실패했습니다.');
    } finally {
      setGeneratingShareLink(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const handleDisableShareLink = async () => {
    setGeneratingShareLink(true);
    setShareError(null);
    try {
      const response = await fetch(`/api/admin/orders/share?orderId=${order.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || '공유 링크 비활성화에 실패했습니다.');
      }

      setShareUrl(null);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : '공유 링크 비활성화에 실패했습니다.');
    } finally {
      setGeneratingShareLink(false);
    }
  };

  // No sync needed — factory fields are managed per order_item

  const fetchOrderItems = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/orders/items?orderId=${order.id}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '주문 상품을 불러오지 못했습니다.');
      }

      const payload = await response.json();
      setOrderItems(payload?.data || []);
    } catch (error) {
      console.error('Error fetching order items:', error);
      setOrderItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('이 상품을 주문에서 삭제하시겠습니까?')) return;
    setDeletingItemId(itemId);
    try {
      const res = await fetch(`/api/admin/orders/items?orderId=${order.id}&orderItemId=${itemId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { alert(json.error || '삭제에 실패했습니다.'); return; }
      if (json.data?.order) onOrderUpdate(json.data.order as Order);
      await fetchOrderItems();
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleItemAdded = async () => {
    await fetchOrderItems();
    const res = await fetch(`/api/admin/orders?orderId=${order.id}`);
    const json = await res.json();
    const orders: Order[] = json.data || [];
    if (orders.length > 0) onOrderUpdate(orders[0]);
    onUpdate();
  };

  const handleSummaryRemove = async (field: 'discount' | 'surcharge') => {
    const label = field === 'discount' ? '할인' : '추가 금액';
    if (!confirm(`${label}을(를) 삭제하시겠습니까?`)) return;
    setSavingSummaryField(true);
    try {
      const mode = field === 'discount' ? 'remove_discount' : 'remove_surcharge';
      const res = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, priceAdjustment: { mode } }),
      });
      const json = await res.json();
      if (res.ok && json.data) { onOrderUpdate(json.data as Order); onUpdate(); }
    } catch { /* noop */ }
    finally { setSavingSummaryField(false); }
  };

  const handleSummaryUpdate = async (field: 'discount' | 'surcharge') => {
    const parsed = parseFloat(editingSummaryValue);
    if (!parsed || isNaN(parsed)) return;
    const v = Math.abs(parsed);
    setSavingSummaryField(true);
    try {
      const mode = field === 'discount' ? 'update_discount' : 'update_surcharge';
      const res = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, priceAdjustment: { mode, value: v } }),
      });
      const json = await res.json();
      if (res.ok && json.data) { onOrderUpdate(json.data as Order); onUpdate(); }
    } catch { /* noop */ }
    finally { setSavingSummaryField(false); setEditingSummaryField(null); setEditingSummaryValue(''); }
  };

  const fetchCobuySession = async () => {
    setCobuyError(null);
    try {
      const response = await fetch(`/api/admin/orders/cobuy-session?orderId=${order.id}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || '공동구매 정보를 불러오지 못했습니다.');
      }

      const payload = await response.json();
      setCobuySession(payload?.data || null);
    } catch (error) {
      console.error('Error fetching cobuy session:', error);
      setCobuySession(null);
      setCobuyError(error instanceof Error ? error.message : '공동구매 정보를 불러오지 못했습니다.');
    }
  };

  const fetchCobuyParticipants = async () => {
    setLoadingCobuyParticipants(true);
    setCobuyParticipantsError(null);

    try {
      const response = await fetch(`/api/admin/orders/cobuy-participants?orderId=${order.id}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || '공동구매 참여자 정보를 불러오지 못했습니다.');
      }

      const payload = await response.json();
      setCobuyParticipantSessionId(payload?.data?.sessionId ?? null);
      setCobuyParticipants(payload?.data?.participants || []);
    } catch (error) {
      console.error('Error fetching cobuy participants:', error);
      setCobuyParticipantSessionId(null);
      setCobuyParticipants([]);
      setCobuyParticipantsError(
        error instanceof Error ? error.message : '공동구매 참여자 정보를 불러오지 못했습니다.'
      );
    } finally {
      setLoadingCobuyParticipants(false);
    }
  };

  const handleDownloadCobuyExcel = async () => {
    setDownloadingCobuyExcel(true);
    setCobuyError(null);

    try {
      const response = await fetch(`/api/admin/orders/cobuy-excel?orderId=${order.id}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || '엑셀 다운로드에 실패했습니다.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cobuy-order-${order.id}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading cobuy excel:', error);
      setCobuyError(error instanceof Error ? error.message : '엑셀 다운로드에 실패했습니다.');
    } finally {
      setDownloadingCobuyExcel(false);
    }
  };

  const cobuyPaymentStatusLabel: Record<CoBuyParticipant['payment_status'], string> = {
    pending: '대기',
    completed: '완료',
    failed: '실패',
    refunded: '환불',
    not_required: '불필요',
  };

  const subtotal = orderItems.reduce(
    (sum, item) => sum + (item.price_per_item ?? 0) * (item.quantity ?? 0),
    0
  );

  const factoryMap = useMemo(() => {
    const map = new Map<string, Factory>();
    factories.forEach((factory) => {
      if (factory.id) {
        map.set(factory.id, factory);
      }
    });
    return map;
  }, [factories]);

  const getItemFactoryIds = (): string[] => {
    return [...new Set(orderItems.map((i) => i.assigned_manufacturer_id).filter(Boolean))] as string[];
  };

  const getFactoryNameById = (id: string) => {
    return factoryMap.get(id)?.name || factoryMap.get(id)?.email || id;
  };

  const getItemsFactoryLabel = (): string => {
    const ids = getItemFactoryIds();
    if (ids.length === 0) return '미배정';
    if (ids.length === 1) return getFactoryNameById(ids[0]);
    return `${getFactoryNameById(ids[0])} 외 ${ids.length - 1}곳`;
  };

  const getItemsFactoryStatus = (): string | null => {
    const statuses = orderItems.map((i) => i.factory_status).filter(Boolean) as string[];
    if (statuses.length === 0) return null;
    if (statuses.every((s) => s === statuses[0])) return statuses[0];
    return 'mixed';
  };

  const toggleItemAlloc = (item: OrderItem) => {
    if (expandedFactoryItemId === item.id) {
      setExpandedFactoryItemId(null);
      return;
    }
    setExpandedFactoryItemId(item.id);
    setItemAlloc((prev) => ({
      ...prev,
      [item.id]: prev[item.id] || {
        factory_id: item.assigned_manufacturer_id || '',
        amount: item.factory_amount != null ? String(item.factory_amount) : '',
        deadline: item.deadline ? item.deadline.split('T')[0] : '',
        pay_date: item.factory_payment_date ? item.factory_payment_date.split('T')[0] : '',
        pay_status: item.factory_payment_status || 'pending',
      },
    }));
  };

  const updateItemAllocField = (itemId: string, field: string, value: string) => {
    setItemAlloc((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const applyAllocToAll = (sourceItemId: string) => {
    const source = itemAlloc[sourceItemId];
    if (!source) return;
    const updated: typeof itemAlloc = {};
    for (const item of orderItems) {
      updated[item.id] = { ...source };
    }
    setItemAlloc(updated);
  };

  const saveItemAlloc = async (itemId: string) => {
    const alloc = itemAlloc[itemId];
    if (!alloc || !alloc.factory_id) return;

    setSavingItemAlloc(itemId);
    try {
      const response = await fetch('/api/admin/orders/factory-allocation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          items: [{
            orderItemId: itemId,
            assigned_manufacturer_id: alloc.factory_id,
            factory_amount: alloc.amount ? Number(alloc.amount) : null,
            deadline: alloc.deadline || null,
            factory_payment_date: alloc.pay_date || null,
            factory_payment_status: alloc.pay_status || 'pending',
          }],
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '저장에 실패했습니다.');
      }
      await fetchOrderItems();
      onUpdate();
      setExpandedFactoryItemId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : '저장에 실패했습니다.');
    } finally {
      setSavingItemAlloc(null);
    }
  };

  const saveAllItemAllocs = async () => {
    const validItems = orderItems
      .map((item) => itemAlloc[item.id])
      .filter((a) => a?.factory_id);
    if (validItems.length === 0) return;

    setSavingItemAlloc('all');
    try {
      const response = await fetch('/api/admin/orders/factory-allocation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          items: orderItems
            .filter((item) => itemAlloc[item.id]?.factory_id)
            .map((item) => {
              const a = itemAlloc[item.id];
              return {
                orderItemId: item.id,
                assigned_manufacturer_id: a.factory_id,
                factory_amount: a.amount ? Number(a.amount) : null,
                deadline: a.deadline || null,
                factory_payment_date: a.pay_date || null,
                factory_payment_status: a.pay_status || 'pending',
              };
            }),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '저장에 실패했습니다.');
      }
      await fetchOrderItems();
      onUpdate();
      setExpandedFactoryItemId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : '저장에 실패했습니다.');
    } finally {
      setSavingItemAlloc(null);
    }
  };

  const handleItemClick = useCallback((itemId: string) => {
    router.push(`/orders/${order.id}/items/${itemId}`);
  }, [router, order.id]);

  const orderStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      payment_pending: '결제대기', payment_completed: '결제완료', in_production: '생산중', shipping: '배송중',
      delivered: '배송완료', cancelled: '취소', partially_cancelled: '부분취소',
    };
    return map[status] || status;
  };

  const orderStatusColor = (status: string) => {
    const map: Record<string, string> = {
      payment_pending: 'bg-amber-100 text-amber-800',
      payment_completed: 'bg-green-100 text-green-800',
      in_production: 'bg-yellow-100 text-yellow-800',
      shipping: 'bg-blue-100 text-blue-800',
      delivered: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
      partially_cancelled: 'bg-orange-100 text-orange-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  const paymentStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: '입금대기', completed: '완료', failed: '실패', refunded: '환불',
    };
    return map[status] || status;
  };

  const paymentStatusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-purple-100 text-purple-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  const factoryStatusLabel = (status: string | null) => {
    if (!status) return '대기중';
    const map: Record<string, string> = {
      pending: '대기중', assigned: '배정완료', in_progress: '작업중',
      completed: '작업완료', shipped: '출고완료', cancelled: '취소',
      mixed: '혼합',
    };
    return map[status] || '대기중';
  };

  const factoryStatusColor = (status: string | null) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    const map: Record<string, string> = {
      assigned: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      shipped: 'bg-indigo-100 text-indigo-800',
      cancelled: 'bg-red-100 text-red-800',
      mixed: 'bg-purple-100 text-purple-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  const senderInfo = {
    name: '모두의굿즈',
    addr: '경기도 성남시 수정구 창업로57번길7 5층',
    tel: '02-3415-8969',
  };

  const totalQty = (orderItems || []).reduce((sum, item) => sum + (item.quantity || 1), 0);
  const goodsNm = (orderItems || []).map((item) => item.product_title).join(', ').slice(0, 80) || '상품';

  const handleLogenRegister = async () => {
    setLogenLoading(true);
    setLogenError(null);
    try {
      const res = await fetch('/api/admin/shipping/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [order.id] }),
      });
      const json = await res.json();
      if (res.ok) {
        setShowLogenModal(false);
        onOrderUpdate({
          ...order,
          logen_registered_at: new Date().toISOString(),
          tracking_carrier: 'logen',
        } as Order);
      } else {
        setLogenError(json.error || '접수에 실패했습니다.');
      }
    } catch (err: any) {
      setLogenError('서버 연결에 실패했습니다. 로젠 API 설정을 확인해주세요.');
    } finally {
      setLogenLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Logen Registration Modal */}
      {showLogenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">택배 접수 확인</h3>
              <button onClick={() => setShowLogenModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Sender */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">보내는 분</p>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                  <p className="font-medium text-gray-900">{senderInfo.name}</p>
                  <p className="text-gray-600">{senderInfo.addr}</p>
                  <p className="text-gray-600">{senderInfo.tel}</p>
                </div>
              </div>

              {/* Receiver */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">받는 분</p>
                <div className="bg-blue-50 rounded-lg p-3 space-y-1 text-sm">
                  <p className="font-medium text-gray-900">{order.customer_name || '-'}</p>
                  <p className="text-gray-700">
                    {order.postal_code && `[${order.postal_code}] `}
                    {order.address_line_1 || '주소 미입력'}
                    {order.address_line_2 && ` ${order.address_line_2}`}
                  </p>
                  <p className="text-gray-600">{order.customer_phone || '연락처 없음'}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">물품 정보</p>
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">물품명</span>
                    <span className="font-medium text-gray-900 text-right max-w-[60%] truncate">{goodsNm}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">수량</span>
                    <span className="font-medium text-gray-900">{totalQty}개</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">운임</span>
                    <span className="font-medium text-gray-900">{(order.delivery_fee || 0).toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">운임타입</span>
                    <span className="font-medium text-gray-900">본사신용</span>
                  </div>
                </div>
              </div>

              {/* Validation warnings */}
              {(!order.address_line_1 || !order.customer_phone) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                  <p className="font-medium mb-1">주의: 배송 정보가 불완전합니다</p>
                  {!order.address_line_1 && <p>- 주소가 입력되지 않았습니다.</p>}
                  {!order.customer_phone && <p>- 연락처가 입력되지 않았습니다.</p>}
                </div>
              )}

              {logenError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                  {logenError}
                </div>
              )}
            </div>

            <div className="flex gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50/50">
              <button
                onClick={() => setShowLogenModal(false)}
                className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleLogenRegister}
                disabled={logenLoading || !order.address_line_1}
                className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {logenLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 접수 중...</>
                ) : (
                  '접수하기'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">주문 상세</h2>
            <p className="text-sm text-gray-500 mt-0.5">주문 ID: {order.id}</p>
          </div>
        </div>

        {/* Share Link Button - Admin only, requires factory assignment */}
        {canAssign && getItemFactoryIds().length > 0 && (
          <div className="flex items-center gap-2">
            {shareUrl ? (
              <>
                <button
                  onClick={handleCopyShareLink}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
                >
                  {copiedShareLink ? (
                    <><Check className="w-4 h-4" />복사됨</>
                  ) : (
                    <><Copy className="w-4 h-4" />공유 링크 복사</>
                  )}
                </button>
                <button
                  onClick={handleDisableShareLink}
                  disabled={generatingShareLink}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-60"
                  title="공유 링크 비활성화"
                >
                  <Link2Off className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={handleGenerateShareLink}
                disabled={generatingShareLink}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-60"
              >
                <Share2 className="w-4 h-4" />
                {generatingShareLink ? '생성 중...' : '공유 링크 생성'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Share Error */}
      {shareError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {shareError}
        </div>
      )}

      {/* Status Overview Bar */}
      {!isFactoryUser && (
        <div className="bg-white border border-gray-200/60 rounded-md p-3 shadow-sm flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">주문</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${orderStatusColor(order.order_status)}`}>
              {orderStatusLabel(order.order_status)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">결제</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${paymentStatusColor(order.payment_status)}`}>
              {paymentStatusLabel(order.payment_status)}
            </span>
          </div>
          {getItemFactoryIds().length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">공장</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${factoryStatusColor(getItemsFactoryStatus())}`}>
                {getItemsFactoryLabel()} - {factoryStatusLabel(getItemsFactoryStatus())}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">구분</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${orderCategoryBadgeClass(order.order_category)}`}>
              {orderCategoryLabel(order.order_category)}
            </span>
          </div>
          <div className="ml-auto text-xs text-gray-400">
            {formatKstDateLong(order.created_at)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column - Order Info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Order Items */}
          <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">주문 상품</h3>
                {!loading && <span className="text-xs text-gray-400">({orderItems.length})</span>}
              </div>
              {!isFactoryUser && order.order_category !== 'cobuy' && (
                <button
                  onClick={() => setShowAddItemModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  상품 추가
                </button>
              )}
            </div>
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {orderItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item.id)}
                      className={`flex gap-4 p-3 rounded-md cursor-pointer transition-all ${
                        item.retouch_requested
                          ? 'border-2 border-orange-400 bg-orange-50/30 hover:border-orange-500 hover:bg-orange-50/50'
                          : 'border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50'
                      }`}
                    >
                      <div className="w-20 h-20 bg-gray-100 rounded shrink-0 overflow-hidden">
                        {item.thumbnail_url ? (
                          <img
                            src={item.thumbnail_url}
                            alt={item.product_title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-8 h-8 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-black">{item.product_title}</h4>
                          {item.retouch_requested && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-700 rounded">
                              리터치 요청
                            </span>
                          )}
                          {item.design_status && item.design_status !== 'pending' && (
                            <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                              item.design_status === 'confirmed' ? 'bg-green-100 text-green-700' :
                              item.design_status === 'design_shared' ? 'bg-purple-100 text-purple-700' :
                              item.design_status === 'revision_requested' ? 'bg-amber-100 text-amber-700' :
                              item.design_status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {item.design_status === 'confirmed' ? '시안확정' :
                               item.design_status === 'design_shared' ? '시안발송' :
                               item.design_status === 'revision_requested' ? '수정요청' :
                               item.design_status === 'in_progress' ? '작업중' : item.design_status}
                            </span>
                          )}
                        </div>
                        {item.products?.product_code && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            상품코드: {item.products.product_code}
                          </p>
                        )}
                        {/* Size/Variant breakdown */}
                        {(() => {
                          const variants = extractVariants(item);
                          return variants.length > 1 ? (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {variants.filter(v => (v.quantity ?? 0) > 0).map((v, vi) => (
                                <span key={vi} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                                  {v.color_hex && <span className="w-2.5 h-2.5 rounded-full border border-gray-300 shrink-0" style={{ backgroundColor: v.color_hex }} />}
                                  {v.size_name && <span>{v.size_name}</span>}
                                  <span className="font-medium">x{v.quantity}</span>
                                </span>
                              ))}
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-50 rounded text-xs font-semibold text-blue-700">
                                합계: {item.quantity}
                              </span>
                            </div>
                          ) : null;
                        })()}
                        <div className="flex justify-between items-center mt-2">
                          {(() => {
                            const variants = extractVariants(item);
                            if (variants.length <= 1) {
                              const v = variants[0];
                              const label = v?.size_name;
                              return <span className="text-sm text-gray-600">수량: {label ? `${label} ` : ''}{item.quantity}</span>;
                            }
                            return <span className="text-sm text-gray-600">총 수량: {item.quantity}</span>;
                          })()}
                          <div className="flex items-center gap-2">
                            {!isFactoryUser && item.design_status !== 'confirmed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSendDesign(item.id);
                                }}
                                disabled={sendingDesignItemId === item.id}
                                className="p-1.5 rounded transition-colors hover:bg-purple-100 text-gray-400 hover:text-purple-600 disabled:opacity-50"
                                title={item.design_status === 'design_shared' ? '시안 재발송' : '시안 발송'}
                              >
                                {sendingDesignItemId === item.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setChatItemId(chatItemId === item.id ? null : item.id);
                              }}
                              className={`p-1.5 rounded transition-colors ${
                                chatItemId === item.id
                                  ? 'bg-blue-100 text-blue-600'
                                  : 'hover:bg-gray-100 text-gray-400 hover:text-blue-600'
                              }`}
                              title="디자인 소통"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                            {!isFactoryUser && order.order_category !== 'cobuy' && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingOrderItem(item); setShowAddItemModal(true); }}
                                  className="p-1.5 rounded transition-colors hover:bg-blue-100 text-gray-400 hover:text-blue-600"
                                  title="상품 수정"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                                  disabled={deletingItemId === item.id || orderItems.length <= 1}
                                  className="p-1.5 rounded transition-colors hover:bg-red-100 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={orderItems.length <= 1 ? '최소 1개의 상품이 필요합니다' : '상품 삭제'}
                                >
                                  {deletingItemId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                              </>
                            )}
                            {!isFactoryUser && (
                              <span className="font-semibold text-gray-900">
                                {((item.price_per_item ?? 0) * (item.quantity ?? 0)).toLocaleString()}원
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Design Chat Panel */}
          {chatItemId && (
            <DesignChatPanel
              orderItemId={chatItemId}
              productTitle={orderItems.find((i) => i.id === chatItemId)?.product_title}
              designTitle={orderItems.find((i) => i.id === chatItemId)?.design_title || undefined}
              onClose={() => setChatItemId(null)}
            />
          )}

          {/* Customer Note & Attachments */}
          <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-amber-50/50">
              <MessageSquare className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-gray-900">고객 요청사항 / 첨부파일</h3>
            </div>
            <div className="p-4 space-y-3">
              {order.customer_note && (() => {
                const cleaned = order.customer_note
                  .replace(/\n?---\n?\[계좌이체 정보\]\s*\{.*\}/, '')
                  .replace(/^\[계좌이체 정보\]\s*\{.*\}/, '')
                  .trim();
                return cleaned ? (
                  <>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{cleaned}</p>
                    <div className="border-t border-gray-100 pt-3" />
                  </>
                ) : <div />;
              })()}
              <OrderAttachmentSection
                orderId={order.id}
                attachmentUrls={localAttachmentUrls}
                onUrlsUpdated={setLocalAttachmentUrls}
                isAdmin={!isFactoryUser}
              />
            </div>
          </div>

          {/* CoBuy participant information - hidden for factory users (contains personal info) */}
          {order.order_category === 'cobuy' && !isFactoryUser && (
            <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-purple-50/50">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-600" />
                  <h3 className="text-sm font-semibold text-gray-900">공동구매 참여자</h3>
                  {cobuySession && (
                    <span className="text-xs text-gray-400">{cobuySession.title}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={fetchCobuyParticipants}
                    disabled={loadingCobuyParticipants}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {loadingCobuyParticipants ? '불러오는 중...' : '새로고침'}
                  </button>
                  <button
                    onClick={handleDownloadCobuyExcel}
                    disabled={downloadingCobuyExcel}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 transition-colors disabled:opacity-60"
                    title={`공동구매 참여자 엑셀 다운로드 (${cobuySession?.title})`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloadingCobuyExcel ? '다운로드 중...' : '엑셀 다운로드'}
                  </button>
                </div>
              </div>
              <div className="p-4">
                {cobuyParticipantsError && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-3">
                    {cobuyParticipantsError}
                  </div>
                )}

                {loadingCobuyParticipants ? (
                  <div className="text-sm text-gray-500">불러오는 중...</div>
                ) : cobuyParticipants.length === 0 ? (
                  <div className="text-sm text-gray-500">
                    {cobuyParticipantSessionId ? '참여자가 없습니다.' : '세션 정보를 찾을 수 없습니다.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">총 {cobuyParticipants.length}명</div>
                    <div className="space-y-2">
                      {cobuyParticipants.map((participant) => (
                        <div key={participant.id} className="border border-gray-200 rounded-md p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{participant.name}</div>
                              <div className="mt-1 text-xs text-gray-600">{participant.email}</div>
                              <div className="text-xs text-gray-600">{participant.phone || '-'}</div>
                            </div>
                            <div className="text-right text-xs text-gray-600">
                              <div>
                                {cobuyPaymentStatusLabel[participant.payment_status] || participant.payment_status}
                              </div>
                              <div className="mt-1">사이즈: {participant.selected_size || '-'}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order Summary - hidden for factory users */}
          {!isFactoryUser && (
            <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <Receipt className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">주문 요약</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">소계</span>
                  <span className="font-medium text-gray-900">{subtotal.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">배송비</span>
                  <span className="font-medium text-gray-900">
                    {(order.delivery_fee ?? 0).toLocaleString()}원
                  </span>
                </div>
                {order.coupon_discount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>쿠폰 할인</span>
                    <span>-{order.coupon_discount.toLocaleString()}원</span>
                  </div>
                )}
                {order.admin_discount > 0 && (
                  editingSummaryField === 'discount' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-orange-600 shrink-0">할인</span>
                      <div className="flex-1 flex items-center gap-1">
                        <input
                          type="number" min="0" autoFocus
                          value={editingSummaryValue}
                          onChange={e => setEditingSummaryValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSummaryUpdate('discount'); if (e.key === 'Escape') setEditingSummaryField(null); }}
                          className="w-full p-1 text-sm border border-orange-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 text-right"
                        />
                        <span className="text-xs text-gray-400 shrink-0">원</span>
                      </div>
                      <button onClick={() => handleSummaryUpdate('discount')} disabled={savingSummaryField} className="p-1 text-orange-600 hover:bg-orange-50 rounded" title="저장">
                        {savingSummaryField ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => setEditingSummaryField(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="취소">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm text-orange-600 group">
                      <span>할인</span>
                      <div className="flex items-center gap-1">
                        <span>-{order.admin_discount.toLocaleString()}원</span>
                        <button
                          onClick={() => { setEditingSummaryField('discount'); setEditingSummaryValue(String(order.admin_discount)); }}
                          className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-orange-50 rounded transition-opacity" title="수정"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleSummaryRemove('discount')}
                          disabled={savingSummaryField}
                          className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-opacity" title="삭제"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )
                )}
                {order.admin_surcharge > 0 && (
                  editingSummaryField === 'surcharge' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-purple-600 shrink-0">추가 금액</span>
                      <div className="flex-1 flex items-center gap-1">
                        <input
                          type="number" min="0" autoFocus
                          value={editingSummaryValue}
                          onChange={e => setEditingSummaryValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSummaryUpdate('surcharge'); if (e.key === 'Escape') setEditingSummaryField(null); }}
                          className="w-full p-1 text-sm border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-right"
                        />
                        <span className="text-xs text-gray-400 shrink-0">원</span>
                      </div>
                      <button onClick={() => handleSummaryUpdate('surcharge')} disabled={savingSummaryField} className="p-1 text-purple-600 hover:bg-purple-50 rounded" title="저장">
                        {savingSummaryField ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => setEditingSummaryField(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="취소">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm text-purple-600 group">
                      <span>추가 금액</span>
                      <div className="flex items-center gap-1">
                        <span>+{order.admin_surcharge.toLocaleString()}원</span>
                        <button
                          onClick={() => { setEditingSummaryField('surcharge'); setEditingSummaryValue(String(order.admin_surcharge)); }}
                          className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-purple-50 rounded transition-opacity" title="수정"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleSummaryRemove('surcharge')}
                          disabled={savingSummaryField}
                          className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-400 hover:text-red-600 rounded transition-opacity" title="삭제"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )
                )}
                {/* Inline add discount when no discount exists */}
                {!(order.admin_discount > 0) && (
                  editingSummaryField === 'discount' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-orange-600 shrink-0">할인</span>
                      <div className="flex-1 flex items-center gap-1">
                        <input
                          type="number" min="0" autoFocus
                          value={editingSummaryValue}
                          onChange={e => setEditingSummaryValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSummaryUpdate('discount'); if (e.key === 'Escape') { setEditingSummaryField(null); setEditingSummaryValue(''); } }}
                          className="w-full p-1 text-sm border border-orange-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 text-right"
                          placeholder="할인 금액"
                        />
                        <span className="text-xs text-gray-400 shrink-0">원</span>
                      </div>
                      <button onClick={() => handleSummaryUpdate('discount')} disabled={savingSummaryField} className="p-1 text-orange-600 hover:bg-orange-50 rounded" title="저장">
                        {savingSummaryField ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => { setEditingSummaryField(null); setEditingSummaryValue(''); }} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="취소">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : null
                )}
                {/* Inline add surcharge when no surcharge exists */}
                {!(order.admin_surcharge > 0) && (
                  editingSummaryField === 'surcharge' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-purple-600 shrink-0">추가 금액</span>
                      <div className="flex-1 flex items-center gap-1">
                        <input
                          type="number" min="0" autoFocus
                          value={editingSummaryValue}
                          onChange={e => setEditingSummaryValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSummaryUpdate('surcharge'); if (e.key === 'Escape') { setEditingSummaryField(null); setEditingSummaryValue(''); } }}
                          className="w-full p-1 text-sm border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-right"
                          placeholder="추가 금액"
                        />
                        <span className="text-xs text-gray-400 shrink-0">원</span>
                      </div>
                      <button onClick={() => handleSummaryUpdate('surcharge')} disabled={savingSummaryField} className="p-1 text-purple-600 hover:bg-purple-50 rounded" title="저장">
                        {savingSummaryField ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => { setEditingSummaryField(null); setEditingSummaryValue(''); }} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="취소">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : null
                )}
                {(() => {
                  const computedTotal = subtotal
                    + (order.delivery_fee ?? 0)
                    - (order.coupon_discount ?? 0)
                    - (order.admin_discount ?? 0)
                    + (order.admin_surcharge ?? 0);
                  const diff = (order.total_amount ?? 0) - computedTotal;
                  if (diff === 0) return null;
                  // 할인이 소계를 초과하여 total_amount가 0으로 클램프된 경우엔
                  // 실제 추가 비용이 아니라 클램프 아티팩트이므로 라인을 숨김.
                  if (computedTotal < 0 && (order.total_amount ?? 0) === 0) return null;
                  return (
                    <div className={`flex justify-between text-sm ${diff > 0 ? 'text-indigo-600' : 'text-green-600'}`}>
                      <span>기타 조정</span>
                      <span>{diff > 0 ? '+' : ''}{diff.toLocaleString()}원</span>
                    </div>
                  );
                })()}
                <div className="border-t pt-3 flex justify-between">
                  <span className="text-sm font-semibold text-gray-900">총 금액</span>
                  <span className="text-base font-bold text-blue-600">
                    {(order.total_amount ?? 0).toLocaleString()}원
                  </span>
                </div>
                {(order.admin_discount ?? 0) > 0 && subtotal === 0 && (
                  <p className="text-xs text-gray-500 -mt-1">
                    고객이 수량을 입력하면 할인이 자동 적용됩니다.
                  </p>
                )}
                {/* Add discount / surcharge buttons */}
                {editingSummaryField === null && (
                  <div className="flex gap-2 pt-2">
                    {!(order.admin_discount > 0) && (
                      <button
                        onClick={() => { setEditingSummaryField('discount'); setEditingSummaryValue(''); }}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-orange-600 border border-orange-200 rounded-md hover:bg-orange-50 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> 할인 추가
                      </button>
                    )}
                    {!(order.admin_surcharge > 0) && (
                      <button
                        onClick={() => { setEditingSummaryField('surcharge'); setEditingSummaryValue(''); }}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-purple-600 border border-purple-200 rounded-md hover:bg-purple-50 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> 추가금액
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Factory Assignment */}
          <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
            <button
              onClick={() => setFactoryAccordionOpen(!factoryAccordionOpen)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/50 border-b border-gray-100"
            >
              <div className="flex items-center gap-2">
                <FactoryIcon className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">공장 배정</h3>
                {getItemFactoryIds().length > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${factoryStatusColor(getItemsFactoryStatus())}`}>
                    {factoryStatusLabel(getItemsFactoryStatus())}
                  </span>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${factoryAccordionOpen ? 'rotate-180' : ''}`} />
            </button>
            {factoryAccordionOpen && (
              <div className="p-4 space-y-2 text-sm">
                {orderItems.map((item) => {
                  const isExpanded = expandedFactoryItemId === item.id;
                  const alloc = itemAlloc[item.id];
                  return (
                    <div key={item.id} className="border border-gray-200 rounded-md overflow-hidden">
                      <button
                        type="button"
                        onClick={() => canAssign ? toggleItemAlloc(item) : undefined}
                        className={`w-full flex items-center gap-2 p-2 text-left transition-colors ${canAssign ? 'hover:bg-gray-50 cursor-pointer' : ''} ${isExpanded ? 'bg-blue-50/50' : 'bg-gray-50/50'}`}
                      >
                        <div className="w-8 h-8 bg-white rounded shrink-0 overflow-hidden border border-gray-200">
                          {item.thumbnail_url ? (
                            <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-3 h-3 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-900 truncate">{item.product_title}</div>
                          <div className="text-[10px] text-gray-500">x{item.quantity}</div>
                        </div>
                        <div className="text-xs text-right shrink-0 flex items-center gap-2">
                          <div>
                            <div className={item.assigned_manufacturer_id ? 'text-blue-600' : 'text-red-500'}>
                              {item.assigned_manufacturer_id ? getFactoryNameById(item.assigned_manufacturer_id) : '미배정'}
                            </div>
                            {item.factory_status && (
                              <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium mt-0.5 ${factoryStatusColor(item.factory_status)}`}>
                                {factoryStatusLabel(item.factory_status)}
                              </span>
                            )}
                          </div>
                          {canAssign && (
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          )}
                        </div>
                      </button>

                      {isExpanded && alloc && (
                        <div className="p-3 space-y-2 border-t border-gray-100 bg-white">
                          <div>
                            <label className="block text-[11px] text-gray-500 mb-0.5">공장 선택</label>
                            <select
                              value={alloc.factory_id}
                              onChange={(e) => updateItemAllocField(item.id, 'factory_id', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                            >
                              <option value="">선택하세요</option>
                              {factories.map((f) => (
                                <option key={f.id} value={f.id}>{f.name || f.email || f.id}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-0.5">금액</label>
                              <input
                                type="number"
                                value={alloc.amount}
                                onChange={(e) => updateItemAllocField(item.id, 'amount', e.target.value)}
                                placeholder="0"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-0.5">마감일</label>
                              <input
                                type="date"
                                value={alloc.deadline}
                                onChange={(e) => updateItemAllocField(item.id, 'deadline', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-0.5">결제 예정일</label>
                              <input
                                type="date"
                                value={alloc.pay_date}
                                onChange={(e) => updateItemAllocField(item.id, 'pay_date', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-0.5">결제 상태</label>
                              <select
                                value={alloc.pay_status}
                                onChange={(e) => updateItemAllocField(item.id, 'pay_status', e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                              >
                                <option value="pending">대기</option>
                                <option value="completed">완료</option>
                                <option value="cancelled">취소</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            {orderItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => applyAllocToAll(item.id)}
                                className="px-2 py-1 text-[11px] text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                              >
                                전체 적용
                              </button>
                            )}
                            <div className="flex-1" />
                            <button
                              type="button"
                              onClick={() => setExpandedFactoryItemId(null)}
                              className="px-3 py-1 text-[11px] text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => saveItemAlloc(item.id)}
                              disabled={!alloc.factory_id || savingItemAlloc === item.id}
                              className="px-3 py-1 text-[11px] text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              {savingItemAlloc === item.id ? '저장 중...' : '저장'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {canAssign && orderItems.length > 1 && Object.values(itemAlloc).some((a) => a.factory_id) && (
                  <button
                    type="button"
                    onClick={saveAllItemAllocs}
                    disabled={savingItemAlloc === 'all'}
                    className="w-full px-3 py-2 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {savingItemAlloc === 'all' ? '저장 중...' : '전체 저장'}
                  </button>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Customer Info - hidden for factory users */}
          {!isFactoryUser && (
            <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <User className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">고객 정보</h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-500">이름</p>
                  <p className="text-sm font-medium text-gray-900">{order.customer_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">이메일</p>
                  <p className="text-sm font-medium text-gray-900">{order.customer_email}</p>
                </div>
                {order.customer_phone && (
                  <div>
                    <p className="text-xs text-gray-500">전화번호</p>
                    <p className="text-sm font-medium text-gray-900">{order.customer_phone}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Shipping Info - hidden for factory users */}
          {!isFactoryUser && (
            <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <Truck className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">배송 정보</h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-500">배송 방법</p>
                  <p className="text-sm font-medium text-gray-900">
                    {order.shipping_method === 'pickup' ? '직접 수령' :
                     order.shipping_method === 'domestic' ? '국내 배송' :
                     order.shipping_method === 'international' ? '해외 배송' :
                     order.shipping_method || '-'}
                  </p>
                </div>
                {order.shipping_method === 'international' && order.country_code && (
                  <div>
                    <p className="text-xs text-gray-500">국가</p>
                    <p className="text-sm font-medium text-gray-900">{order.country_code}</p>
                  </div>
                )}
                {(order.postal_code || order.address_line_1) && (
                  <div>
                    <p className="text-xs text-gray-500">주소</p>
                    <p className="text-sm font-medium text-gray-900">
                      {order.postal_code && `[${order.postal_code}] `}
                      {order.address_line_1}
                      {order.address_line_2 && ` ${order.address_line_2}`}
                    </p>
                  </div>
                )}
                {order.shipping_method === 'international' && (order.state || order.city) && (
                  <div>
                    <p className="text-xs text-gray-500">지역</p>
                    <p className="text-sm font-medium text-gray-900">
                      {[order.state, order.city].filter(Boolean).join(' ')}
                    </p>
                  </div>
                )}
                {/* Logen Shipping Integration */}
                {order.shipping_method === 'domestic' && (
                  <div className="border-t border-gray-100 pt-3 mt-3 space-y-3">
                    {/* Status Steps */}
                    <div className="flex items-center gap-1 text-[10px]">
                      {[
                        { key: 'register', label: '접수', done: !!order.logen_registered_at },
                        { key: 'print', label: '송장출력', done: !!order.logen_slip_printed },
                        { key: 'shipping', label: '배송중', done: order.order_status === 'shipping' || order.order_status === 'delivered' },
                        { key: 'delivered', label: '배송완료', done: order.order_status === 'delivered' },
                      ].map((step, i, arr) => (
                        <div key={step.key} className="flex items-center gap-1">
                          <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-medium ${
                            step.done
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-400'
                          }`}>
                            {step.done ? <Check className="w-2.5 h-2.5" /> : <span className="w-2.5 h-2.5 inline-flex items-center justify-center">{i + 1}</span>}
                            {step.label}
                          </div>
                          {i < arr.length - 1 && <span className="text-gray-300">›</span>}
                        </div>
                      ))}
                    </div>

                    {/* Action Buttons */}
                    {!order.logen_registered_at && (
                      <button
                        onClick={() => { setLogenError(null); setShowLogenModal(true); }}
                        className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
                      >
                        택배 접수
                      </button>
                    )}

                    {order.logen_registered_at && !order.logen_slip_printed && (
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const takeDt = getKstYYYYMMDD();
                            const res = await fetch(`/api/admin/shipping/print?takeDt=${takeDt}`);
                            const json = await res.json();
                            if (res.ok && json.data?.url) {
                              window.open(json.data.url, 'logen_print', 'width=900,height=700');
                            } else {
                              alert(json.error || '출력 URL 생성 실패');
                            }
                          }}
                          className="flex-1 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors"
                        >
                          송장 출력
                        </button>
                        <button
                          onClick={async () => {
                            setLogenLoading(true);
                            try {
                              const res = await fetch('/api/admin/shipping/slip-no', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderIds: [order.id] }),
                              });
                              const json = await res.json();
                              if (res.ok && json.data?.updated?.length > 0) {
                                onOrderUpdate({
                                  ...order,
                                  tracking_number: json.data.updated[0].slipNo,
                                  logen_slip_printed: true,
                                  order_status: 'shipping',
                                } as Order);
                              } else {
                                alert(json.error || '아직 송장번호가 없습니다. 출력 후 다시 시도해주세요.');
                              }
                            } finally {
                              setLogenLoading(false);
                            }
                          }}
                          disabled={logenLoading}
                          className="flex-1 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {logenLoading ? '조회중...' : '송장번호 동기화'}
                        </button>
                      </div>
                    )}

                    {/* Tracking Number & History */}
                    {order.tracking_number && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-500">운송장 번호</p>
                            <p className="text-sm font-semibold text-gray-900 font-mono">{order.tracking_number}</p>
                          </div>
                          <button
                            onClick={async () => {
                              setTrackingLoading(true);
                              setTrackingHistory(null);
                              try {
                                const res = await fetch('/api/admin/shipping/tracking', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ slipNos: [order.tracking_number] }),
                                });
                                const json = await res.json();
                                if (res.ok && json.data?.tracking?.[0]?.data1) {
                                  setTrackingHistory(json.data.tracking[0].data1);
                                  if (json.data.deliveredCount > 0) {
                                    onOrderUpdate({ ...order, order_status: 'delivered' } as Order);
                                  }
                                } else {
                                  setTrackingHistory([]);
                                }
                              } catch {
                                setTrackingHistory([]);
                              } finally {
                                setTrackingLoading(false);
                              }
                            }}
                            disabled={trackingLoading}
                            className="px-2.5 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors"
                          >
                            {trackingLoading ? '조회중...' : '배송추적'}
                          </button>
                        </div>

                        {/* Tracking History Timeline */}
                        {trackingHistory && (
                          <div className="border border-gray-100 rounded bg-gray-50/50 max-h-48 overflow-y-auto">
                            {trackingHistory.length === 0 ? (
                              <p className="p-3 text-xs text-gray-400 text-center">추적 정보가 없습니다.</p>
                            ) : (
                              <div className="divide-y divide-gray-100">
                                {[...trackingHistory].reverse().map((s: any, i: number) => {
                                  const dt = s.scanDt ? `${s.scanDt.slice(0, 4)}.${s.scanDt.slice(4, 6)}.${s.scanDt.slice(6, 8)}` : '';
                                  const tm = s.scanTm ? `${s.scanTm.slice(0, 2)}:${s.scanTm.slice(2, 4)}` : '';
                                  const isDelivered = s.statNm?.includes('배송완료');
                                  return (
                                    <div key={i} className="flex gap-2 px-3 py-2 text-xs">
                                      <div className="w-20 shrink-0 text-gray-400">{dt}<br />{tm}</div>
                                      <div className="flex-1">
                                        <span className={`font-medium ${isDelivered ? 'text-green-700' : 'text-gray-800'}`}>
                                          {s.statNm}
                                        </span>
                                        {(s.salesNm || s.branNm) && (
                                          <span className="text-gray-400 ml-1">({s.salesNm || s.branNm})</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {order.logen_registered_at && (
                      <p className="text-[10px] text-gray-400">
                        접수: {formatKstDateTimeMedium(order.logen_registered_at)}
                      </p>
                    )}
                  </div>
                )}

                {/* Manual tracking for non-domestic or non-logen */}
                {order.shipping_method !== 'pickup' && order.shipping_method !== 'domestic' && (
                  <div className="border-t border-gray-100 pt-3 mt-3">
                    <p className="text-xs text-gray-500 mb-1.5">운송장 번호</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="운송장 번호 입력"
                        defaultValue={order.tracking_number || ''}
                        onBlur={async (e) => {
                          const val = e.target.value.trim();
                          if (val === (order.tracking_number || '')) return;
                          const res = await fetch('/api/admin/orders', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId: order.id, trackingNumber: val || null }),
                          });
                          if (res.ok) {
                            onOrderUpdate({ ...order, tracking_number: val || null } as Order);
                          }
                        }}
                        className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    {order.tracking_number && (
                      <p className="text-xs text-green-600 mt-1">등록됨: {order.tracking_number}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment Information - hidden for factory users */}
          {!isFactoryUser && (
            <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <CreditCard className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">결제 정보</h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-500">결제 수단</p>
                  <p className="text-sm font-medium text-gray-900">
                    {order.payment_method === 'toss'
                      ? '토스페이'
                      : order.payment_method === 'paypal'
                      ? 'PayPal'
                      : order.payment_method === 'admin'
                      ? '관리자 처리'
                      : order.payment_method === 'bank_transfer'
                      ? '무통장입금'
                      : order.payment_method === 'free'
                      ? '무료'
                      : '카드'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">결제 상태</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${paymentStatusColor(order.payment_status)}`}>
                    {paymentStatusLabel(order.payment_status)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500">주문 일시</p>
                  <p className="text-sm font-medium text-gray-900">{formatKstDateLong(order.created_at)}</p>
                </div>
                {/* Pricing adjustments info */}
                {(order.original_amount != null && order.original_amount !== order.total_amount) && (
                  <div className="pt-2 border-t border-gray-100 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">원래 금액</span>
                      <span className="text-gray-700">{order.original_amount.toLocaleString()}원</span>
                    </div>
                    {order.coupon_discount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-green-600">쿠폰 할인</span>
                        <span className="text-green-600">-{order.coupon_discount.toLocaleString()}원</span>
                      </div>
                    )}
                    {order.admin_discount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-orange-600">임의 할인</span>
                        <span className="text-orange-600">-{order.admin_discount.toLocaleString()}원</span>
                      </div>
                    )}
                    {order.admin_surcharge > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-purple-600">추가 금액</span>
                        <span className="text-purple-600">+{order.admin_surcharge.toLocaleString()}원</span>
                      </div>
                    )}
                    {order.pricing_note && (
                      <div className="text-xs text-gray-500 italic mt-1">메모: {order.pricing_note}</div>
                    )}
                  </div>
                )}
                {order.refund_reason && (
                  <div>
                    <p className="text-xs text-gray-500">환불 사유</p>
                    <p className="text-sm font-medium text-red-600">{order.refund_reason}</p>
                  </div>
                )}
                {/* Manual payment confirmation for pending orders */}
                {order.payment_status === 'pending' && (order.payment_method === 'bank_transfer' || order.payment_method === 'toss') && (
                  <button
                    onClick={async () => {
                      if (!confirm('이 주문의 결제를 완료 처리하시겠습니까?')) return;
                      try {
                        const res = await fetch('/api/admin/orders', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            orderId: order.id,
                            payment_status: 'completed',
                            orderStatus: 'payment_completed',
                          }),
                        });
                        if (res.ok) {
                          onOrderUpdate({ ...order, payment_status: 'completed', order_status: 'payment_completed' });
                          onUpdate();
                        }
                      } catch (e) {
                        console.error('Failed to update payment status:', e);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors mt-2"
                  >
                    <Check className="w-4 h-4" />
                    결제 완료 처리
                  </button>
                )}
                {order.payment_status === 'completed' && (
                  <button
                    onClick={() => setShowRefundModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors mt-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    환불 처리
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Bank Transfer Invoice Request Info */}
          {!isFactoryUser && order.payment_method === 'bank_transfer' && order.customer_note?.includes('[계좌이체 정보]') && (() => {
            try {
              const match = order.customer_note!.match(/\[계좌이체 정보\]\s*({.*})/);
              if (!match) return null;
              const info = JSON.parse(match[1]);
              if (!info.invoice_requested) return null;
              return (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                    <h3 className="text-sm font-semibold text-amber-900">계산서 발행 요청</h3>
                  </div>
                  <div className="p-4 space-y-2">
                    {info.invoice_email && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">수신 이메일</span>
                        <a href={`mailto:${info.invoice_email}`} className="text-blue-600 hover:underline font-medium">{info.invoice_email}</a>
                      </div>
                    )}
                    {info.biz_registration_url && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">사업자등록증</span>
                        <a href={info.biz_registration_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">파일 보기</a>
                      </div>
                    )}
                  </div>
                </div>
              );
            } catch {
              return null;
            }
          })()}

          {/* Payment Link - shown when payment_link_token exists */}
          {!isFactoryUser && order.payment_link_token && (
            <PaymentLinkCard token={order.payment_link_token} />
          )}

          {/* Generate Payment Link - for pending orders without a link */}
          {!isFactoryUser && !order.payment_link_token && order.payment_status === 'pending' && (
            <GeneratePaymentLinkCard
              orderId={order.id}
              onGenerated={(token) => {
                onOrderUpdate({ ...order, payment_link_token: token });
                onUpdate();
              }}
            />
          )}

          {/* Price Adjustment - shown for admin users */}
          {!isFactoryUser && (
            <PriceAdjustmentCard
              order={order}
              onUpdate={() => {
                onUpdate();
              }}
              onOrderUpdate={onOrderUpdate}
            />
          )}

          {/* Factory Order Info - shown only for factory users */}
          {isFactoryUser && (
            <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <FactoryIcon className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">주문 정보</h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-500">주문 구분</p>
                  <p className="text-sm font-medium text-gray-900">
                    {orderCategoryLabel(order.order_category)}
                  </p>
                </div>

                {/* Per-item factory info for factory users */}
                {orderItems.filter((i) => i.assigned_manufacturer_id).map((item) => (
                  <div key={item.id} className="border-t border-gray-100 pt-3 space-y-2">
                    <div className="text-xs font-medium text-gray-700 truncate">{item.product_title}</div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">배정 상태</p>
                      <select
                        value={item.factory_status || 'assigned'}
                        onChange={async (e) => {
                          try {
                            const response = await fetch('/api/admin/orders', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ orderId: order.id, orderItemId: item.id, factoryStatus: e.target.value }),
                            });
                            if (!response.ok) {
                              const payload = await response.json().catch(() => ({}));
                              throw new Error(payload?.error || '상태 변경에 실패했습니다.');
                            }
                            await fetchOrderItems();
                            onUpdate();
                          } catch (error) {
                            alert(error instanceof Error ? error.message : '상태 변경에 실패했습니다.');
                          }
                        }}
                        disabled={item.factory_status === 'shipped'}
                        className={`w-full px-3 py-2 rounded-md text-sm font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 ${factoryStatusColor(item.factory_status)}`}
                      >
                        <option value="assigned">배정완료</option>
                        <option value="in_progress">작업중</option>
                        <option value="completed">작업완료</option>
                        <option value="shipped">출고완료</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-gray-500">마감일</p>
                        <p className="font-medium text-gray-900">{item.deadline ? formatKstDateLong(item.deadline) : '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">금액</p>
                        <p className="font-medium text-gray-900">{item.factory_amount ? `${item.factory_amount.toLocaleString()}원` : '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">결제 예정일</p>
                        <p className="font-medium text-gray-900">{item.factory_payment_date ? formatKstDateLong(item.factory_payment_date) : '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">결제 상태</p>
                        <p className="font-medium text-gray-900">
                          {item.factory_payment_status === 'pending' ? '대기' :
                           item.factory_payment_status === 'completed' ? '완료' :
                           item.factory_payment_status === 'cancelled' ? '취소' : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cobuyError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {cobuyError}
            </div>
          )}

        </div>
      </div>

      {/* Refund Modal */}
      {showRefundModal && (
        <RefundModal
          order={order}
          onClose={() => setShowRefundModal(false)}
          onSuccess={() => {
            setShowRefundModal(false);
            onUpdate();
          }}
        />
      )}

      <AddOrderItemModal
        orderId={order.id}
        isOpen={showAddItemModal}
        onClose={() => { setShowAddItemModal(false); setEditingOrderItem(null); }}
        onAdded={handleItemAdded}
        initialDesignId={initialAddItemDesignId}
        editingItem={editingOrderItem}
      />

      <OrderProfitSection order={order} orderItems={orderItems} />
    </div>
  );
}

// --- Sub-components ---

function PaymentLinkCard({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const paymentUrl = `https://modoouniform.com/order/custom/${token}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(paymentUrl);
    } catch {
      const input = document.createElement('input');
      input.value = paymentUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-blue-200 rounded-md shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-100 bg-blue-50/50">
        <Link2 className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-blue-900">고객 결제 링크</h3>
      </div>
      <div className="p-4">
        <p className="text-xs text-gray-500 mb-2">아래 링크를 고객에게 공유하면 결제할 수 있습니다.</p>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={paymentUrl}
            className="flex-1 p-2 text-xs border border-gray-200 rounded bg-gray-50 text-gray-600 truncate"
          />
          <button
            onClick={handleCopy}
            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 text-xs whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? '복사됨' : '복사'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GeneratePaymentLinkCard({ orderId, onGenerated }: { orderId: string; onGenerated: (token: string) => void }) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!confirm('이 주문에 대한 결제 링크를 생성하시겠습니까?\n고객이 이 링크를 통해 카드 결제할 수 있습니다.')) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, generate_payment_link: true }),
      });
      if (res.ok) {
        const { data } = await res.json();
        onGenerated(data.payment_link_token);
      } else {
        alert('결제 링크 생성에 실패했습니다.');
      }
    } catch {
      alert('결제 링크 생성에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <Link2 className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-900">결제 링크</h3>
      </div>
      <div className="p-4">
        <p className="text-xs text-gray-500 mb-3">결제 링크를 생성하여 고객에게 카드 결제를 안내할 수 있습니다.</p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Link2 className="w-4 h-4" />
          {generating ? '생성 중...' : '결제 링크 생성'}
        </button>
      </div>
    </div>
  );
}

type AdjustMode = 'set_total' | 'discount_fixed' | 'discount_rate' | 'surcharge' | 'reset';

function PriceAdjustmentCard({
  order,
  onUpdate,
  onOrderUpdate,
}: {
  order: Order;
  onUpdate: () => void;
  onOrderUpdate: (order: Order) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [mode, setMode] = useState<AdjustMode>('set_total');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseAmount = order.original_amount ?? order.total_amount;

  const resetPreview = useMemo(() => {
    return Math.max(0, baseAmount + (order.delivery_fee ?? 0) - (order.coupon_discount ?? 0));
  }, [baseAmount, order.delivery_fee, order.coupon_discount]);

  const preview = useMemo(() => {
    if (mode === 'reset') return resetPreview;
    const v = parseFloat(value) || 0;
    if (v <= 0) return null;
    switch (mode) {
      case 'set_total':
        return v;
      case 'discount_fixed':
        return Math.max(0, baseAmount - v);
      case 'discount_rate':
        return Math.max(0, baseAmount - Math.floor(baseAmount * (v / 100)));
      case 'surcharge':
        return baseAmount + v;
      default:
        return null;
    }
  }, [mode, value, baseAmount, resetPreview]);

  const handleSave = async () => {
    if (mode === 'reset') {
      if (!confirm('할인/추가금액을 모두 제거하고 원래 금액으로 복원하시겠습니까?')) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            priceAdjustment: { mode: 'reset', note: note.trim() || undefined },
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || '초기화에 실패했습니다.'); return; }
        onOrderUpdate(data.data as Order);
        onUpdate();
        setIsEditing(false);
        setValue('');
        setNote('');
      } catch {
        setError('초기화 중 오류가 발생했습니다.');
      } finally {
        setSaving(false);
      }
      return;
    }

    const v = parseFloat(value);
    if (!v || v <= 0) {
      setError('금액을 입력해주세요.');
      return;
    }
    if (mode === 'discount_rate' && v > 100) {
      setError('할인율은 100% 이하여야 합니다.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          priceAdjustment: { mode, value: v, note: note.trim() || undefined },
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '금액 변경에 실패했습니다.');
        return;
      }

      onOrderUpdate(data.data as Order);
      onUpdate();
      setIsEditing(false);
      setValue('');
      setNote('');
    } catch {
      setError('금액 변경 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">금액 관리</h3>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            <Pencil className="w-3 h-3" />
            금액 변경
          </button>
        )}
      </div>
      <div className="p-4">
        {/* Current amount summary */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">현재 결제 금액</span>
            <span className="font-bold text-gray-900">{order.total_amount.toLocaleString()}원</span>
          </div>
          {order.original_amount != null && order.original_amount !== order.total_amount && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>원래 금액</span>
              <span className="line-through">{order.original_amount.toLocaleString()}원</span>
            </div>
          )}
        </div>

        {isEditing && (
          <div className="pt-3 border-t border-gray-100 space-y-3">
            {/* Mode selection */}
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'set_total' as const, label: '금액 지정' },
                { key: 'discount_fixed' as const, label: '금액 할인' },
                { key: 'discount_rate' as const, label: '할인율(%)' },
                { key: 'surcharge' as const, label: '금액 추가' },
                { key: 'reset' as const, label: '초기화' },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setMode(opt.key); setValue(''); setError(null); }}
                  className={`px-3 py-2 text-xs rounded-md border font-medium transition-colors ${
                    mode === opt.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Value input */}
            {mode === 'reset' ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-xs text-amber-800">할인/추가금액을 모두 제거하고 원래 금액으로 복원합니다.</p>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={value}
                  onChange={(e) => { setValue(e.target.value); setError(null); }}
                  placeholder={
                    mode === 'set_total' ? '최종 결제 금액'
                    : mode === 'discount_fixed' ? '할인할 금액'
                    : mode === 'discount_rate' ? '할인 비율'
                    : '추가할 금액'
                  }
                  className="w-full p-2.5 pr-10 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  {mode === 'discount_rate' ? '%' : '원'}
                </span>
              </div>
            )}

            {/* Preview */}
            {preview !== null && (
              <div className="flex justify-between items-center p-2 bg-blue-50 rounded-md">
                <span className="text-xs text-blue-700">변경 후 결제 금액</span>
                <span className="text-sm font-bold text-blue-800">{preview.toLocaleString()}원</span>
              </div>
            )}

            {/* Note */}
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="변경 사유 (선택)"
              className="w-full p-2.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => { setIsEditing(false); setValue(''); setNote(''); setError(null); }}
                className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-md text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
              >
                <X className="w-3 h-3" />
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (mode !== 'reset' && !value)}
                className="flex-1 px-3 py-2 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                적용
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
