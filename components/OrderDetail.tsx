'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { CoBuyParticipant, Factory, Order, OrderItem } from '@/types/types';
import { ChevronLeft, ChevronDown, CreditCard, Package, Factory as FactoryIcon, Download, Share2, Copy, Check, Link2Off, RotateCcw, MessageSquare, User, Receipt, Truck, Link2, Pencil, X, Loader2, Send, Plus, Minus, Trash2, Coins } from 'lucide-react';
import RefundModal from '@/components/orders/RefundModal';
import SurchargeModal from '@/components/orders/SurchargeModal';
import DesignChatPanel from '@/components/orders/DesignChatPanel';
import OrderAttachmentSection from '@/components/orders/OrderAttachmentSection';
import AddOrderItemModal from '@/components/orders/AddOrderItemModal';
import OrderProfitSection from '@/components/orders/OrderProfitSection';
import WorkPhotoModal from '@/components/orders/WorkPhotoModal';
import OrderItemArtworksModal from '@/components/orders/OrderItemArtworksModal';
import OrderItemPrintRowsInline from '@/components/orders/OrderItemPrintRowsInline';
import ProofAlimtalkLogPanel from '@/components/orders/ProofAlimtalkLogPanel';
import { extractVariants } from '@/lib/orderUtils';
import FactoryPriceConfirmModal from '@/components/factory/FactoryPriceConfirmModal';
import { coerceImageUrlsBySide, isPreviewableImageEntry, fileExtensionLabel } from '@/lib/downloadUtils';
import { formatKstDateLong, formatKstDateTimeMedium, getKstYYYYMMDD } from '@/lib/kst';
import { orderCategoryBadgeClass, orderCategoryLabel } from '@/lib/order-category';
import AssigneePicker from '@/components/common/AssigneePicker';

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

