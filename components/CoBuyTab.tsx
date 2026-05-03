'use client';

import { useMemo, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { AlertCircle, Calendar, Check, ChevronLeft, ChevronRight, ClipboardList, Copy, Download, ExternalLink, MapPin, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, Truck, UserPlus } from 'lucide-react';
import { CoBuyCustomField, CoBuyParticipant, CoBuySession, CoBuyStatus } from '@/types/types';
import AdminCoBuyCreator from './cobuy/AdminCoBuyCreator';
import CoBuyParticipantModal, { ParticipantFormData } from './cobuy/CoBuyParticipantModal';
import CoBuyRefundModal from './cobuy/CoBuyRefundModal';
import { addParticipantLineItemsToSizeCounts } from '@/lib/cobuyParticipantSizes';
import { formatKstDateLong, formatKstDateShort } from '@/lib/kst';

/** 고객 앱(modoo_app) 공개 URL. 배포 도메인이 다르면 `NEXT_PUBLIC_CUSTOMER_SITE_URL` 설정 */
function getCustomerSiteOrigin(): string {
  return (process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || 'https://modoouniform.com').replace(/\/$/, '');
}

const statusLabels: Record<CoBuyStatus, string> = {
  gathering: '모집중',
  gather_complete: '모집완료',
  order_complete: '주문완료',
  manufacturing: '제작중',
  manufacture_complete: '제작완료',
  delivering: '배송중',
  delivery_complete: '배송완료',
  cancelled: '취소',
};

const statusColors: Record<CoBuyStatus, string> = {
  gathering: 'bg-green-100 text-green-800',
  gather_complete: 'bg-teal-100 text-teal-800',
  order_complete: 'bg-indigo-100 text-indigo-800',
  manufacturing: 'bg-purple-100 text-purple-800',
  manufacture_complete: 'bg-violet-100 text-violet-800',
  delivering: 'bg-orange-100 text-orange-800',
  delivery_complete: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
};

const paymentStatusLabels: Record<CoBuyParticipant['payment_status'], string> = {
  pending: '대기',
  completed: '완료',
  failed: '실패',
  refunded: '환불',
  not_required: '대표자 일괄결제',
};

const paymentStatusColors: Record<CoBuyParticipant['payment_status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
  not_required: 'bg-blue-100 text-blue-800',
};

const pickupStatusLabels: Record<string, string> = {
  pending: '미수령',
  picked_up: '수령완료',
};

const pickupStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  picked_up: 'bg-green-100 text-green-800',
};

const formatDate = (dateString?: string | null) =>
  dateString ? formatKstDateLong(dateString) : '-';

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return `${value.toLocaleString()}원`;
};

