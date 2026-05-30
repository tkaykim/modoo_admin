'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { InquiryRecord, InquiryStatus, InquiryReplyRecord } from './types';
import { formatDate, getStatusStyle, getStatusLabel, isToday } from './utils';
import { formatKstDateOnly } from '@/lib/kst';
import InquiryAiDraftBar, { type CsDraft } from './InquiryAiDraftBar';
import ReplyAttacher from './ReplyAttacher';

const isImageUrl = (u: string) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);

export default function InquiriesSection() {
  const { data: inquiries = [], error: swrError, isLoading: loading, mutate } = useSWR<InquiryRecord[]>('/api/admin/inquiries');
  // 검수 대기 중인 AI 응대 초안 (inquiry_id → draft). 답변창에 임시저장 형태로 미리 채움.
  const { data: csDrafts = [], mutate: mutateDrafts } = useSWR<(CsDraft & { inquiry_id: string; draft_reply: string; reviewer_edited_reply: string | null })[]>('/api/admin/cs/drafts?status=pending_review');
  const draftByInquiry: Record<string, (typeof csDrafts)[number]> = {};
  for (const d of csDrafts) draftByInquiry[d.inquiry_id] = d;
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyFiles, setReplyFiles] = useState<Record<string, string[]>>({});

  // AI 초안을 답변창에 시드 (관리자가 아직 손대지 않은 경우에만)
  useEffect(() => {
    if (csDrafts.length === 0) return;
    setReplyDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const d of csDrafts) {
        if (next[d.inquiry_id] === undefined) {
          next[d.inquiry_id] = d.reviewer_edited_reply ?? d.draft_reply ?? '';
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [csDrafts]);
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [expandedInquiryId, setExpandedInquiryId] = useState<string | null>(null);
  const [adminFilter, setAdminFilter] = useState<'all' | 'real' | 'admin'>('real');
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');

  // 챗봇 문의 관리에서 '게시판 문의 보기' 링크로 들어온 경우 → 해당 문의 자동 펼침 + 스크롤
  useEffect(() => {
    if (!focusId || inquiries.length === 0) return;
    if (!inquiries.some((q) => q.id === focusId)) return;
    setAdminFilter('all');
    setExpandedInquiryId(focusId);
    const el = document.getElementById(`inquiry-${focusId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, inquiries]);

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
    const content = replyDrafts[inquiryId]?.trim() || '';
    const fileUrls = replyFiles[inquiryId] || [];
    if (!content && fileUrls.length === 0) return;

    setSubmittingReplyId(inquiryId);
    setError(null);

    try {
      const response = await fetch('/api/admin/inquiries/replies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inquiryId, content, file_urls: fileUrls }),
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
      setReplyFiles((prev) => ({ ...prev, [inquiryId]: [] }));
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
              <div
                key={inquiry.id}
                id={`inquiry-${inquiry.id}`}
                className={`bg-white border rounded-md shadow-sm ${focusId === inquiry.id ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200/60'}`}
              >
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
                        <p className="text-sm font-medium text-gray-700">첨부파일 ({inquiry.file_urls.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {inquiry.file_urls.map((url, i) =>
                            isImageUrl(url) ? (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={`첨부 ${i + 1}`} className="w-24 h-24 object-cover rounded-md border border-gray-200" />
                              </a>
                            ) : (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              >
                                파일 {i + 1}
                              </a>
                            )
                          )}
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
                            <div key={reply.id} className={`border-l-2 pl-3 ${reply.is_admin === false ? 'border-gray-300' : 'border-blue-200'}`}>
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span className={reply.is_admin === false ? 'text-gray-700 font-medium' : ''}>
                                  {reply.is_admin === false ? '고객 답글' : `관리자 ${reply.admin_id ? reply.admin_id.slice(0, 8) : ''}`}
                                </span>
                                <span>{formatDate(reply.created_at)}</span>
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                {reply.content}
                              </p>
                              {reply.file_urls && reply.file_urls.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {reply.file_urls.map((url) =>
                                    isImageUrl(url) ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <a key={url} href={url} target="_blank" rel="noreferrer">
                                        <img src={url} alt="첨부" className="w-20 h-20 object-cover rounded border border-gray-200" />
                                      </a>
                                    ) : (
                                      <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-blue-50 text-blue-700 hover:bg-blue-100">
                                        첨부파일
                                      </a>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">등록된 답변이 없습니다.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      {draftByInquiry[inquiry.id] && (
                        <p className="text-xs font-medium text-indigo-600">🤖 AI 초안이 답변창에 임시저장되었습니다 — 검토 후 발행하세요.</p>
                      )}
                      <textarea
                        placeholder="답변을 입력하세요."
                        value={replyDrafts[inquiry.id] || ''}
                        onChange={(event) =>
                          setReplyDrafts((prev) => ({
                            ...prev,
                            [inquiry.id]: event.target.value,
                          }))
                        }
                        className={`w-full px-3 py-2 border rounded-md text-sm ${draftByInquiry[inquiry.id] ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-300'}`}
                        rows={draftByInquiry[inquiry.id] ? 8 : 3}
                      />
                      {draftByInquiry[inquiry.id] ? (
                        <InquiryAiDraftBar
                          draft={draftByInquiry[inquiry.id]}
                          replyText={replyDrafts[inquiry.id] || ''}
                          onDone={() => {
                            mutateDrafts();
                            mutate();
                            setReplyDrafts((prev) => ({ ...prev, [inquiry.id]: '' }));
                          }}
                        />
                      ) : (
                        <>
                          <ReplyAttacher
                            urls={replyFiles[inquiry.id] || []}
                            onChange={(urls) => setReplyFiles((prev) => ({ ...prev, [inquiry.id]: urls }))}
                            disabled={submittingReplyId === inquiry.id}
                          />
                          <div className="flex justify-end">
                            <button
                              onClick={() => handleReplySubmit(inquiry.id)}
                              disabled={
                                submittingReplyId === inquiry.id ||
                                (!(replyDrafts[inquiry.id] || '').trim() && (replyFiles[inquiry.id] || []).length === 0)
                              }
                              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                              {submittingReplyId === inquiry.id ? '전송 중...' : '답변 전송'}
                            </button>
                          </div>
                        </>
                      )}
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
