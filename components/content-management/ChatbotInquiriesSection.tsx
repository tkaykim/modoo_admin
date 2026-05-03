'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { ChatbotInquiryRecord, ChatbotInquiryStatus } from './types';
import {
  formatDate,
  getChatbotInquiryStatusStyle,
  getChatbotInquiryStatusLabel,
  sortChatbotInquiries,
} from './utils';

export default function ChatbotInquiriesSection() {
  const { data: rawInquiries, error: swrError, isLoading: loading, mutate } = useSWR<ChatbotInquiryRecord[]>('/api/admin/chatbot-inquiries');
  const inquiries = rawInquiries ? sortChatbotInquiries(rawInquiries) : [];
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);

  // Initialize notes drafts when data first loads
  useEffect(() => {
    if (!rawInquiries) return;
    setNotesDrafts((prev) => {
      const drafts: Record<string, string> = { ...prev };
      rawInquiries.forEach((inq) => {
        if (!(inq.id in drafts)) {
          drafts[inq.id] = inq.admin_notes || '';
        }
      });
      return drafts;
    });
  }, [rawInquiries]);

  const handleStatusChange = async (inquiryId: string, status: ChatbotInquiryStatus) => {
    setUpdatingStatusId(inquiryId);
    setError(null);
    try {
      const response = await fetch('/api/admin/chatbot-inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId, status }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '상태 변경에 실패했습니다.');
      }

      const payload = await response.json();
      mutate(
        (rawInquiries || []).map((inq) =>
          inq.id === inquiryId
            ? { ...inq, status: payload.data.status, updated_at: payload.data.updated_at }
            : inq
        ),
        { revalidate: false }
      );
    } catch (err) {
      console.error('Error updating status:', err);
      setError(err instanceof Error ? err.message : '상태 변경에 실패했습니다.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleSaveNotes = async (inquiryId: string) => {
    const notes = notesDrafts[inquiryId]?.trim() || '';
    setSavingNotesId(inquiryId);
    setError(null);

    try {
      const response = await fetch('/api/admin/chatbot-inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId, admin_notes: notes }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '메모 저장에 실패했습니다.');
      }

      const payload = await response.json();
      mutate(
        (rawInquiries || []).map((inq) =>
          inq.id === inquiryId
            ? { ...inq, admin_notes: payload.data.admin_notes, updated_at: payload.data.updated_at }
            : inq
        ),
        { revalidate: false }
      );
    } catch (err) {
      console.error('Error saving notes:', err);
      setError(err instanceof Error ? err.message : '메모 저장에 실패했습니다.');
    } finally {
      setSavingNotesId(null);
    }
  };

  const handleDelete = async (inquiryId: string) => {
    if (!confirm('이 챗봇 문의를 삭제하시겠습니까?')) return;

    setError(null);
    try {
      const response = await fetch(`/api/admin/chatbot-inquiries?id=${inquiryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '삭제에 실패했습니다.');
      }

      mutate((rawInquiries || []).filter((inq) => inq.id !== inquiryId), { revalidate: false });
      if (expandedId === inquiryId) setExpandedId(null);
    } catch (err) {
      console.error('Error deleting inquiry:', err);
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">챗봇 문의 관리</h2>
        <span className="text-sm text-gray-500">{inquiries.length}건</span>
      </div>

      {(swrError || error) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-sm">
          {swrError?.message || error}
        </div>
      )}

      {inquiries.length === 0 ? (
        <div className="bg-white border border-gray-200/60 rounded-md p-6 text-center text-gray-500">
          등록된 챗봇 문의가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map((inquiry) => {
            const isExpanded = expandedId === inquiry.id;

            return (
              <div
                key={inquiry.id}
                className="bg-white border border-gray-200/60 rounded-lg overflow-hidden"
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(inquiry.id)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getChatbotInquiryStatusStyle(
                        inquiry.status
                      )}`}
                    >
                      {getChatbotInquiryStatusLabel(inquiry.status)}
                    </span>
                    <div>
                      <span className="font-medium text-gray-900">{inquiry.contact_name}</span>
                      <span className="text-gray-500 text-sm ml-2">{inquiry.contact_phone}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {inquiry.clothing_type} / {inquiry.quantity}벌
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{formatDate(inquiry.created_at)}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 py-4 border-t border-gray-100 bg-gray-50 space-y-4">
                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-500">의류 종류</label>
                        <p className="text-sm text-gray-900">{inquiry.clothing_type}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">수량</label>
                        <p className="text-sm text-gray-900">{inquiry.quantity}벌</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">우선순위</label>
                        <p className="text-sm text-gray-900">{(inquiry.priorities || []).join(' → ')}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">필요 날짜</label>
                        <p className="text-sm text-gray-900">
                          {inquiry.needed_date_flexible
                            ? '상관없음 (제작일정에 따름)'
                            : inquiry.needed_date || '미지정'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">담당자</label>
                        <p className="text-sm text-gray-900">{inquiry.contact_name}</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">이메일</label>
                        <p className="text-sm text-gray-900">
                          {inquiry.contact_email ? (
                            <a
                              href={`mailto:${inquiry.contact_email}`}
                              className="text-blue-600 hover:underline"
                            >
                              {inquiry.contact_email}
                            </a>
                          ) : (
                            <span className="text-gray-400">미입력</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500">연락처</label>
                        <p className="text-sm text-gray-900">
                          <a
                            href={`tel:${inquiry.contact_phone}`}
                            className="text-blue-600 hover:underline"
                          >
                            {inquiry.contact_phone}
                          </a>
                        </p>
                      </div>
                    </div>

                    {/* Status Change */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-2">
                        상태 변경
                      </label>
                      <div className="flex gap-2">
                        {(['pending', 'contacted', 'completed', 'cancelled'] as ChatbotInquiryStatus[]).map(
                          (status) => (
                            <button
                              key={status}
                              onClick={() => handleStatusChange(inquiry.id, status)}
                              disabled={inquiry.status === status || updatingStatusId === inquiry.id}
                              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                inquiry.status === status
                                  ? getChatbotInquiryStatusStyle(status) + ' ring-2 ring-offset-1 ring-blue-500'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {getChatbotInquiryStatusLabel(status)}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Admin Notes */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-2">
                        관리자 메모
                      </label>
                      <div className="flex gap-2">
                        <textarea
                          value={notesDrafts[inquiry.id] || ''}
                          onChange={(e) =>
                            setNotesDrafts((prev) => ({ ...prev, [inquiry.id]: e.target.value }))
                          }
                          placeholder="메모를 입력하세요..."
                          rows={2}
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        />
                        <button
                          onClick={() => handleSaveNotes(inquiry.id)}
                          disabled={savingNotesId === inquiry.id}
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {savingNotesId === inquiry.id ? '저장중...' : '저장'}
                        </button>
                      </div>
                    </div>

                    {/* Delete Button */}
                    <div className="flex justify-end pt-2 border-t border-gray-200">
                      <button
                        onClick={() => handleDelete(inquiry.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
