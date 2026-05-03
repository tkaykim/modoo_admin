'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Mail, Check } from 'lucide-react';
import { CoBuyRequest, CoBuyRequestStatus, CoBuyRequestAdminStatus } from '@/types/types';
import { formatKstDateTimeMedium, formatKstMonthDay } from '@/lib/kst';

const statusLabels: Record<CoBuyRequestStatus, string> = {
  draft: '작성중',
  pending: '대기중',
  in_progress: '작업중',
  design_shared: '디자인 공유됨',
  feedback: '피드백 대기',
  confirmed: '확정',
  session_created: '세션 생성됨',
  rejected: '거절',
};

const statusColors: Record<CoBuyRequestStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  design_shared: 'bg-purple-100 text-purple-800',
  feedback: 'bg-orange-100 text-orange-800',
  confirmed: 'bg-green-100 text-green-800',
  session_created: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

const adminStatusLabels: Record<CoBuyRequestAdminStatus, string> = {
  not_reviewed: '미확인',
  reviewing: '확인중',
  quote_sent: '견적발송',
  contract_done: '계약완료',
  on_hold: '보류',
  cancelled: '취소',
};

const adminStatusColors: Record<CoBuyRequestAdminStatus, string> = {
  not_reviewed: 'bg-gray-100 text-gray-500',
  reviewing: 'bg-blue-100 text-blue-700',
  quote_sent: 'bg-amber-100 text-amber-700',
  contract_done: 'bg-green-100 text-green-700',
  on_hold: 'bg-red-100 text-red-600',
  cancelled: 'bg-red-50 text-red-500',
};

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
});

const formatDate = (dateString?: string | null) =>
  dateString ? formatKstDateTimeMedium(dateString) : '-';

const formatDateShort = (dateString?: string | null) =>
  dateString ? formatKstMonthDay(dateString) : '-';

