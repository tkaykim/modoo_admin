'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { InquiryRecord, InquiryStatus, InquiryReplyRecord } from './types';
import { formatDate, getStatusStyle, getStatusLabel, isToday } from './utils';
import { formatKstDateOnly } from '@/lib/kst';

export default function InquiriesSection() {
  const { data: inquiries = [], error: swrError, isLoading: loading, mutate } = useSWR<InquiryRecord[]>('/api/admin/inquiries');
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [expandedInquiryId, setExpandedInquiryId] = useState<string | null>(null);
  const [adminFilter, setAdminFilter] = useState<'all' | 'real' | 'admin'>('real');

  const handleDeleteInquiry = async (inquiryId: string) => {
    const confirmed = window.confirm('이 문의를 삭제할까요? 관련된 답변도 함께 삭제됩니다.');
    if (!confirmed) return;

    setError(null);
    try {
      const response = await fetch(`/api/admin/inquiries?id=${inquiryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '문의 삭제에 실패했습니다.');
      }

      mutate(inquiries.filter((inquiry) => inquiry.id !== inquiryId), { revalidate: false });
      if (expandedInquiryId === inquiryId) {
        setExpandedInquiryId(null);
      }
    } catch (err) {
      console.error('Error deleting inquiry:', err);
      setError(err instanceof Error ? err.message : '문의 삭제에 실패했습니다.');
    }
  };

  const handleReplySubmit = async (inquiryId: string) => {
    const content = replyDrafts[inquiryId]?.trim();
    if (!content) return;

    setSubmittingReplyId(inquiryId);
    setError(null);

    try {
      const response = await fetch('/api/admin/inquiries/replies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inquiryId, content }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '답변 등록에 실패했습니다.');
      }

      const payload = await response.json();
      const reply = payload?.data as InquiryReplyRecord;

      mutate(
        inquiries.map((inquiry) => {
          if (inquiry.id !== inquiryId) return inquiry;
          const replies = inquiry.inquiry_replies ? [...inquiry.inquiry_replies, reply] : [reply];
          return { ...inquiry, inquiry_replies: replies };
        }),
        { revalidate: false }
      );

      setReplyDrafts((prev) => ({ ...prev, [inquiryId]: '' }));
    } catch (err) {
      console.error('Error submitting reply:', err);
      setError(err instanceof Error ? err.message : '답변 등록에 실패했습니다.');
    } finally {
      setSubmittingReplyId(null);
    }
  };

  const handleStatusChange = async (inquiryId: string, status: InquiryStatus) => {
    setUpdatingStatusId(inquiryId);
    setError(null);

    try {
      const response = await fetch('/api/admin/inquiries', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inquiryId, status }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '상태 업데이트에 실패했습니다.');
      }

      const payload = await response.json();
      const updated = payload?.data as { id: string; status: InquiryStatus };

      mutate(
        inquiries.map((inquiry) =>
          inquiry.id === updated.id ? { ...inquiry, status: updated.status } : inquiry
        ),
        { revalidate: false }
      );
    } catch (err) {
      console.error('Error updating inquiry status:', err);
      setError(err instanceof Error ? err.message : '상태 업데이트에 실패했습니다.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const filteredInquiries = inquiries.filter((inquiry) => {
    if (adminFilter === 'real') return !inquiry.is_admin;
    if (adminFilter === 'admin') return inquiry.is_admin;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([
          ['real', '실제 문의'],
          ['admin', '자동 생성'],
          ['all', '전체'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setAdminFilter(value)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              adminFilter === value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {(swrError || error) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800">
          {swrError?.message || error}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredInquiries.length === 0 ? (
        <div className="bg-white border border-gray-200/60 rounded-md p-6 text-center text-gray-500">
          등록된 문의가 없습니다.
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredInquiries.map((inquiry) => {
            const productNames = Array.from(
              new Set(
                (inquiry.inquiry_products || []).map(
                  (product) => product.product?.title || product.product_id
                )
              )
            );
            const isExpanded = expandedInquiryId === inquiry.id;
            const detailsId = `inquiry-details-${inquiry.id}`;

            return (
              <div key={inquiry.id} className="bg-white border border-gray-200/60 rounded-md shadow-sm">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedInquiryId((prev) => (prev === inquiry.id ? null : inquiry.id))
                  }
                  aria-expanded={isExpanded}
                  aria-controls={detailsId}
                  className="w-full px-4 py-3 flex flex-wrap items-start justify-between gap-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900">{inquiry.title}</h3>
                      {isToday(inquiry.created_at) && (
                        <span className="text-xs text-red-500 font-bold">NEW</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-xs text-gray-500">{formatDate(inquiry.created_at)}</span>
                      {inquiry.group_name && (
                        <span className="text-xs text-gray-700 font-medium">{inquiry.group_name}</span>
                      )}
                      {inquiry.manager_name && (
                        <span className="text-xs text-gray-600">{inquiry.manager_name}</span>
                      )}
                      {inquiry.phone && (
                        <span className="text-xs text-gray-500">{inquiry.phone}</span>
                      )}
                      {inquiry.expected_qty && (
                        <span className="text-xs text-gray-500">{inquiry.expected_qty}벌</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusStyle(
                        inquiry.status
                      )}`}
                    >
                      {getStatusLabel(inquiry.status)}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div id={detailsId} className="px-4 pb-4 space-y-4">
                    {(inquiry.group_name || inquiry.manager_name || inquiry.phone || inquiry.kakao_id || inquiry.desired_date || inquiry.expected_qty || inquiry.fabric_color) && (
                      <div className="bg-gray-50 rounded-md p-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                          {inquiry.group_name && (
                            <div>
                              <span className="text-gray-500">단체명</span>
                              <p className="font-medium text-gray-900">{inquiry.group_name}</p>
                            </div>
                          )}
                          {inquiry.manager_name && (
                            <div>
                              <span className="text-gray-500">담당자</span>
                              <p className="font-medium text-gray-900">{inquiry.manager_name}</p>
                            </div>
                          )}
                          {inquiry.phone && (
                            <div>
                              <span className="text-gray-500">연락처</span>
                              <p className="font-medium text-gray-900">{inquiry.phone}</p>
                            </div>
                          )}
                          {inquiry.kakao_id && (
                            <div>
                              <span className="text-gray-500">카카오톡</span>
                              <p className="font-medium text-gray-900">{inquiry.kakao_id}</p>
                            </div>
                          )}
                          {inquiry.desired_date && (
                            <div>
                              <span className="text-gray-500">착용희망일</span>
                              <p className="font-medium text-gray-900">{formatKstDateOnly(inquiry.desired_date)}</p>
                            </div>
                          )}
                          {inquiry.expected_qty && (
                            <div>
                              <span className="text-gray-500">예상수량</span>
                              <p className="font-medium text-gray-900">{inquiry.expected_qty}벌</p>
                            </div>
                          )}
                          {inquiry.fabric_color && (
                            <div>
                              <span className="text-gray-500">원단 색상</span>
                              <p className="font-medium text-gray-900">{inquiry.fabric_color}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">문의 내용</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {inquiry.content}
                      </p>
                    </div>

                    {inquiry.file_urls && inquiry.file_urls.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-700">첨부파일</p>
                        <div className="flex flex-wrap gap-2">
                          {inquiry.file_urls.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                              파일 {i + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">관련 제품</p>
                      {productNames.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {productNames.map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">연결된 제품이 없습니다.</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-700">상태 변경</label>
                      <select
                        value={inquiry.status}
                        onChange={(event) =>
                          handleStatusChange(inquiry.id, event.target.value as InquiryStatus)
                        }
                        disabled={updatingStatusId === inquiry.id}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white disabled:opacity-50"
                      >
                        <option value="pending">대기중</option>
                        <option value="ongoing">진행중</option>
                        <option value="completed">완료</option>
                      </select>
                      {updatingStatusId === inquiry.id && (
                        <span className="text-xs text-gray-500">업데이트 중...</span>
                      )}
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-medium text-gray-700">답변</p>
                      {inquiry.inquiry_replies && inquiry.inquiry_replies.length > 0 ? (
                        <div className="space-y-3">
                          {inquiry.inquiry_replies.map((reply) => (
                            <div key={reply.id} className="border-l-2 border-blue-200 pl-3">
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>
                                  관리자 {reply.admin_id ? reply.admin_id.slice(0, 8) : ''}
                                </span>
                                <span>{formatDate(reply.created_at)}</span>
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                {reply.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">등록된 답변이 없습니다.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <textarea
                        placeholder="답변을 입력하세요."
                        value={replyDrafts[inquiry.id] || ''}
                        onChange={(event) =>
                          setReplyDrafts((prev) => ({
                            ...prev,
                            [inquiry.id]: event.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        rows={3}
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleReplySubmit(inquiry.id)}
                          disabled={
                            submittingReplyId === inquiry.id ||
                            !(replyDrafts[inquiry.id] || '').trim()
                          }
                          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {submittingReplyId === inquiry.id ? '전송 중...' : '답변 전송'}
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200 flex justify-end">
                      <button
                        onClick={() => handleDeleteInquiry(inquiry.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 rounded-md transition-colors"
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