function getOrderSourceInfo(order: Pick<Order, 'id' | 'order_category' | 'partner_mall_id'>) {
  if (order.order_category === 'surcharge') {
    return { label: '차액주문', className: 'bg-orange-100 text-orange-800' };
  }
  if (order.order_category === 'quick') {
    return { label: '간이주문', className: 'bg-amber-100 text-amber-800' };
  }
  if (order.id.startsWith('ORDER-')) {
    return { label: '관리자생성주문', className: 'bg-purple-100 text-purple-800' };
  }
  if (order.order_category === 'salesman_direct') {
    return { label: '영업직접주문', className: 'bg-emerald-100 text-emerald-800' };
  }
  if (order.partner_mall_id) {
    return { label: '영업몰고객주문', className: 'bg-teal-100 text-teal-800' };
  }
  return { label: '고객직접주문', className: 'bg-sky-100 text-sky-800' };
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
  // 작업사진 모달 (카메라 촬영·업로드 + Drive 폴더 열기 통합)
  const [workPhotoModalItemId, setWorkPhotoModalItemId] = useState<string | null>(null);
  const [artworksModalItemId, setArtworksModalItemId] = useState<string | null>(null);
  const [priceModalItem, setPriceModalItem] = useState<OrderItem | null>(null);
  const [savingPriceModal, setSavingPriceModal] = useState(false);
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
  const [showSurchargeModal, setShowSurchargeModal] = useState(false);
  // 이 주문에 연결된 차액(추가) 주문 목록 (이 주문이 원주문일 때)
  const [childSurcharges, setChildSurcharges] = useState<Array<{ id: string; total_amount: number; payment_status: string; order_status: string }>>([]);
  const [factoryAccordionOpen, setFactoryAccordionOpen] = useState(false);
  const [chatItemId, setChatItemId] = useState<string | null>(null);
  const [localAttachmentUrls, setLocalAttachmentUrls] = useState<string[]>(order.attachment_urls || []);

  // Share link state
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [generatingShareLink, setGeneratingShareLink] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [sendingDesignItemId, setSendingDesignItemId] = useState<string | null>(null);
  const [sendingAllDesigns, setSendingAllDesigns] = useState(false);
  // 확정본을 고객 '내 디자인'으로 수동 반영 (자동 반영은 고객 시안확정 시점에 수행됨)
  const [syncingDesignItemId, setSyncingDesignItemId] = useState<string | null>(null);

  // 시안확인 수동발송 — 카카오 채널 장애로 알림톡 자동발송이 막혔을 때 운영자가 문구를 복사해 직접 보낸다.
  type ManualProof = { customerName: string; phone: string | null; label: string; text: string };
  const [manualProof, setManualProof] = useState<ManualProof | null>(null);
  const [manualProofBusyId, setManualProofBusyId] = useState<string | null>(null);
  const [manualProofCopied, setManualProofCopied] = useState(false);

  // Logen shipping state
  const [showLogenModal, setShowLogenModal] = useState(false);
  const [logenLoading, setLogenLoading] = useState(false);
  const [logenError, setLogenError] = useState<string | null>(null);
  // 택배 접수 케이스 (4종) + 발/수/운임 편집 상태
  type ShippingCase = 'us_to_customer' | 'us_to_factory' | 'factory_to_us' | 'factory_to_customer';
  const [shippingCase, setShippingCase] = useState<ShippingCase>('us_to_customer');
  const [shippingFactoryId, setShippingFactoryId] = useState<string>('');
  const [senderForm, setSenderForm] = useState({ name: '', addr: '', tel: '' });
  const [receiverForm, setReceiverForm] = useState({ name: '', addr: '', tel: '' });
  const [fareTyForm, setFareTyForm] = useState<'010' | '020' | '030' | '040'>('010');
  // 실제 발송 박스 수 — 상품 수량과 별개. 기본 1박스, 포장 결과에 맞춰 관리자가 조절한다.
  const [boxQtyForm, setBoxQtyForm] = useState<string>('1');
  // 송장번호 수동 입력 (SmartLogen 등 API 외 경로로 접수한 건용)
  const [showManualTracking, setShowManualTracking] = useState(false);
  const [manualTrackingNo, setManualTrackingNo] = useState('');
  const [manualCarrier, setManualCarrier] = useState('logen');
  const [manualTrackingSaving, setManualTrackingSaving] = useState(false);
  const [manualTrackingError, setManualTrackingError] = useState<string | null>(null);
  const [trackingHistory, setTrackingHistory] = useState<any[] | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const handleSendAllDesigns = useCallback(async () => {
    if (!confirm('이 주문의 모든 준비된 시안을 한 번에 고객에게 확인요청 하시겠습니까?')) return;
    setSendingAllDesigns(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/send-design`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const sharedIds: string[] = Array.isArray(data.shared) ? data.shared : [];
        const sharedSet = new Set(sharedIds);
        const now = new Date().toISOString();
        setOrderItems((prev) =>
          prev.map((item) =>
            sharedSet.has(item.id)
              ? { ...item, design_status: 'design_shared', design_shared_at: now }
              : item
          )
        );
        const skipped: Array<{ label: string; reason: string }> = Array.isArray(data.skipped) ? data.skipped : [];
        let msg = `${sharedIds.length}개 상품 시안 확인요청을 발송했습니다.`;
        if (skipped.length > 0) {
          msg += `\n\n제외된 상품 ${skipped.length}개:\n` + skipped.map((s) => ` - ${s.label} (${s.reason})`).join('\n');
        }
        msg += '\n\n알림톡은 워커 처리 후 내역에 표시됩니다.';
        alert(msg);
      } else {
        alert(data.error || '일괄 발송에 실패했습니다.');
      }
    } catch {
      alert('일괄 발송 중 오류가 발생했습니다.');
    } finally {
      setSendingAllDesigns(false);
    }
  }, [order.id]);

  const handleSendDesign = useCallback(async (itemId: string) => {
    if (!confirm('고객에게 시안확인요청을 보내시겠습니까? (고객이 링크에서 실제 출력 화면을 보고 확정/수정요청)')) return;
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
        alert('시안 확인 이메일이 발송되었습니다. 알림톡은 워커 처리 후 내역에 표시됩니다.');
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

  // 주문 상품의 현재 아트워크를 고객 '내 디자인'에 수동 반영 (전화 확정 대행·과거 확정 건 소급용)
  const handleSyncDesignToCustomer = useCallback(async (itemId: string) => {
    if (!confirm('이 상품의 현재 디자인(확정본)을 고객의 [내 디자인]에 반영하시겠습니까?')) return;
    setSyncingDesignItemId(itemId);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/items/${itemId}/sync-design`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || '고객 디자인에 반영했습니다.');
      } else {
        alert(data.error || '반영에 실패했습니다.');
      }
    } catch {
      alert('반영 중 오류가 발생했습니다.');
    } finally {
      setSyncingDesignItemId(null);
    }
  }, [order.id]);

  const openManualProof = useCallback((message: ManualProof) => {
    setManualProof(message);
    setManualProofCopied(false);
  }, []);

  // 이미 시안확인요청을 보낸 품목의 문구를 다시 꺼내온다 (상태 변화 없음).
  const handleCopyManualProof = useCallback(async (itemId: string) => {
    setManualProofBusyId(itemId);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/items/${itemId}/send-design`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.manualMessage) {
        openManualProof(data.manualMessage);
      } else {
        alert(data.error || '문구를 불러오지 못했습니다.');
      }
    } catch {
      alert('문구를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setManualProofBusyId(null);
    }
  }, [order.id, openManualProof]);

  // 수동발송: 자동발송과 똑같이 상태 전환 + 안내 메일을 태우고, 카톡에 붙여넣을 문구를 띄운다.
  const handleManualSendDesign = useCallback(async (itemId: string) => {
    if (!confirm('시안확인요청을 보내고, 카카오톡에 붙여넣을 문구를 띄웁니다.\n(고객 확정 링크가 살아나려면 이 전환이 필요합니다)')) return;
    setManualProofBusyId(itemId);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/items/${itemId}/send-design`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data.manualMessage) {
        setOrderItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, design_status: 'design_shared', design_shared_at: new Date().toISOString() }
              : item
          )
        );
        openManualProof(data.manualMessage);
        // 메일만 실패한 경우에도 문구는 내려온다 — 상태는 이미 전환됐으니 카톡 발송으로 이어가면 된다.
        if (!res.ok) alert(`${data.error}\n\n시안 상태는 전환됐습니다. 아래 문구로 카톡 발송을 진행해 주세요.`);
      } else {
        alert(data.error || '수동발송 준비에 실패했습니다.');
      }
    } catch {
      alert('수동발송 준비 중 오류가 발생했습니다.');
    } finally {
      setManualProofBusyId(null);
    }
  }, [order.id, openManualProof]);

  const handleManualSendAllDesigns = useCallback(async () => {
    if (!confirm('이 주문의 모든 준비된 시안을 확인요청하고, 카카오톡에 붙여넣을 문구를 띄웁니다.')) return;
    setManualProofBusyId('__all__');
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/send-design`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data.manualMessage) {
        const sharedSet = new Set<string>(Array.isArray(data.shared) ? data.shared : []);
        const now = new Date().toISOString();
        setOrderItems((prev) =>
          prev.map((item) =>
            sharedSet.has(item.id) ? { ...item, design_status: 'design_shared', design_shared_at: now } : item
          )
        );
        openManualProof(data.manualMessage);
        if (!res.ok) alert(`${data.error}\n\n시안 상태는 전환됐습니다. 아래 문구로 카톡 발송을 진행해 주세요.`);
      } else {
        alert(data.error || '수동발송 준비에 실패했습니다.');
      }
    } catch {
      alert('수동발송 준비 중 오류가 발생했습니다.');
    } finally {
      setManualProofBusyId(null);
    }
  }, [order.id, openManualProof]);

  const handleCopyManualProofText = useCallback(async () => {
    if (!manualProof) return;
    try {
      await navigator.clipboard.writeText(manualProof.text);
      setManualProofCopied(true);
      setTimeout(() => setManualProofCopied(false), 2000);
    } catch {
      alert('복사에 실패했습니다. 문구를 직접 선택해 복사해 주세요.');
    }
  }, [manualProof]);

  useEffect(() => {
    fetchOrderItems();
  }, [order.id]);

  useEffect(() => {
    fetchCobuySession();
  }, [order.id]);

  // 연결된 차액(추가) 주문 조회 — 원주문 상세에서 "추가분 N건" 안내용. 공장 사용자/차액주문 자신은 생략.
  useEffect(() => {
    if (isFactoryUser || order.order_category === 'surcharge') {
      setChildSurcharges([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders?parentOrderId=${encodeURIComponent(order.id)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setChildSurcharges(Array.isArray(json?.data) ? json.data : []);
      } catch {
        /* noop */
      }
    })();
    return () => { cancelled = true; };
  }, [order.id, order.order_category, isFactoryUser]);

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

  const updateAssignee = async (next: string | null) => {
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, salesman_id: next }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error || '담당자 변경에 실패했습니다.');
      }
      if (json?.data) {
        onOrderUpdate(json.data as Order);
      }
      onUpdate();
    } catch (error) {
      alert(error instanceof Error ? error.message : '담당자 변경에 실패했습니다.');
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
  const orderSourceInfo = getOrderSourceInfo(order);

  // 배경제거 기능을 쓴 주문 아이템의 고객 원본 이미지(kind === 'original').
  // 디자인 에셋(order_items.image_urls)에만 저장되므로, 고객이 결제 시 올린
  // attachment_urls 첨부와 별개로 여기 "첨부파일" 섹션에서도 함께 보이도록 모은다.
  const originalDesignImages = useMemo(() => {
    const out: Array<{ url: string; fileName?: string; productTitle?: string }> = [];
    const seen = new Set<string>();
    orderItems.forEach((item) => {
      const bySide = coerceImageUrlsBySide(item.image_urls);
      Object.values(bySide).forEach((images) => {
        images.forEach((img) => {
          if (img.kind === 'original' && img.url && !seen.has(img.url)) {
            seen.add(img.url);
            out.push({ url: img.url, fileName: img.fileName, productTitle: item.product_title });
          }
        });
      });
    });
    return out;
  }, [orderItems]);

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
    const item = orderItems.find((i) => i.id === itemId);
    if (!item?.product_id) {
      router.push(`/orders/${order.id}/items/${itemId}`);
      return;
    }
    const returnUrl = encodeURIComponent(`/orders/${order.id}`);
    const url = `/editor/${item.product_id}?mode=order&orderId=${order.id}&orderItemId=${itemId}&returnUrl=${returnUrl}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [router, order.id, orderItems]);

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

  // 우리 회사 정보 (4-케이스에서 발/수에 모두 쓰임)
  const COMPANY_INFO = { name: '모두의 유니폼', addr: '서울특별시 마포구 성지3길 55 3층', tel: '010-8140-0621' };
  // 주문 고객 정보 → 발/수 폼 채움용
  const customerInfo = useMemo(() => ({
    name: order.customer_name || '',
    addr: `${order.postal_code ? `[${order.postal_code}] ` : ''}${order.address_line_1 || ''}${order.address_line_2 ? ` ${order.address_line_2}` : ''}`.trim(),
    tel: order.customer_phone || '',
  }), [order.customer_name, order.customer_phone, order.postal_code, order.address_line_1, order.address_line_2]);

  // 그 주문에 배정된 공장 후보
  const assignedFactoryIds = useMemo(
    () => Array.from(new Set((orderItems || []).map((i) => i.assigned_manufacturer_id).filter(Boolean))) as string[],
    [orderItems]
  );
  const factoryById = useCallback((id: string) => factories.find((f) => f.id === id) || null, [factories]);
  const factoryToParty = (f: Factory | null) => ({ name: f?.name || '', addr: f?.address || '', tel: f?.phone_number || '' });

  // 모달 열릴 때 + 케이스/공장 바뀔 때 발/수/운임 자동 채움
  useEffect(() => {
    if (!showLogenModal) return;
    const fac = shippingFactoryId ? factoryById(shippingFactoryId) : null;
    const facParty = factoryToParty(fac);
    if (shippingCase === 'us_to_customer') {
      setSenderForm(COMPANY_INFO); setReceiverForm(customerInfo); setFareTyForm('010');
    } else if (shippingCase === 'us_to_factory') {
      setSenderForm(COMPANY_INFO); setReceiverForm(facParty); setFareTyForm('010');
    } else if (shippingCase === 'factory_to_us') {
      setSenderForm(facParty); setReceiverForm(COMPANY_INFO); setFareTyForm('020');
    } else if (shippingCase === 'factory_to_customer') {
      setSenderForm(facParty); setReceiverForm(customerInfo); setFareTyForm('010');
    }
  }, [showLogenModal, shippingCase, shippingFactoryId, customerInfo, factoryById]);

  // 모달 처음 열릴 때 기본값 — 배정 공장 1개면 자동 선택
  useEffect(() => {
    if (!showLogenModal) return;
    setShippingCase('us_to_customer');
    setShippingFactoryId(assignedFactoryIds[0] || '');
    setBoxQtyForm('1');
  }, [showLogenModal, assignedFactoryIds]);

  const MAX_BOX_QTY = 99;
  const parsedBoxQty = Number(boxQtyForm);
  const boxQtyValid = /^\d+$/.test(boxQtyForm.trim()) && Number.isInteger(parsedBoxQty)
    && parsedBoxQty >= 1 && parsedBoxQty <= MAX_BOX_QTY;
  const stepBoxQty = (delta: number) => {
    const base = boxQtyValid ? parsedBoxQty : 1;
    setBoxQtyForm(String(Math.min(MAX_BOX_QTY, Math.max(1, base + delta))));
  };

  const totalQty = (orderItems || []).reduce((sum, item) => sum + (item.quantity || 1), 0);
  const goodsNm = (orderItems || []).map((item) => item.product_title).join(', ').slice(0, 80) || '상품';

  const fareTyLabel = (t: string) =>
    t === '010' ? '선불' : t === '020' ? '착불' : t === '030' ? '신용' : '본사신용';

  const needsFactory = shippingCase !== 'us_to_customer';
  const factoryParty = shippingFactoryId ? factoryToParty(factoryById(shippingFactoryId)) : null;
  const factoryInfoIncomplete = needsFactory && (!factoryParty?.name || !factoryParty?.addr || !factoryParty?.tel);

  const handleLogenRegister = async () => {
    if (!senderForm.name || !senderForm.addr || !senderForm.tel || !receiverForm.name || !receiverForm.addr || !receiverForm.tel) {
      setLogenError('발송자/수신자의 이름·주소·연락처를 모두 입력해 주세요.');
      return;
    }
    if (!boxQtyValid) {
      setLogenError(`박스 수량은 1~${MAX_BOX_QTY} 사이의 숫자로 입력해 주세요.`);
      return;
    }
    setLogenLoading(true);
    setLogenError(null);
    try {
      const res = await fetch('/api/admin/shipping/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: [order.id],
          shippingCase,
          sender: senderForm,
          receiver: receiverForm,
          fareTy: fareTyForm,
          boxQty: parsedBoxQty,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setShowLogenModal(false);
        // 내부 이동(우리↔공장)은 주문 레벨 배송 상태를 점유하지 않는다.
        // logen_registered_at을 찍지 않아야 이후 고객행(우리/공장→고객) 접수가 가능하다.
        if (json?.data?.internal) {
          onOrderUpdate({ ...order } as Order);
        } else {
          onOrderUpdate({
            ...order,
            logen_registered_at: new Date().toISOString(),
            tracking_carrier: 'logen',
            shipping_box_qty: parsedBoxQty,
          } as Order);
        }
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
              {/* 배송 유형 (4-케이스) */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">배송 유형</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { v: 'us_to_customer', label: '우리 → 고객', desc: '일반 출고' },
                    { v: 'us_to_factory', label: '우리 → 공장', desc: '자재 출고' },
                    { v: 'factory_to_us', label: '공장 → 우리', desc: '완성품 회수' },
                    { v: 'factory_to_customer', label: '공장 → 고객', desc: '드롭쉽' },
                  ] as { v: ShippingCase; label: string; desc: string }[]).map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => setShippingCase(opt.v)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                        shippingCase === opt.v ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 공장 선택 (us_to_customer 제외) */}
              {needsFactory && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">공장 선택</p>
                  <select
                    value={shippingFactoryId}
                    onChange={(e) => setShippingFactoryId(e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-300 rounded text-sm bg-white"
                  >
                    <option value="">공장을 선택하세요</option>
                    {/* 배정된 공장 먼저 */}
                    {assignedFactoryIds.length > 0 && (
                      <optgroup label="이 주문 배정 공장">
                        {assignedFactoryIds.map((id) => {
                          const f = factoryById(id);
                          return <option key={id} value={id}>{f?.name || id}</option>;
                        })}
                      </optgroup>
                    )}
                    <optgroup label="전체 공장">
                      {factories.filter((f) => f.is_active !== false).map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </optgroup>
                  </select>
                  {factoryInfoIncomplete && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      ⚠ 이 공장의 주소/연락처가 비어있어 아래에 직접 입력해 주세요. (공장 관리에서 보강 권장)
                    </p>
                  )}
                </div>
              )}

              {/* 보내는 분 (편집 가능) */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">보내는 분</p>
                <div className="space-y-1.5">
                  <input
                    value={senderForm.name}
                    onChange={(e) => setSenderForm({ ...senderForm, name: e.target.value })}
                    placeholder="이름/상호"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm"
                  />
                  <input
                    value={senderForm.addr}
                    onChange={(e) => setSenderForm({ ...senderForm, addr: e.target.value })}
                    placeholder="주소"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm"
                  />
                  <input
                    value={senderForm.tel}
                    onChange={(e) => setSenderForm({ ...senderForm, tel: e.target.value })}
                    placeholder="연락처"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm font-mono"
                  />
                </div>
              </div>

              {/* 받는 분 (편집 가능) */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">받는 분</p>
                <div className="space-y-1.5">
                  <input
                    value={receiverForm.name}
                    onChange={(e) => setReceiverForm({ ...receiverForm, name: e.target.value })}
                    placeholder="이름/상호"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm"
                  />
                  <input
                    value={receiverForm.addr}
                    onChange={(e) => setReceiverForm({ ...receiverForm, addr: e.target.value })}
                    placeholder="주소"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm"
                  />
                  <input
                    value={receiverForm.tel}
                    onChange={(e) => setReceiverForm({ ...receiverForm, tel: e.target.value })}
                    placeholder="연락처"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm font-mono"
                  />
                </div>
              </div>

              {/* 택배 박스 수량 — 상품 수량과 별개(실제 포장 결과) */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">택배 박스 수량</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepBoxQty(-1)}
                    disabled={boxQtyValid && parsedBoxQty <= 1}
                    className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="박스 수량 감소"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={MAX_BOX_QTY}
                    step={1}
                    value={boxQtyForm}
                    onChange={(e) => setBoxQtyForm(e.target.value)}
                    className={`w-20 px-2.5 py-1.5 border rounded text-sm text-center font-medium ${
                      boxQtyValid ? 'border-gray-300' : 'border-red-300 bg-red-50'
                    }`}
                    aria-label="박스 수량"
                  />
                  <button
                    type="button"
                    onClick={() => stepBoxQty(1)}
                    disabled={boxQtyValid && parsedBoxQty >= MAX_BOX_QTY}
                    className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="박스 수량 증가"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-gray-500">박스</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  실제로 발송하는 박스 개수입니다. 상품 수량({totalQty}개)과는 별개이며, 박스 수만큼 송장이 발행되고 운임도 박스당 청구됩니다.
                </p>
                {!boxQtyValid && (
                  <p className="text-[11px] text-red-600 mt-1">1~{MAX_BOX_QTY} 사이의 숫자를 입력해 주세요.</p>
                )}
              </div>

              {/* 운임타입 + 물품 요약 */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">운임타입 / 물품</p>
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">운임타입</span>
                    <select
                      value={fareTyForm}
                      onChange={(e) => setFareTyForm(e.target.value as '010' | '020' | '030' | '040')}
                      className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                    >
                      <option value="040">본사신용 (040)</option>
                      <option value="010">선불 (010)</option>
                      <option value="020">착불 (020)</option>
                      <option value="030">신용 (030)</option>
                    </select>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-600">물품명</span><span className="font-medium text-gray-900 text-right max-w-[60%] truncate">{goodsNm}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">상품 수량</span><span className="font-medium text-gray-900">{totalQty}개</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">박스 수량</span><span className="font-medium text-gray-900">{boxQtyValid ? `${parsedBoxQty}박스` : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">운임</span><span className="font-medium text-gray-900">{(order.delivery_fee || 0).toLocaleString()}원 · {fareTyLabel(fareTyForm)}</span></div>
                </div>
              </div>

              {logenError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{logenError}</div>
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
                disabled={logenLoading || !boxQtyValid || !senderForm.name || !senderForm.addr || !senderForm.tel || !receiverForm.name || !receiverForm.addr || !receiverForm.tel}
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

      {/* 차액(추가) 주문 경고 배너 — 작업자/발주자가 "전체 주문"으로 착각하지 않도록 */}
      {order.order_category === 'surcharge' && order.parent_order_id && (
        <div className="rounded-md border-2 border-orange-300 bg-orange-50 px-4 py-3">
          <p className="text-sm font-bold text-orange-900 flex items-center gap-2">
            <Coins className="w-4 h-4" />
            차액(추가) 주문입니다 — 전체 주문이 아닙니다
          </p>
          <p className="mt-1 text-sm text-orange-800">
            원주문 <span className="font-mono font-semibold">{order.parent_order_id}</span>의 <b>추가 제작분만</b> 포함된 주문입니다.
            아래 표기된 수량은 <b>추가 수량</b>이므로, 원주문 수량과 별개로 이만큼만 추가 제작·발주해 주세요.
          </p>
        </div>
      )}

      {/* 원주문에 연결된 차액(추가) 주문 안내 */}
      {childSurcharges.length > 0 && (
        <div className="rounded-md border border-orange-200 bg-orange-50/60 px-4 py-3">
          <p className="text-sm font-semibold text-orange-900 flex items-center gap-2">
            <Coins className="w-4 h-4" />
            이 주문에 연결된 차액(추가) 주문 {childSurcharges.length}건
          </p>
          <p className="mt-1 text-xs text-orange-800">
            수량/사양 변경으로 생긴 추가 제작분이 별도 주문으로 있습니다. 추가분은 아래 주문에서 별도로 제작·발주됩니다(이 원주문 수량은 변동 없음).
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {childSurcharges.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded bg-white border border-orange-200 px-2 py-1 text-xs text-orange-900">
                <span className="font-mono">{c.id}</span>
                <span className="text-orange-400">·</span>
                <span>{Number(c.total_amount).toLocaleString()}원</span>
                <span className="text-orange-400">·</span>
                <span>{c.payment_status === 'completed' ? '결제완료' : '결제대기'}</span>
              </span>
            ))}
          </div>
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">경로</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${orderSourceInfo.className}`}>
              {orderSourceInfo.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">영업담당자</span>
            <AssigneePicker
              value={order.attributed_salesman ? { id: order.attributed_salesman.id, label: order.attributed_salesman.display_name || '영업사원', sub: order.attributed_salesman.salesman_code } : null}
              onChange={(next) => updateAssignee(next)}
            />
          </div>
          <div className="ml-auto text-xs text-gray-400">
            {formatKstDateLong(order.created_at)}
          </div>
        </div>
      )}

      {!isFactoryUser && order.partner_mall_id && (
        <div className="rounded-md border border-teal-200 bg-teal-50/70 px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-teal-900 flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                영업몰 고객 주문입니다
              </p>
              <p className="mt-1 text-xs text-teal-800 leading-relaxed">
                {order.partner_mall?.name || '연결된 파트너몰'}에서 고객이 직접 주문한 건입니다.
                영업담당자와 매출 귀속을 바꾸기 전에는 파트너몰과 주문 경로를 함께 확인하세요.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-teal-800">
                <span className="rounded bg-white/80 border border-teal-100 px-2 py-1">
                  파트너몰: {order.partner_mall?.name || order.partner_mall_id}
                </span>
                {order.partner_mall?.slug && (
                  <span className="rounded bg-white/80 border border-teal-100 px-2 py-1 font-mono">
                    /mall/{order.partner_mall.slug}
                  </span>
                )}
                {order.attributed_salesman && (
                  <span className="rounded bg-white/80 border border-teal-100 px-2 py-1">
                    담당: {order.attributed_salesman.display_name || order.attributed_salesman.salesman_code || '영업사원'}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/partner_malls/${order.partner_mall_id}`)}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-bold text-teal-800 border border-teal-200 hover:bg-teal-100 transition-colors"
            >
              <Link2 className="w-3.5 h-3.5" />
              파트너몰 보기
            </button>
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
              <div className="flex items-center gap-2">
              {!isFactoryUser && !loading && orderItems.length > 1 && (
                <button
                  onClick={handleSendAllDesigns}
                  disabled={sendingAllDesigns}
                  title="이 주문의 여러 상품 시안을 한 번에 고객에게 확인요청합니다."
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100 transition-colors disabled:opacity-60"
                >
                  {sendingAllDesigns ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  전체 시안 확인요청
                </button>
              )}
              {!isFactoryUser && !loading && orderItems.length > 1 && (
                <button
                  onClick={handleManualSendAllDesigns}
                  disabled={manualProofBusyId === '__all__'}
                  title="전체 시안 확인요청을 보내고, 카카오톡에 붙여넣을 문구를 띄웁니다. (알림톡 장애 시 사용)"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 transition-colors disabled:opacity-60"
                >
                  {manualProofBusyId === '__all__' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  전체 수동발송
                </button>
              )}
              {!isFactoryUser && order.order_category !== 'cobuy' && (
                order.payment_status === 'completed' ? (
                  // 결제 완료 주문은 상품 직접 추가 불가(정합성). 차액 추가청구로 유도.
                  <button
                    onClick={() => setShowSurchargeModal(true)}
                    title="결제 완료 주문은 상품을 직접 추가할 수 없습니다. 차액 추가청구로 진행하세요."
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    차액 추가청구
                  </button>
                ) : (
                  <button
                    onClick={() => setShowAddItemModal(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    상품 추가
                  </button>
                )
              )}
              </div>
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
                        {/* 디자인 이름 — 공장·관리자·고객이 모두 같이 보는 라벨. 빈 칸이면 빨강 강조. */}
                        <div className="mb-1.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            defaultValue={item.design_title || ''}
                            placeholder="디자인 이름 — 사람 이름 대신 단체·이벤트명 (예: 청담고 응원티, 회사 워크샵 단체티)"
                            maxLength={60}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={async (e) => {
                              const next = e.currentTarget.value.trim();
                              if (next === (item.design_title || '').trim()) return;
                              if (!next) {
                                e.currentTarget.value = item.design_title || '';
                                alert('디자인 이름을 입력해주세요.');
                                return;
                              }
                              try {
                                const res = await fetch('/api/admin/orders/items', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ orderItemId: item.id, updateMode: 'design_title', designTitle: next }),
                                });
                                if (!res.ok) {
                                  const payload = await res.json().catch(() => ({}));
                                  throw new Error(payload?.error || '저장에 실패했습니다.');
                                }
                                await fetchOrderItems();
                                onUpdate();
                              } catch (err) {
                                alert(err instanceof Error ? err.message : '저장에 실패했습니다.');
                                e.currentTarget.value = item.design_title || '';
                              }
                            }}
                            className={`w-full px-2 py-1 text-sm font-semibold rounded border focus:outline-none focus:ring-1 ${
                              item.design_title?.trim()
                                ? 'border-gray-200 text-gray-900 bg-white focus:border-gray-900 focus:ring-gray-900'
                                : 'border-red-300 bg-red-50 placeholder-red-400 focus:border-red-500 focus:ring-red-500'
                            }`}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-black">{item.product_title}</h4>
                          {item.retouch_requested && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-700 rounded">
                              리터치 요청
                            </span>
                          )}
                          {item.design_status && item.design_status !== 'pending' && (
                            <span className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                              item.design_status === 'confirmed' ? 'bg-green-100 text-green-700' :
                              item.design_status === 'design_shared' ? 'bg-purple-100 text-purple-700' :
                              item.design_status === 'revision_requested' ? 'bg-amber-100 text-amber-700' :
                              item.design_status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {item.design_status === 'confirmed' ? '✓ 고객 확정' :
                               item.design_status === 'design_shared' ? '고객 확인대기' :
                               item.design_status === 'revision_requested' ? '고객 수정요청' :
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
                                <span key={vi} title={[v.color_name, v.size_name].filter(Boolean).join(' / ') || undefined} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                                  {v.color_hex && <span title={v.color_name || undefined} className="w-2.5 h-2.5 rounded-full border border-gray-300 shrink-0" style={{ backgroundColor: v.color_hex }} />}
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
                                onClick={(e) => { e.stopPropagation(); handleSendDesign(item.id); }}
                                disabled={sendingDesignItemId === item.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                {sendingDesignItemId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                {item.design_status === 'design_shared' ? '시안 재요청'
                                  : item.design_status === 'revision_requested' ? '시안 재발송'
                                  : '시안확인요청'}
                              </button>
                            )}
                            {!isFactoryUser && item.design_status !== 'confirmed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.design_status === 'design_shared') handleCopyManualProof(item.id);
                                  else handleManualSendDesign(item.id);
                                }}
                                disabled={manualProofBusyId === item.id}
                                title="카카오톡에 그대로 붙여넣을 문구와 시안 링크를 띄웁니다. (알림톡 장애 시 사용)"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                {manualProofBusyId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                                {item.design_status === 'design_shared' ? '문구 복사' : '수동발송'}
                              </button>
                            )}
                            {!isFactoryUser && item.design_status === 'confirmed' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 whitespace-nowrap">✓ 고객 확정완료</span>
                            )}
                            {!isFactoryUser && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSyncDesignToCustomer(item.id); }}
                                disabled={syncingDesignItemId === item.id}
                                title="이 상품의 현재 디자인(확정본)을 고객의 [내 디자인]에 반영합니다. 고객이 시안확정하면 자동 반영되며, 이 버튼은 전화 확정·과거 주문 소급용입니다."
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50 whitespace-nowrap"
                              >
                                {syncingDesignItemId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                고객 디자인에 반영
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
                        {!isFactoryUser && item.design_status && item.design_status !== 'pending' && (
                          <>
                            <p className="text-[11px] text-gray-400 mt-1.5">
                              {item.design_status === 'confirmed'
                                ? `고객이 시안을 확정했습니다${item.design_confirmed_at ? ` · ${new Date(item.design_confirmed_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}`
                                : item.design_status === 'design_shared'
                                ? `고객에게 시안 발송됨 · 고객 확인 대기중${item.design_shared_at ? ` (${new Date(item.design_shared_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 발송)` : ''}`
                                : item.design_status === 'revision_requested'
                                ? `고객이 수정을 요청했습니다${item.design_revision_note ? `: ${item.design_revision_note}` : ''}`
                                : ''}
                            </p>
                            <ProofAlimtalkLogPanel orderId={order.id} itemId={item.id} />
                          </>
                        )}
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

              {/* 배경제거 시 보존된 고객 원본 이미지 (디자인 에셋에서 수집) */}
              {originalDesignImages.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    고객 원본 이미지 (배경제거 전)
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {originalDesignImages.map((img, i) => {
                      const previewable = isPreviewableImageEntry(img);
                      const extLabel = fileExtensionLabel(img);
                      return (
                        <a
                          key={`${img.url}-${i}`}
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={img.fileName || undefined}
                          className="group block border border-gray-200 rounded-md overflow-hidden bg-gray-50 hover:border-blue-300 transition-colors"
                          title={img.fileName || '원본 이미지'}
                        >
                          {previewable ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={img.url}
                              alt={img.fileName || `원본 ${i + 1}`}
                              className="w-full aspect-square object-contain bg-white"
                            />
                          ) : (
                            // .ai/.psd 등 브라우저가 못 그리는 원본 → 파일 칩(확장자 배지 + 다운로드 아이콘)
                            <div className="w-full aspect-square flex flex-col items-center justify-center bg-white gap-1">
                              <span className="text-[11px] font-bold tracking-wide text-white bg-gray-700 rounded px-1.5 py-0.5">
                                {extLabel}
                              </span>
                              <Download className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                            </div>
                          )}
                          <p className="px-1.5 py-1 text-[11px] text-gray-600 truncate group-hover:text-blue-700">
                            {img.fileName || '원본 이미지'}
                          </p>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
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
                          {item.design_title?.trim() ? (
                            <div className="text-xs font-semibold text-gray-900 truncate">{item.design_title}</div>
                          ) : (
                            <div className="text-xs font-semibold text-red-500 truncate">이름 없음</div>
                          )}
                          <div className="text-[10px] text-gray-500 truncate">{item.product_title} · x{item.quantity}</div>
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
                          {/* 작업사진 — 공장 배정된 item 에 한해 노출. */}
                          {item.assigned_manufacturer_id && (
                            <div className="pb-2 border-b border-gray-100">
                              <button
                                type="button"
                                onClick={() => setWorkPhotoModalItemId(item.id)}
                                className="inline-flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-md text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
                              >
                                📷 작업사진
                              </button>
                            </div>
                          )}
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

                          {/* 인쇄 행 인라인 — 공장 선택 직후 자연스러운 순서. 행 변경 시 자동 저장 */}
                          {!isFactoryUser && (
                            <OrderItemPrintRowsInline
                              orderItemId={item.id}
                              itemQuantity={item.quantity}
                              factoryId={alloc.factory_id || null}
                              onChanged={() => {
                                // 인쇄 합계는 트리거가 order_items.factory_amount에 sync 함.
                                // 부모 onUpdate()를 호출하지 않음 — 사용자가 입력 중인 input의 focus와
                                // state가 휘청거리는 (탭 새로고침 같은) 현상 방지.
                                fetchOrderItems();
                              }}
                            />
                          )}

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-0.5">
                                금액 <span className="text-gray-400">(인쇄 합계 자동)</span>
                              </label>
                              <input
                                type="number"
                                value={alloc.amount}
                                onChange={(e) => updateItemAllocField(item.id, 'amount', e.target.value)}
                                placeholder="0"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 bg-gray-50"
                                title="인쇄 행이 있으면 합계로 자동 갱신됩니다. 수기 수정도 가능하지만 인쇄 행 변경 시 다시 덮어쓰일 수 있습니다."
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
                              {savingItemAlloc === item.id ? '저장 중...' : '마감일·결제정보 저장'}
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

                    {order.logen_registered_at && (
                      <p className="text-[11px] text-gray-500">
                        접수 박스 수 <span className="font-medium text-gray-700">{order.shipping_box_qty || 1}박스</span>
                        <span className="text-gray-400"> · 상품 수량과 별개</span>
                      </p>
                    )}

                    {/* Action Buttons */}
                    {!order.logen_registered_at && (
                      <>
                        <button
                          onClick={() => { setLogenError(null); setShowLogenModal(true); }}
                          className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
                        >
                          택배 접수
                        </button>
                        {/* SmartLogen 등 다른 경로로 이미 접수한 경우 — 송장번호 수동 입력 */}
                        {!order.tracking_number && (
                          <button
                            onClick={() => { setManualTrackingError(null); setManualTrackingNo(''); setManualCarrier(order.tracking_carrier || 'logen'); setShowManualTracking((v) => !v); }}
                            className="w-full mt-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 rounded transition-colors"
                          >
                            {showManualTracking ? '취소' : '이미 다른 경로(SmartLogen 등)로 접수한 경우 — 송장번호 수동 입력'}
                          </button>
                        )}
                        {showManualTracking && !order.tracking_number && (
                          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded space-y-2">
                            <p className="text-xs text-amber-800">
                              API 접수가 아닌 다른 경로(SmartLogen 웹 등)로 이미 송장이 발급된 경우 사용하세요.
                              저장하면 주문이 <span className="font-medium">배송중</span> 상태로 전환되고, 배송 추적 자동화가 작동합니다.
                            </p>
                            <div className="flex gap-2">
                              <select
                                value={manualCarrier}
                                onChange={(e) => setManualCarrier(e.target.value)}
                                className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white"
                              >
                                <option value="logen">로젠택배</option>
                                <option value="cj">CJ대한통운</option>
                                <option value="hanjin">한진택배</option>
                                <option value="lotte">롯데택배</option>
                                <option value="post">우체국</option>
                                <option value="other">기타</option>
                              </select>
                              <input
                                type="text"
                                value={manualTrackingNo}
                                onChange={(e) => setManualTrackingNo(e.target.value)}
                                placeholder="송장번호 입력"
                                className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            {manualTrackingError && (
                              <p className="text-xs text-red-600">{manualTrackingError}</p>
                            )}
                            <button
                              onClick={async () => {
                                const val = manualTrackingNo.trim();
                                if (!val) { setManualTrackingError('송장번호를 입력해 주세요.'); return; }
                                setManualTrackingSaving(true);
                                setManualTrackingError(null);
                                try {
                                  const res = await fetch('/api/admin/orders', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      orderId: order.id,
                                      trackingNumber: val,
                                      trackingCarrier: manualCarrier,
                                      orderStatus: 'shipping',
                                    }),
                                  });
                                  const json = await res.json();
                                  if (res.ok) {
                                    onOrderUpdate({ ...order, tracking_number: val, tracking_carrier: manualCarrier, order_status: 'shipping' } as Order);
                                    setShowManualTracking(false);
                                  } else {
                                    setManualTrackingError(json.error || '저장에 실패했습니다.');
                                  }
                                } catch {
                                  setManualTrackingError('서버 연결에 실패했습니다.');
                                } finally {
                                  setManualTrackingSaving(false);
                                }
                              }}
                              disabled={manualTrackingSaving || !manualTrackingNo.trim()}
                              className="w-full px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded hover:bg-amber-700 disabled:opacity-50 transition-colors"
                            >
                              {manualTrackingSaving ? '저장 중...' : '저장 (배송중으로 전환)'}
                            </button>
                          </div>
                        )}
                      </>
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
                {!isFactoryUser && order.payment_status === 'completed' && order.order_category !== 'surcharge' && (
                  <button
                    onClick={() => setShowSurchargeModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 text-white text-sm rounded-md hover:bg-amber-700 transition-colors mt-2"
                  >
                    <Coins className="w-4 h-4" />
                    차액 추가청구
                  </button>
                )}
                {!isFactoryUser && order.payment_status === 'completed' && (
                  <OrderReceiptActions order={order} />
                )}
                {!isFactoryUser && (
                  <button
                    onClick={() => router.push(`/invoices/new?orderId=${encodeURIComponent(order.id)}`)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white text-gray-700 text-sm rounded-md border border-gray-300 hover:bg-gray-50 transition-colors mt-2"
                  >
                    <Receipt className="w-4 h-4" />
                    명세서/계산서 발행
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

                    {/* 디자인 이름 — 고객·관리자·공장 모두 동일하게 보는 라벨. 누구나 짓고 수정 가능. */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">디자인 이름</p>
                      <input
                        type="text"
                        defaultValue={item.design_title || ''}
                        placeholder="단체·이벤트명 (예: 청담고 응원티)"
                        maxLength={60}
                        onBlur={async (e) => {
                          const next = e.currentTarget.value.trim();
                          if (next === (item.design_title || '').trim()) return;
                          if (!next) {
                            e.currentTarget.value = item.design_title || '';
                            alert('디자인 이름을 입력해주세요.');
                            return;
                          }
                          try {
                            const res = await fetch('/api/admin/orders/items', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ orderItemId: item.id, updateMode: 'design_title', designTitle: next }),
                            });
                            if (!res.ok) {
                              const payload = await res.json().catch(() => ({}));
                              throw new Error(payload?.error || '저장에 실패했습니다.');
                            }
                            await fetchOrderItems();
                            onUpdate();
                          } catch (err) {
                            alert(err instanceof Error ? err.message : '저장에 실패했습니다.');
                            e.currentTarget.value = item.design_title || '';
                          }
                        }}
                        className={`w-full px-3 py-2 rounded-md text-sm border focus:outline-none focus:ring-1 ${
                          item.design_title?.trim()
                            ? 'border-gray-300 focus:border-gray-900 focus:ring-gray-900'
                            : 'border-red-300 focus:border-red-500 focus:ring-red-500 bg-red-50'
                        }`}
                      />
                    </div>

                    {/* 작업사진 — 카메라 촬영·업로드 또는 Drive 폴더 열기 (모달) */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setWorkPhotoModalItemId(item.id)}
                        className="inline-flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-md text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
                      >
                        📷 작업사진
                      </button>
                      <p className="text-[11px] text-gray-500 mt-1 text-center">
                        사진 촬영·업로드 또는 Drive 폴더 열기
                      </p>
                    </div>

                    {/* 아트워크 단가 — 관리자 전용 (공장에는 노출하지 않음: 정산 단가는 작업 시작 시 한 번에 확인) */}
                    {!isFactoryUser && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setArtworksModalItemId(item.id)}
                          className="inline-flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-md text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                        >
                          💲 아트워크 단가
                        </button>
                        <p className="text-[11px] text-gray-500 mt-1 text-center">
                          인쇄 아트워크별 단가 (자동 매칭 포함)
                        </p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs text-gray-500 mb-1">배정 상태</p>
                      <select
                        value={item.factory_status || 'assigned'}
                        onChange={async (e) => {
                          const nextStatus = e.target.value;
                          // 공장이 "작업중"으로 전환 → 정산 단가 확인 모달을 먼저 띄운다 (링크/에디터와 동일 경험)
                          if (isFactoryUser && nextStatus === 'in_progress') {
                            setPriceModalItem(item);
                            return;
                          }
                          try {
                            const response = await fetch('/api/admin/orders', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ orderId: order.id, orderItemId: item.id, factoryStatus: nextStatus }),
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
                    {/* 관리자 정산 확정(잠금) — 확정 후 공장은 단가 수정 불가 */}
                    {!isFactoryUser && (
                      <div className="flex items-center justify-between rounded-md bg-gray-50 px-2 py-1.5">
                        <span className="text-xs text-gray-600">
                          정산 단가{' '}
                          <span className="font-semibold text-gray-900">
                            {item.factory_amount ? `${item.factory_amount.toLocaleString()}원` : '미입력'}
                          </span>
                          {(item as any).factory_price_locked && (
                            <span className="ml-1 text-[10px] font-medium text-gray-800">🔒 확정</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const locked = !(item as any).factory_price_locked;
                            try {
                              const res = await fetch('/api/admin/orders', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderId: order.id, orderItemId: item.id, lockFactoryPrice: locked }),
                              });
                              if (!res.ok) {
                                const p = await res.json().catch(() => ({}));
                                throw new Error(p?.error || '처리에 실패했습니다.');
                              }
                              await fetchOrderItems();
                              onUpdate();
                            } catch (e) {
                              alert(e instanceof Error ? e.message : '처리에 실패했습니다.');
                            }
                          }}
                          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                            (item as any).factory_price_locked
                              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              : 'bg-gray-900 text-white hover:bg-black'
                          }`}
                        >
                          {(item as any).factory_price_locked ? '잠금 해제' : '정산 확정'}
                        </button>
                      </div>
                    )}
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

      {/* 차액 추가청구 모달 */}
      {showSurchargeModal && (
        <SurchargeModal
          order={order}
          orderItems={orderItems}
          onClose={() => setShowSurchargeModal(false)}
          onCreated={() => {
            onUpdate();
          }}
        />
      )}

      {/* 시안확인 수동발송 문구 — 알림톡 자동발송이 막혔을 때 카카오톡으로 그대로 복붙 */}
      {manualProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setManualProof(null)}>
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                <MessageSquare className="w-4 h-4 text-purple-600" />
                카카오톡 수동발송 문구
              </h3>
              <button onClick={() => setManualProof(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-gray-600">
                <div>고객명: <span className="font-medium text-gray-900">{manualProof.customerName}</span></div>
                <div>
                  연락처: <span className="font-medium text-gray-900">{manualProof.phone || '등록된 번호 없음'}</span>
                </div>
                <div className="sm:col-span-2">대상: <span className="font-medium text-gray-900">{manualProof.label}</span></div>
              </div>

              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="whitespace-pre-wrap break-all text-[13px] leading-relaxed text-gray-800">{manualProof.text}</p>
              </div>

              <p className="text-[11px] leading-relaxed text-gray-500">
                시안 상태는 이미 &apos;고객 확인대기&apos;로 전환됐고 안내 메일도 나갔습니다.
                <br />
                이 문구만 고객 카카오톡에 붙여넣으면 됩니다.
                <br />
                링크는 발급 시점부터 7일간 유효합니다.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                onClick={() => setManualProof(null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                닫기
              </button>
              <button
                onClick={handleCopyManualProofText}
                className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
              >
                {manualProofCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {manualProofCopied ? '복사됨' : '문구 전체 복사'}
              </button>
            </div>
          </div>
        </div>
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

      {/* 작업사진 모달 — 메인 카드/사이드 패널 어디서 트리거하든 동일 */}
      {(() => {
        const target = orderItems.find((i) => i.id === workPhotoModalItemId);
        return (
          <WorkPhotoModal
            open={!!target}
            orderItemId={target?.id ?? ''}
            designTitle={target?.design_title ?? null}
            folderUrl={target?.work_drive_folder_url ?? null}
            onClose={() => setWorkPhotoModalItemId(null)}
            onUploaded={() => {
              fetchOrderItems();
              onUpdate();
            }}
          />
        );
      })()}

      {/* 아트워크 단가 모달 — admin/factory 둘 다 호출, mode/endpoints로 분기 */}
      {artworksModalItemId && (() => {
        const target = orderItems.find((i) => i.id === artworksModalItemId);
        if (!target) return null;
        return (
          <OrderItemArtworksModal
            orderItemId={target.id}
            orderItemTitle={target.product_title}
            itemQuantity={target.quantity}
            factoryId={target.assigned_manufacturer_id || null}
            mode={isFactoryUser ? 'factory' : 'admin'}
            endpoints={
              isFactoryUser
                ? {
                    listUrl: `/api/my-factory/order-items/${target.id}/artworks`,
                    mutationUrl: `/api/my-factory/order-items/${target.id}/artworks`,
                    factoryPricingUrl: '/api/my-factory/factory-print-pricing',
                  }
                : undefined
            }
            onClose={() => setArtworksModalItemId(null)}
            onSaved={() => {
              // Trigger updated order_items.factory_amount; refresh items
              fetchOrderItems();
              onUpdate();
            }}
          />
        );
      })()}

      {/* 공장 단가 확정 모달 — "작업중" 전환 시 정산 단가 확인 (링크/에디터와 동일 컴포넌트) */}
      {priceModalItem && (
        <FactoryPriceConfirmModal
          open={true}
          itemTitle={priceModalItem.product_title}
          quantity={priceModalItem.quantity}
          initialAmount={priceModalItem.factory_amount ?? 0}
          defaultUnitPrice={
            (priceModalItem as any).factory_unit_price ??
            (priceModalItem.factory_amount && priceModalItem.quantity
              ? Math.round(Number(priceModalItem.factory_amount) / Number(priceModalItem.quantity))
              : null)
          }
          submitting={savingPriceModal}
          onConfirm={async (result) => {
            setSavingPriceModal(true);
            try {
              const response = await fetch('/api/admin/orders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId: order.id,
                  orderItemId: priceModalItem.id,
                  factoryStatus: 'in_progress',
                  factoryAmount: result.amount,
                  factoryUnitPrice: result.unitPrice,
                  factoryPriceMode: result.mode,
                  confirmFactoryPrice: true,
                }),
              });
              if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error || '상태 변경에 실패했습니다.');
              }
              setPriceModalItem(null);
              await fetchOrderItems();
              onUpdate();
            } catch (error) {
              alert(error instanceof Error ? error.message : '상태 변경에 실패했습니다.');
            } finally {
              setSavingPriceModal(false);
            }
          }}
          onClose={() => setPriceModalItem(null)}
        />
      )}
    </div>
  );
}

// --- Sub-components ---

function OrderReceiptActions({ order }: { order: Order }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'view' | 'send'>(null);

  const isToss = order.payment_method === 'toss';
  // 무통장입금·관리자 처리(계좌이체/입금확인) 건 → 자체 영수증 발행
  const isSelfReceipt = order.payment_method === 'bank_transfer' || order.payment_method === 'admin';

  const fetchTossReceiptUrl = useCallback(async (): Promise<string | null> => {
    const res = await fetch(`/api/admin/orders/toss-receipt?orderId=${encodeURIComponent(order.id)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json?.error || '토스 영수증 조회에 실패했습니다.');
      return null;
    }
    return json?.data?.receiptUrl || null;
  }, [order.id]);

  const handleViewToss = useCallback(async () => {
    setBusy('view');
    try {
      const url = await fetchTossReceiptUrl();
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(null);
    }
  }, [fetchTossReceiptUrl]);

  const handleSendToss = useCallback(async () => {
    const target = order.customer_email || order.guest_email || '';
    if (!confirm(`고객(${target || '이메일 없음'})에게 영수증 링크를 메일로 보내시겠습니까?`)) return;
    setBusy('send');
    try {
      const res = await fetch('/api/admin/orders/toss-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json?.error || '영수증 메일 발송에 실패했습니다.');
        return;
      }
      alert(`영수증 링크를 ${json?.data?.email || target}(으)로 발송했습니다.`);
    } finally {
      setBusy(null);
    }
  }, [order.id, order.customer_email, order.guest_email]);

  if (isToss) {
    return (
      <div className="space-y-2 mt-2">
        <button
          onClick={handleViewToss}
          disabled={busy !== null}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white text-gray-700 text-sm rounded-md border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {busy === 'view' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
          토스 영수증 보기
        </button>
        <button
          onClick={handleSendToss}
          disabled={busy !== null}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-60"
        >
          {busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          고객에게 영수증 전송
        </button>
      </div>
    );
  }

  if (isSelfReceipt) {
    return (
      <button
        onClick={() => router.push(`/invoices/new?orderId=${encodeURIComponent(order.id)}&docType=payment_receipt`)}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors mt-2"
      >
        <Receipt className="w-4 h-4" />
        영수증 발행/전송
      </button>
    );
  }

  return null;
}

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