export default function CoBuyRequestsTab() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sendingPricing, setSendingPricing] = useState<string | null>(null);
  const [sentPricing, setSentPricing] = useState<Set<string>>(new Set());
  const [updatingAdminStatus, setUpdatingAdminStatus] = useState<string | null>(null);
  const [memoPopoverId, setMemoPopoverId] = useState<string | null>(null);
  const [memoDrafts, setMemoDrafts] = useState<Record<string, string>>({});
  const [savingMemoId, setSavingMemoId] = useState<string | null>(null);

  const { data: requests, error, mutate } = useSWR<CoBuyRequest[]>(
    `/api/admin/cobuy/requests?status=${statusFilter}`,
    fetcher
  );

  const isLoading = !requests && !error;

  useEffect(() => {
    if (!requests) return;
    setMemoDrafts(prev => {
      const drafts: Record<string, string> = { ...prev };
      requests.forEach(req => {
        if (!(req.id in drafts)) {
          drafts[req.id] = req.admin_notes || '';
        }
      });
      return drafts;
    });
  }, [requests]);

  const handleSendPricing = async (e: React.MouseEvent, requestId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSendingPricing(requestId);
    try {
      const res = await fetch('/api/admin/cobuy/requests/send-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      setSentPricing(prev => new Set(prev).add(requestId));
    } catch (err: any) {
      alert(`리마인드 발송 실패: ${err.message}`);
    } finally {
      setSendingPricing(null);
    }
  };

  const handleAdminStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>, requestId: string) => {
    const newStatus = e.target.value as CoBuyRequestAdminStatus;
    setUpdatingAdminStatus(requestId);
    try {
      const res = await fetch('/api/admin/cobuy/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requestId, admin_status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      mutate(
        (requests || []).map(r =>
          r.id === requestId ? { ...r, admin_status: newStatus } : r
        ),
        { revalidate: false }
      );
    } catch {
      alert('관리자 상태 변경에 실패했습니다.');
    } finally {
      setUpdatingAdminStatus(null);
    }
  };

  const handleSaveMemo = async (e: React.MouseEvent, requestId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const notes = memoDrafts[requestId]?.trim() || '';
    setSavingMemoId(requestId);
    try {
      const res = await fetch('/api/admin/cobuy/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requestId, admin_notes: notes || null }),
      });
      if (!res.ok) throw new Error('Failed');
      mutate(
        (requests || []).map(r =>
          r.id === requestId ? { ...r, admin_notes: notes || null } : r
        ),
        { revalidate: false }
      );
      setMemoPopoverId(null);
    } catch {
      alert('메모 저장에 실패했습니다.');
    } finally {
      setSavingMemoId(null);
    }
  };

  const hasAnyPreview = requests?.some(r => r.freeform_preview_url);

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-3">공동구매 요청 관리</h2>

      {/* Status Filter */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {['all', 'draft', 'pending', 'in_progress', 'design_shared', 'feedback', 'confirmed', 'session_created', 'rejected'].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              statusFilter === status ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {status === 'all' ? '전체' : statusLabels[status as CoBuyRequestStatus]}
          </button>
        ))}
      </div>

      {/* Request List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500 text-sm">요청 목록을 불러올 수 없습니다.</div>
      ) : !requests?.length ? (
        <div className="text-center py-12 text-gray-400 text-sm">요청이 없습니다.</div>
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
            {hasAnyPreview && <div className="w-10 shrink-0" />}
            <div className="flex-1 min-w-0 grid grid-cols-[1.2fr_0.6fr_0.6fr_0.8fr_1fr_1.2fr_0.5fr_0.7fr_0.7fr_0.6fr] gap-2">
              <span>단체명</span>
              <span className="text-center">상태</span>
              <span className="text-center">관리자</span>
              <span>요청자</span>
              <span>전화번호</span>
              <span>이메일</span>
              <span>수량</span>
              <span>희망 수령일</span>
              <span>요청일</span>
              <span>메모</span>
            </div>
            <div className="w-16 shrink-0" />
          </div>
          {requests.map(req => {
            const hasEmail = !!(req.guest_email || (req as any).profiles?.email);
            const canSendRemind = req.status === 'draft' && hasEmail;
            const isSending = sendingPricing === req.id;
            const isSent = sentPricing.has(req.id);

            return (
              <div
                key={req.id}
                onClick={() => router.push(`/cobuy/requests/${req.id}`)}
                className="block w-full text-left px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {hasAnyPreview && (
                    req.freeform_preview_url ? (
                      <div className="w-10 h-10 rounded-md bg-gray-50 overflow-hidden shrink-0 border border-gray-100">
                        <img src={req.freeform_preview_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-10 shrink-0" />
                    )
                  )}
                  <div className="flex-1 min-w-0 grid grid-cols-[1.2fr_0.6fr_0.6fr_0.8fr_1fr_1.2fr_0.5fr_0.7fr_0.7fr_0.6fr] gap-2 items-center">
                    <p className="text-sm font-medium text-gray-900 truncate">{req.title}</p>
                    <div className="text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[req.status]}`}>
                        {statusLabels[req.status]}
                      </span>
                    </div>
                    <div className="text-center" onClick={e => e.stopPropagation()}>
                      <select
                        value={req.admin_status || 'not_reviewed'}
                        onChange={(e) => handleAdminStatusChange(e, req.id)}
                        disabled={updatingAdminStatus === req.id}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border-0 cursor-pointer appearance-none text-center ${
                          adminStatusColors[req.admin_status || 'not_reviewed']
                        }`}
                      >
                        {Object.entries(adminStatusLabels).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-gray-600 truncate">{req.guest_name || (req as any).profiles?.name || '-'}</p>
                    <p className="text-xs text-gray-500 truncate">{req.guest_phone || (req as any).profiles?.phone || '-'}</p>
                    <p className="text-xs text-gray-500 truncate">{req.guest_email || (req as any).profiles?.email || '-'}</p>
                    <p className="text-xs text-gray-600">{(req.quantity_expectations as any)?.estimatedQuantity ? `${(req.quantity_expectations as any).estimatedQuantity}벌` : '-'}</p>
                    <p className="text-[10px] text-gray-400">{formatDateShort((req.schedule_preferences as any)?.receiveByDate)}</p>
                    <p className="text-[10px] text-gray-400">{formatDate(req.created_at)}</p>
                    <div
                      className="relative"
                      onClick={e => { e.stopPropagation(); setMemoPopoverId(memoPopoverId === req.id ? null : req.id); }}
                    >
                      <p className={`text-[10px] truncate cursor-pointer hover:underline ${req.admin_notes ? 'text-gray-600' : 'text-gray-300'}`}>
                        {req.admin_notes || '메모'}
                      </p>
                      {memoPopoverId === req.id && (
                        <div
                          className="absolute z-50 top-6 right-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-2"
                          onClick={e => e.stopPropagation()}
                        >
                          <textarea
                            value={memoDrafts[req.id] ?? ''}
                            onChange={e => setMemoDrafts(prev => ({ ...prev, [req.id]: e.target.value }))}
                            placeholder="메모 입력..."
                            rows={3}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md resize-none focus:outline-none focus:border-blue-400"
                          />
                          <button
                            onClick={(e) => handleSaveMemo(e, req.id)}
                            disabled={savingMemoId === req.id}
                            className="mt-1 w-full px-2 py-1 bg-blue-600 text-white text-[10px] font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            {savingMemoId === req.id ? '저장중...' : '저장'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="w-16 shrink-0 flex justify-center">
                    {canSendRemind && (
                      <button
                        onClick={(e) => handleSendPricing(e, req.id)}
                        disabled={isSending || isSent}
                        title={isSent ? '리마인드 발송됨' : '리마인드 메일 발송'}
                        className={`p-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 ${
                          isSent
                            ? 'bg-green-50 text-green-600 cursor-default'
                            : isSending
                              ? 'bg-gray-100 text-gray-400 cursor-wait'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        }`}
                      >
                        {isSent ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : isSending ? (
                          <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                        ) : (
                          <Mail className="w-3.5 h-3.5" />
                        )}
                        <span className="text-[10px]">{isSent ? '발송됨' : '리마인드'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