const renderFieldResponses = (
  responses?: Record<string, unknown> | null,
  customFields?: CoBuyCustomField[]
) => {
  if (!responses || Object.keys(responses).length === 0) {
    return '-';
  }

  const fieldMap = new Map(customFields?.map((f) => [f.id, f.label]) ?? []);

  return (
    <div className="text-xs text-gray-600 space-y-0.5">
      {Object.entries(responses).map(([key, value]) => (
        <div key={key}>
          <span className="text-gray-500">{fieldMap.get(key) || key}:</span>{' '}
          <span className="text-gray-700">{String(value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function CoBuyTab() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Detect return from editor: /cobuy?resumeProductId=xxx&designId=yyy
  const resumeProductId = searchParams.get('resumeProductId');
  const resumeDesignId = searchParams.get('designId');

  const [filterStatus, setFilterStatus] = useState<'all' | CoBuyStatus>('all');
  const [selectedSession, setSelectedSession] = useState<CoBuySession | null>(null);
  const [statusUpdate, setStatusUpdate] = useState<CoBuyStatus>('gathering');
  const [actionLoading, setActionLoading] = useState<'status' | 'bulk' | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(!!resumeProductId && !!resumeDesignId);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Participant management state
  const [participantSearch, setParticipantSearch] = useState('');
  const [participantPaymentFilter, setParticipantPaymentFilter] = useState<'all' | CoBuyParticipant['payment_status']>('all');
  const [participantPickupFilter, setParticipantPickupFilter] = useState<'all' | 'pending' | 'picked_up'>('all');
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<CoBuyParticipant | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundParticipant, setRefundParticipant] = useState<CoBuyParticipant | null>(null);
  const [updatingPickupStatus, setUpdatingPickupStatus] = useState<Set<string>>(new Set());
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: sessions = [], isLoading: loading, error: sessionsError, mutate: mutateSessions } = useSWR<CoBuySession[]>(
    `/api/admin/cobuy/sessions?status=${filterStatus}`
  );
  const errorMessage = sessionsError?.message || null;

  // Participants: fetch when a session is selected
  const { data: participants = [], isLoading: detailLoading, mutate: mutateParticipants } = useSWR<CoBuyParticipant[]>(
    selectedSession ? `/api/admin/cobuy/participants?sessionId=${selectedSession.id}` : null
  );

  const handleSelectSession = (session: CoBuySession) => {
    setSelectedSession(session);
    setStatusUpdate(session.status);
    setPreviewIndex(0);
    setPaymentLinkUrl(null);
    setLinkCopied(false);
  };

  const handleUpdateStatus = async () => {
    if (!selectedSession) return;

    setActionLoading('status');
    setDetailError(null);

    try {
      const response = await fetch('/api/admin/cobuy/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: selectedSession.id, status: statusUpdate }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '상태 업데이트에 실패했습니다.');
      }

      const payload = await response.json();
      const updatedSession = payload?.data as CoBuySession;

      setSelectedSession(updatedSession);
      mutateSessions(
        sessions.map((session) => (session.id === updatedSession.id ? updatedSession : session)),
        { revalidate: false }
      );
    } catch (error) {
      console.error('Error updating session status:', error);
      setDetailError(error instanceof Error ? error.message : '상태 업데이트에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateBulkOrder = async () => {
    if (!selectedSession) return;

    setActionLoading('bulk');
    setDetailError(null);

    try {
      const response = await fetch('/api/admin/cobuy/bulk-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: selectedSession.id }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '공동구매 주문 생성에 실패했습니다.');
      }

      const payload = await response.json();
      const orderId = payload?.data?.orderId as string | undefined;
      const linkUrl = payload?.data?.paymentLinkUrl as string | undefined;

      if (!orderId) {
        throw new Error('주문 ID를 확인할 수 없습니다.');
      }

      if (linkUrl) {
        setPaymentLinkUrl(linkUrl);
      }

      const updatedSession = {
        ...selectedSession,
        bulk_order_id: orderId,
      };

      setSelectedSession(updatedSession);
      mutateSessions(
        sessions.map((session) => (session.id === updatedSession.id ? updatedSession : session)),
        { revalidate: false }
      );
    } catch (error) {
      console.error('Error creating bulk order:', error);
      setDetailError(error instanceof Error ? error.message : '공동구매 주문 생성에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const paymentStats = useMemo(() => {
    const total = participants.length;
    const completed = participants.filter((participant) => participant.payment_status === 'completed');
    const failed = participants.filter((participant) => participant.payment_status === 'failed');
    const refunded = participants.filter((participant) => participant.payment_status === 'refunded');
    const pendingCount = total - completed.length - failed.length - refunded.length;
    const totalPaid = completed.reduce((sum, participant) => {
      const amount = typeof participant.payment_amount === 'number' ? participant.payment_amount : 0;
      return sum + amount;
    }, 0);

    return {
      total,
      completed: completed.length,
      failed: failed.length,
      refunded: refunded.length,
      pending: pendingCount,
      totalPaid,
    };
  }, [participants]);

  const sizeStats = useMemo(() => {
    // Get all defined size labels from the session's custom fields
    const sizeField = selectedSession?.custom_fields?.find((f) => f.id === 'size' && f.type === 'dropdown');
    const allSizes = sizeField?.options ?? [];

    const counts = new Map<string, number>();
    for (const s of allSizes) counts.set(s, 0);
    for (const p of participants) {
      addParticipantLineItemsToSizeCounts(counts, p);
    }

    // Use defined order from options, then append any extra sizes from participants
    const ordered = allSizes.map((size) => ({ size, count: counts.get(size) || 0 }));
    for (const [size, count] of counts) {
      if (!allSizes.includes(size)) ordered.push({ size, count });
    }
    return ordered;
  }, [participants, selectedSession?.custom_fields]);

  const filteredParticipants = useMemo(() => {
    let filtered = participants;
    if (participantSearch.trim()) {
      const q = participantSearch.trim().toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q))
      );
    }
    if (participantPaymentFilter !== 'all') {
      filtered = filtered.filter(p => p.payment_status === participantPaymentFilter);
    }
    if (participantPickupFilter !== 'all') {
      filtered = filtered.filter(p => (p.pickup_status || 'pending') === participantPickupFilter);
    }
    return filtered;
  }, [participants, participantSearch, participantPaymentFilter, participantPickupFilter]);

  const handleTogglePickupStatus = useCallback(async (participant: CoBuyParticipant) => {
    if (updatingPickupStatus.has(participant.id)) return;
    const newStatus = (participant.pickup_status || 'pending') === 'picked_up' ? 'pending' : 'picked_up';

    setUpdatingPickupStatus(prev => new Set(prev).add(participant.id));

    try {
      const response = await fetch('/api/admin/cobuy/participants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: participant.id, pickupStatus: newStatus }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '수령 상태 변경에 실패했습니다.');
      }
      mutateParticipants();
    } catch (error) {
      console.error('Error toggling pickup status:', error);
      setDetailError(error instanceof Error ? error.message : '수령 상태 변경에 실패했습니다.');
    } finally {
      setUpdatingPickupStatus(prev => {
        const next = new Set(prev);
        next.delete(participant.id);
        return next;
      });
    }
  }, [updatingPickupStatus, mutateParticipants]);

  const handleAddParticipant = useCallback(async (data: ParticipantFormData) => {
    if (!selectedSession) return;
    const response = await fetch('/api/admin/cobuy/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: selectedSession.id,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        selectedItems: data.selectedItems,
        fieldResponses: data.fieldResponses,
        deliveryMethod: data.deliveryMethod,
        paymentAmount: data.paymentAmount,
        paymentStatus: data.paymentStatus,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || '참여자 추가에 실패했습니다.');
    }
    mutateParticipants();
    mutateSessions();
  }, [selectedSession, mutateParticipants, mutateSessions]);

  const handleEditParticipant = useCallback(async (data: ParticipantFormData) => {
    if (!editingParticipant) return;
    const totalQuantity = data.selectedItems.reduce((sum, item) => sum + item.quantity, 0);
    const selectedSize = data.selectedItems.map(i => `${i.size}(${i.quantity})`).join(', ');

    const response = await fetch('/api/admin/cobuy/participants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId: editingParticipant.id,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        selectedItems: data.selectedItems,
        totalQuantity,
        selectedSize,
        fieldResponses: data.fieldResponses,
        deliveryMethod: data.deliveryMethod,
        paymentAmount: data.paymentAmount,
        paymentStatus: data.paymentStatus,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || '참여자 수정에 실패했습니다.');
    }
    mutateParticipants();
  }, [editingParticipant, mutateParticipants]);

  const handleDeleteParticipant = useCallback(async (participant: CoBuyParticipant) => {
    const confirmed = window.confirm(`${participant.name}님을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/cobuy/participants?participantId=${participant.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '참여자 삭제에 실패했습니다.');
      }
      mutateParticipants();
      mutateSessions();
    } catch (error) {
      console.error('Error deleting participant:', error);
      setDetailError(error instanceof Error ? error.message : '참여자 삭제에 실패했습니다.');
    }
  }, [mutateParticipants, mutateSessions]);

  const sizeOptionsFromSession = useMemo(() => {
    const sizeField = selectedSession?.custom_fields?.find(f => f.id === 'size' && f.type === 'dropdown');
    return sizeField?.options ?? [];
  }, [selectedSession?.custom_fields]);

  const getItemUnitPrice = useCallback((size: string): number | null => {
    if (selectedSession?.size_prices && size && selectedSession.size_prices[size] != null) return selectedSession.size_prices[size];
    const bp = selectedSession?.saved_design_screenshots?.price_per_item;
    return typeof bp === 'number' ? bp : null;
  }, [selectedSession?.size_prices, selectedSession?.saved_design_screenshots?.price_per_item]);

  const handleDownloadExcel = async () => {
    if (participants.length === 0 || !selectedSession) return;

    try {
      const res = await fetch(`/api/admin/cobuy/participants-excel?sessionId=${selectedSession.id}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || '엑셀 다운로드에 실패했습니다.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedSession.title}_참여자목록.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Excel download error:', error);
      setDetailError(error instanceof Error ? error.message : '엑셀 다운로드에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (selectedSession) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => setSelectedSession(null)}
            className="p-1.5 sm:p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <div>
            <h2 className="text-base sm:text-xl font-semibold text-gray-900">공동구매 상세</h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">세션 ID: {selectedSession.id}</p>
          </div>
        </div>

        {detailError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-red-800">{detailError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-gray-200/60 rounded-md p-3 sm:p-4 shadow-sm space-y-3 sm:space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900">{selectedSession.title}</h3>
                  {selectedSession.description && (
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">{selectedSession.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    {selectedSession.profiles?.email || 'creator@unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    selectedSession.payment_mode === 'survey' ? 'bg-purple-100 text-purple-800' : 'bg-teal-100 text-teal-800'
                  }`}>
                    {selectedSession.payment_mode === 'survey' ? '대표자 일괄결제' : '개별결제'}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[selectedSession.status]}`}
                  >
                    {statusLabels[selectedSession.status]}
                  </span>
                </div>
              </div>

              {selectedSession.status === 'cancelled' && (
                <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs sm:text-sm text-red-700">
                  취소 요청 또는 취소 처리된 세션입니다. 필요 시 상태를 조정하세요.
                </div>
              )}
              {selectedSession.cancellation_requested_at && (
                <div className="rounded-md border border-yellow-100 bg-yellow-50 px-3 py-2 text-xs sm:text-sm text-yellow-800">
                  취소 요청 접수: {formatDate(selectedSession.cancellation_requested_at)}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {formatDate(selectedSession.start_date)} - {formatDate(selectedSession.end_date)}
                </div>
                <div className="text-gray-700">
                  참여자: {selectedSession.current_participant_count || 0}
                  {selectedSession.max_participants !== null
                    ? ` / ${selectedSession.max_participants}`
                    : ' / 무제한'}
                </div>
                <div className="md:col-span-2 rounded-md border border-gray-200 bg-gray-50/80 p-3 space-y-3">
                  <p className="text-xs font-semibold text-gray-800">링크 공유</p>

                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-gray-600">참여자용 (공개 · 결제·참여)</p>
                    <div className="flex items-center gap-2 text-gray-800">
                      <code className="flex-1 min-w-0 truncate text-[11px] sm:text-xs bg-white border border-gray-200 rounded px-2 py-1.5">
                        {`${getCustomerSiteOrigin()}/cobuy/${selectedSession.share_token}`}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${getCustomerSiteOrigin()}/cobuy/${selectedSession.share_token}`;
                          navigator.clipboard.writeText(url).then(() => alert('참여 링크가 복사되었습니다.'));
                        }}
                        className="shrink-0 p-1.5 text-gray-500 hover:text-blue-600 hover:bg-white rounded transition-colors"
                        title="복사"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={`${getCustomerSiteOrigin()}/cobuy/${selectedSession.share_token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-1.5 text-gray-500 hover:text-blue-600 hover:bg-white rounded transition-colors"
                        title="새 탭"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      경로: <span className="font-mono">/cobuy/[share_token]</span> — share_token은 세션마다 고유합니다.
                    </p>
                  </div>

                  <div className="border-t border-gray-200 pt-3 space-y-1">
                    <p className="text-[11px] font-medium text-gray-600">주최자용 (로그인 없이 누구나 접근 가능)</p>
                    <div className="flex items-center gap-2 text-gray-800">
                      <code className="flex-1 min-w-0 truncate text-[11px] sm:text-xs bg-white border border-gray-200 rounded px-2 py-1.5">
                        {`${getCustomerSiteOrigin()}/cobuy/host/${selectedSession.share_token}`}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${getCustomerSiteOrigin()}/cobuy/host/${selectedSession.share_token}`;
                          navigator.clipboard.writeText(url).then(() =>
                            alert('주최자 관리 링크가 복사되었습니다. 링크만 있으면 누구나 열 수 있으므로 공유 시 주의하세요.')
                          );
                        }}
                        className="shrink-0 p-1.5 text-gray-500 hover:text-blue-600 hover:bg-white rounded transition-colors"
                        title="주최자 링크 복사"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={`${getCustomerSiteOrigin()}/cobuy/host/${selectedSession.share_token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-1.5 text-gray-500 hover:text-blue-600 hover:bg-white rounded transition-colors"
                        title="새 탭"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      경로: <span className="font-mono">/cobuy/host/[share_token]</span> — 로그인 없이 누구나 접근 가능합니다.{' '}
                      <span className="font-mono">/cobuy/[share_token]</span>은 참여자용, <span className="font-mono">/cobuy/host/…</span>
                      은 주최자 관리용입니다. 검색엔진에 노출되지 않으나, 링크를 아는 사람은 모두 이용할 수 있으므로 주의하세요.
                    </p>
                  </div>
                </div>
                <div className="text-gray-700">
                  주문 ID: {selectedSession.bulk_order_id || '-'}
                </div>
              </div>
            </div>

            {/* Image / Design Preview + Size Stats */}
            {((selectedSession.cobuy_image_urls?.length || selectedSession.saved_design_screenshots?.preview_url) || sizeStats.length > 0) && (
              <div className="bg-white border border-gray-200/60 rounded-md p-3 sm:p-4 shadow-sm">
                <div className="space-y-4">
                  {/* Preview */}
                  {(selectedSession.cobuy_image_urls?.length || selectedSession.saved_design_screenshots?.preview_url) && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-900 mb-2">
                        {selectedSession.cobuy_image_urls?.length ? '이미지' : '디자인'}
                      </h3>
                      {selectedSession.cobuy_image_urls?.length ? (
                        <div className="relative w-48">
                          <img
                            src={selectedSession.cobuy_image_urls[previewIndex]}
                            alt={`이미지 ${previewIndex + 1}`}
                            className="w-full rounded-md object-contain max-h-48 bg-gray-50"
                          />
                          {selectedSession.cobuy_image_urls.length > 1 && (
                            <>
                              <button
                                onClick={() => setPreviewIndex((i) => (i - 1 + selectedSession.cobuy_image_urls!.length) % selectedSession.cobuy_image_urls!.length)}
                                className="absolute left-1 top-1/2 -translate-y-1/2 p-1 bg-black/40 text-white rounded-full hover:bg-black/60"
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setPreviewIndex((i) => (i + 1) % selectedSession.cobuy_image_urls!.length)}
                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-black/40 text-white rounded-full hover:bg-black/60"
                              >
                                <ChevronRight className="w-3 h-3" />
                              </button>
                              <div className="text-center text-[11px] text-gray-500 mt-1">
                                {previewIndex + 1} / {selectedSession.cobuy_image_urls.length}
                              </div>
                            </>
                          )}
                        </div>
                      ) : selectedSession.saved_design_screenshots?.preview_url ? (
                        <img
                          src={selectedSession.saved_design_screenshots.preview_url}
                          alt="디자인 미리보기"
                          className="w-48 rounded-md object-contain max-h-48 bg-gray-50"
                        />
                      ) : null}
                    </div>
                  )}

                  {/* Size Stats */}
                  {sizeStats.length > 0 && (
                    <div className="overflow-x-auto">
                      <h3 className="text-xs font-semibold text-gray-900 mb-2">사이즈별 수량</h3>
                      <table className="w-full text-xs border border-gray-300">
                        <thead>
                          <tr>
                            {sizeStats.map(({ size }) => (
                              <th key={size} className="px-3 py-1.5 border border-gray-300 bg-gray-100 text-center font-medium text-gray-700 whitespace-nowrap">
                                {size}
                              </th>
                            ))}
                            <th className="px-3 py-1.5 border border-gray-300 bg-blue-50 text-center font-semibold text-blue-700 whitespace-nowrap">
                              총 합계
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {sizeStats.map(({ size, count }) => (
                              <td key={size} className="px-3 py-1.5 border border-gray-300 text-center font-medium text-gray-900">
                                {count}
                              </td>
                            ))}
                            <td className="px-3 py-1.5 border border-gray-300 bg-blue-50 text-center font-bold text-blue-700">
                              {sizeStats.reduce((sum, s) => sum + s.count, 0)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200/60 rounded-md p-3 sm:p-4 shadow-sm">
              {/* Header with actions */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                  참여자 목록
                  <span className="text-xs font-normal text-gray-500 ml-1">
                    ({filteredParticipants.length}{filteredParticipants.length !== participants.length ? ` / ${participants.length}` : ''})
                  </span>
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingParticipant(null); setShowParticipantModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">수기 추가</span>
                  </button>
                  <button
                    onClick={handleDownloadExcel}
                    disabled={participants.length === 0}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">엑셀</span>
                  </button>
                  <button
                    onClick={() => mutateParticipants()}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                    disabled={detailLoading}
                  >
                    <RefreshCw className={`w-4 h-4 ${detailLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">새로고침</span>
                  </button>
                </div>
              </div>

              {/* Search & Filters */}
              <div className="flex flex-wrap gap-2 mb-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="이름, 이메일, 전화번호 검색..."
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <select
                  value={participantPaymentFilter}
                  onChange={(e) => setParticipantPaymentFilter(e.target.value as typeof participantPaymentFilter)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-xs"
                >
                  <option value="all">결제: 전체</option>
                  <option value="pending">결제: 대기</option>
                  <option value="completed">결제: 완료</option>
                  <option value="failed">결제: 실패</option>
                  <option value="refunded">결제: 환불</option>
                </select>
                <select
                  value={participantPickupFilter}
                  onChange={(e) => setParticipantPickupFilter(e.target.value as typeof participantPickupFilter)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-xs"
                >
                  <option value="all">수령: 전체</option>
                  <option value="pending">수령: 미수령</option>
                  <option value="picked_up">수령: 완료</option>
                </select>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="overflow-x-auto hidden md:block">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">참여자</th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">주문 내역</th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">수령 방법</th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">결제</th>
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">수령 상태</th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">참여일</th>
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">액션</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredParticipants.map((participant) => {
                          const pickupStatus = participant.pickup_status || 'pending';
                          const isPickedUp = pickupStatus === 'picked_up';
                          const isUpdatingPickup = updatingPickupStatus.has(participant.id);
                          return (
                            <tr key={participant.id} className="hover:bg-gray-50 transition-colors align-top">
                              <td className="px-3 py-3">
                                <div className="text-sm font-medium text-gray-900">{participant.name}</div>
                                <div className="text-xs text-gray-500">{participant.email}</div>
                                {participant.phone && <div className="text-xs text-gray-400">{participant.phone}</div>}
                              </td>
                              <td className="px-3 py-3">
                                {participant.selected_items?.length ? (
                                  <div className="space-y-0.5">
                                    {participant.selected_items.map((item, idx) => {
                                      const unitPrice = getItemUnitPrice(item.size);
                                      return (
                                        <div key={idx} className="flex items-center gap-1.5 text-xs flex-wrap">
                                          <span className="bg-gray-100 px-1.5 py-0.5 rounded font-medium">{item.size}</span>
                                          <span className="text-gray-400">x</span>
                                          <span className="font-medium">{item.quantity}</span>
                                          {unitPrice != null && (
                                            <span className="text-[11px] text-gray-400">(₩{(unitPrice * item.quantity).toLocaleString()})</span>
                                          )}
                                        </div>
                                      );
                                    })}
                                    <div className="text-[11px] text-gray-500 pt-0.5 border-t border-gray-100 mt-1 flex justify-between">
                                      <span>총 {participant.total_quantity || participant.selected_items.reduce((s, i) => s + i.quantity, 0)}벌</span>
                                      {participant.payment_amount != null && participant.payment_amount > 0 && (
                                        <span className="font-medium text-gray-700">₩{participant.payment_amount.toLocaleString()}</span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-700">{participant.selected_size || '-'}</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {participant.delivery_method ? (
                                  <div className="flex items-center gap-1 text-xs">
                                    {participant.delivery_method === 'delivery' ? (
                                      <><Truck className="w-3.5 h-3.5 text-blue-600" /><span>배송</span></>
                                    ) : (
                                      <><MapPin className="w-3.5 h-3.5 text-green-600" /><span>직접 수령</span></>
                                    )}
                                    {participant.delivery_fee > 0 && (
                                      <span className="text-gray-400 text-[11px]">(+{participant.delivery_fee.toLocaleString()})</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${paymentStatusColors[participant.payment_status]}`}>
                                  {paymentStatusLabels[participant.payment_status]}
                                </span>
                                <div className="text-xs text-gray-600 mt-0.5">
                                  {formatCurrency(participant.payment_amount ?? undefined)}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <button
                                  onClick={() => handleTogglePickupStatus(participant)}
                                  disabled={isUpdatingPickup}
                                  title={isPickedUp ? '수령 완료 → 미수령' : '미수령 → 수령 완료'}
                                  className={`w-7 h-7 rounded-full inline-flex items-center justify-center transition-colors ${
                                    isPickedUp
                                      ? 'bg-green-500 text-white hover:bg-green-600'
                                      : 'bg-gray-200 text-gray-400 hover:bg-gray-300'
                                  } ${isUpdatingPickup ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  {isUpdatingPickup ? (
                                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                  )}
                                </button>
                                <div className={`text-[10px] mt-0.5 font-medium ${pickupStatusColors[pickupStatus]?.replace('bg-', 'text-').replace('100', '700') || 'text-gray-500'}`}>
                                  {pickupStatusLabels[pickupStatus] || pickupStatus}
                                </div>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                                {formatKstDateShort(participant.joined_at)}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => { setEditingParticipant(participant); setShowParticipantModal(true); }}
                                    title="수정"
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  {participant.payment_status === 'completed' && (
                                    <button
                                      onClick={() => { setRefundParticipant(participant); setShowRefundModal(true); }}
                                      title="환불"
                                      className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteParticipant(participant)}
                                    title="삭제"
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-gray-200">
                    {filteredParticipants.map((participant) => {
                      const pickupStatus = participant.pickup_status || 'pending';
                      const isPickedUp = pickupStatus === 'picked_up';
                      const isUpdatingPickup = updatingPickupStatus.has(participant.id);
                      return (
                        <div key={participant.id} className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-gray-900">{participant.name}</div>
                              <div className="text-[11px] text-gray-500">{participant.email}</div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${paymentStatusColors[participant.payment_status]}`}>
                                {paymentStatusLabels[participant.payment_status]}
                              </span>
                              <button
                                onClick={() => handleTogglePickupStatus(participant)}
                                disabled={isUpdatingPickup}
                                className={`w-6 h-6 rounded-full inline-flex items-center justify-center ${
                                  isPickedUp ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                                } ${isUpdatingPickup ? 'opacity-50' : ''}`}
                              >
                                <Check className="w-3 h-3" strokeWidth={3} />
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                            {participant.selected_items?.length ? (
                              participant.selected_items.map((item, idx) => {
                                const unitPrice = getItemUnitPrice(item.size);
                                return (
                                  <span key={idx}>
                                    {item.size} x{item.quantity}
                                    {unitPrice != null && <span className="text-gray-400"> (₩{(unitPrice * item.quantity).toLocaleString()})</span>}
                                  </span>
                                );
                              })
                            ) : (
                              <span>{participant.selected_size}</span>
                            )}
                            <span className="font-medium text-gray-700">{formatCurrency(participant.payment_amount ?? undefined)}</span>
                            {participant.delivery_method && (
                              <span>{participant.delivery_method === 'delivery' ? '배송' : '직접 수령'}</span>
                            )}
                            <span className={`font-medium ${isPickedUp ? 'text-green-600' : 'text-yellow-600'}`}>
                              {pickupStatusLabels[pickupStatus]}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-gray-400">
                              {formatKstDateShort(participant.joined_at)}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setEditingParticipant(participant); setShowParticipantModal(true); }}
                                className="p-1 text-gray-400 hover:text-blue-600"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {participant.payment_status === 'completed' && (
                                <button
                                  onClick={() => { setRefundParticipant(participant); setShowRefundModal(true); }}
                                  className="p-1 text-gray-400 hover:text-orange-600"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteParticipant(participant)}
                                className="p-1 text-gray-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {!detailLoading && filteredParticipants.length === 0 && (
                <div className="text-center py-10">
                  <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {participants.length === 0 ? '참여자가 없습니다.' : '검색 결과가 없습니다.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-gray-200/60 rounded-md p-3 sm:p-4 shadow-sm">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">결제 현황</h3>
              <div className="space-y-3 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">총 참여</span>
                  <span className="font-medium text-gray-900">{paymentStats.total}명</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">결제 완료</span>
                  <span className="font-medium text-gray-900">{paymentStats.completed}명</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">대기</span>
                  <span className="font-medium text-gray-900">{paymentStats.pending}명</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">실패</span>
                  <span className="font-medium text-gray-900">{paymentStats.failed}명</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">환불</span>
                  <span className="font-medium text-gray-900">{paymentStats.refunded}명</span>
                </div>
                <div className="border-t pt-3 flex justify-between">
                  <span className="text-gray-700 font-semibold">총 결제 금액</span>
                  <span className="text-blue-600 font-bold">
                    {formatCurrency(paymentStats.totalPaid)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200/60 rounded-md p-3 sm:p-4 shadow-sm space-y-4">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900">관리 액션</h3>

              <div className="space-y-2">
                <label className="text-xs sm:text-sm text-gray-600">세션 상태 변경</label>
                <div className="flex gap-2">
                  <select
                    value={statusUpdate}
                    onChange={(event) => setStatusUpdate(event.target.value as CoBuyStatus)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
                  >
                    {Object.keys(statusLabels).map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status as CoBuyStatus]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleUpdateStatus}
                    disabled={actionLoading === 'status'}
                    className="px-3 py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-60"
                  >
                    {actionLoading === 'status' ? '처리중...' : '업데이트'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs sm:text-sm text-gray-600">일괄 주문 생성</label>
                <button
                  onClick={handleCreateBulkOrder}
                  disabled={actionLoading === 'bulk' || !!selectedSession.bulk_order_id || selectedSession.status !== 'gather_complete'}
                  className="w-full px-3 py-2 bg-gray-900 text-white text-xs sm:text-sm rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedSession.bulk_order_id
                    ? '주문 생성 완료'
                    : actionLoading === 'bulk'
                    ? '주문 생성중...'
                    : '주문 생성하기'}
                </button>
                <p className="text-xs text-gray-500">
                  모집완료 상태의 세션에서만 주문을 생성할 수 있습니다.
                </p>
                {paymentLinkUrl && selectedSession.payment_mode === 'survey' && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md space-y-2">
                    <p className="text-xs font-medium text-blue-800">결제 링크가 생성되었습니다</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={paymentLinkUrl}
                        className="flex-1 px-2 py-1 text-xs bg-white border border-blue-200 rounded text-blue-700 truncate"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(paymentLinkUrl);
                          setLinkCopied(true);
                          setTimeout(() => setLinkCopied(false), 2000);
                        }}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                      >
                        {linkCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {linkCopied ? '복사됨' : '복사'}
                      </button>
                    </div>
                    <p className="text-xs text-blue-600">이 링크를 대표자에게 전달하세요. 카드 결제 또는 계좌이체가 가능합니다.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Participant Add/Edit Modal */}
        <CoBuyParticipantModal
          isOpen={showParticipantModal}
          onClose={() => { setShowParticipantModal(false); setEditingParticipant(null); }}
          onSave={editingParticipant ? handleEditParticipant : handleAddParticipant}
          participant={editingParticipant}
          customFields={selectedSession.custom_fields}
          sizeOptions={sizeOptionsFromSession}
          sizePrices={selectedSession.size_prices}
          basePrice={selectedSession.saved_design_screenshots?.price_per_item ?? null}
        />

        {/* Refund Modal */}
        <CoBuyRefundModal
          isOpen={showRefundModal}
          onClose={() => { setShowRefundModal(false); setRefundParticipant(null); }}
          participant={refundParticipant}
          onRefunded={() => { mutateParticipants(); mutateSessions(); }}
        />
      </div>
    );
  }

  const handleCoBuyCreated = (session: CoBuySession) => {
    mutateSessions([session, ...sessions], { revalidate: false });
  };

  const handleCloseCreator = () => {
    setShowCreator(false);
    // Clear resume params from URL if present
    if (resumeProductId || resumeDesignId) {
      router.replace('/cobuy');
    }
  };

  // Show the creator modal
  if (showCreator) {
    return (
      <AdminCoBuyCreator
        onClose={handleCloseCreator}
        onSuccess={(session) => {
          handleCoBuyCreated(session);
          handleCloseCreator();
        }}
        initialProductId={resumeProductId ?? undefined}
        initialDesignId={resumeDesignId ?? undefined}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-xl font-semibold text-gray-900">공동구매 관리</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">총 {sessions.length}개의 세션</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreator(true)}
            className="flex items-center gap-2 px-3 py-2 text-[11px] sm:text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">공동구매 생성하기</span>
            <span className="sm:hidden">생성</span>
          </button>
          <button
            onClick={() => mutateSessions()}
            className="flex items-center gap-2 px-3 py-2 text-[11px] sm:text-xs text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800">{errorMessage}</p>
        </div>
      )}

      <div className="bg-white border border-gray-200/60 rounded-md p-2 sm:p-3 shadow-sm">
        <div className="flex gap-2 flex-wrap">
          {[
            { value: 'all', label: '전체' },
            { value: 'gathering', label: '모집중' },
            { value: 'gather_complete', label: '모집완료' },
            { value: 'order_complete', label: '주문완료' },
            { value: 'manufacturing', label: '제작중' },
            { value: 'delivering', label: '배송중' },
            { value: 'cancelled', label: '취소' },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setFilterStatus(filter.value as 'all' | CoBuyStatus)}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors ${
                filterStatus === filter.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  세션
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  결제방식
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  참여자
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  기간
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  주문 ID
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  onClick={() => handleSelectSession(session)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{session.title}</div>
                    <div className="text-xs text-gray-500">
                      {session.profiles?.email || 'creator@unknown'}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[session.status]}`}
                    >
                      {statusLabels[session.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      session.payment_mode === 'survey'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-teal-100 text-teal-800'
                    }`}>
                      {session.payment_mode === 'survey' ? '대표자 일괄결제' : '개별결제'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                    {session.current_participant_count || 0}
                    {session.max_participants !== null ? ` / ${session.max_participants}` : ' / 무제한'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                    {formatDate(session.start_date)} - {formatDate(session.end_date)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {session.bulk_order_id || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-gray-200">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => handleSelectSession(session)}
              className="p-3 space-y-1.5 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-medium text-gray-900 truncate">{session.title}</div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${statusColors[session.status]}`}>
                  {statusLabels[session.status]}
                </span>
              </div>
              <div className="text-[11px] text-gray-500">{session.profiles?.email || 'creator@unknown'}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  session.payment_mode === 'survey' ? 'bg-purple-100 text-purple-800' : 'bg-teal-100 text-teal-800'
                }`}>
                  {session.payment_mode === 'survey' ? '대표자 일괄결제' : '개별결제'}
                </span>
                <span>참여: {session.current_participant_count || 0}{session.max_participants !== null ? ` / ${session.max_participants}` : ' / 무제한'}</span>
                <span>{session.bulk_order_id ? `주문: ${session.bulk_order_id.slice(0,8)}...` : ''}</span>
              </div>
              <div className="text-[11px] text-gray-400">
                {formatDate(session.start_date)} - {formatDate(session.end_date)}
              </div>
            </div>
          ))}
        </div>

        {sessions.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <ClipboardList className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2">세션이 없습니다</h3>
            <p className="text-xs sm:text-sm text-gray-500">등록된 공동구매 세션이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
