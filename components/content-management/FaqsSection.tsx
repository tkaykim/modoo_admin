'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Edit2, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import type { FaqRecord, FaqFormState } from './types';
import { emptyFaqForm, sortFaqs, formatDate, parseFaqTags } from './utils';

export default function FaqsSection() {
  const { data: rawFaqs, error: swrError, isLoading: loading, mutate } = useSWR<FaqRecord[]>('/api/admin/faqs');
  const faqs = rawFaqs ? sortFaqs(rawFaqs) : [];
  const [error, setError] = useState<string | null>(null);
  const [faqForm, setFaqForm] = useState<FaqFormState>(emptyFaqForm);
  const [faqFormOpen, setFaqFormOpen] = useState(false);
  const [faqFormError, setFaqFormError] = useState<string | null>(null);
  const [savingFaq, setSavingFaq] = useState(false);

  const handleFaqFormToggle = () => {
    setFaqFormOpen((prev) => !prev);
    setFaqFormError(null);
    if (faqFormOpen) {
      setFaqForm(emptyFaqForm);
    }
  };

  const handleFaqEdit = (faq: FaqRecord) => {
    setFaqForm({
      id: faq.id,
      question: faq.question ?? '',
      answer: faq.answer ?? '',
      category: faq.category ?? '',
      tags: (faq.tags ?? []).join(', '),
      sort_order: faq.sort_order ?? 0,
      is_published: Boolean(faq.is_published),
    });
    setFaqFormOpen(true);
    setFaqFormError(null);
  };

  const handleFaqSave = async () => {
    setFaqFormError(null);

    if (!faqForm.question.trim()) {
      setFaqFormError('질문을 입력해주세요.');
      return;
    }

    if (!faqForm.answer.trim()) {
      setFaqFormError('답변을 입력해주세요.');
      return;
    }

    setSavingFaq(true);
    setError(null);

    const payload = {
      id: faqForm.id ?? undefined,
      question: faqForm.question.trim(),
      answer: faqForm.answer.trim(),
      category: faqForm.category.trim() || null,
      tags: parseFaqTags(faqForm.tags),
      sort_order: faqForm.sort_order,
      is_published: faqForm.is_published,
    };

    try {
      const response = await fetch('/api/admin/faqs', {
        method: faqForm.id ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'FAQ 저장에 실패했습니다.');
      }

      const responsePayload = await response.json();
      const savedFaq = responsePayload?.data as FaqRecord;

      const updated = faqForm.id
        ? (rawFaqs || []).map((item) => (item.id === savedFaq.id ? savedFaq : item))
        : [savedFaq, ...(rawFaqs || [])];
      mutate(updated, { revalidate: false });

      setFaqForm(emptyFaqForm);
      setFaqFormOpen(false);
    } catch (err) {
      console.error('Error saving faq:', err);
      setError(err instanceof Error ? err.message : 'FAQ 저장에 실패했습니다.');
    } finally {
      setSavingFaq(false);
    }
  };

  const handleFaqDelete = async (faqId: string) => {
    const confirmed = window.confirm('이 FAQ를 삭제할까요?');
    if (!confirmed) return;

    setError(null);
    try {
      const response = await fetch(`/api/admin/faqs?id=${faqId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'FAQ 삭제에 실패했습니다.');
      }

      mutate((rawFaqs || []).filter((item) => item.id !== faqId), { revalidate: false });
    } catch (err) {
      console.error('Error deleting faq:', err);
      setError(err instanceof Error ? err.message : 'FAQ 삭제에 실패했습니다.');
    }
  };

  const handleFaqToggle = async (faq: FaqRecord) => {
    setError(null);
    try {
      const response = await fetch('/api/admin/faqs', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: faq.id,
          is_published: !faq.is_published,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '공개 상태 변경에 실패했습니다.');
      }

      const payload = await response.json();
      const updatedFaq = payload?.data as FaqRecord;
      mutate(
        (rawFaqs || []).map((item) => (item.id === updatedFaq.id ? updatedFaq : item)),
        { revalidate: false }
      );
    } catch (err) {
      console.error('Error toggling faq:', err);
      setError(err instanceof Error ? err.message : '공개 상태 변경에 실패했습니다.');
    }
  };

  return (
    <div className="space-y-4">
      {(swrError || error) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800">
          {swrError?.message || error}
        </div>
      )}

      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">FAQ 관리</h3>
            <p className="text-sm text-gray-500">자주 묻는 질문을 등록/수정하세요.</p>
          </div>
          <button
            onClick={handleFaqFormToggle}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {faqFormOpen ? '입력 닫기' : '새 FAQ 추가'}
          </button>
        </div>

        {faqFormOpen && (
          <div className="bg-gray-50 rounded-md p-4 space-y-4">
            <label className="space-y-2 text-sm text-gray-700">
              질문
              <input
                type="text"
                value={faqForm.question}
                onChange={(event) =>
                  setFaqForm((prev) => ({ ...prev, question: event.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </label>
            <label className="space-y-2 text-sm text-gray-700">
              답변
              <textarea
                value={faqForm.answer}
                onChange={(event) =>
                  setFaqForm((prev) => ({ ...prev, answer: event.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={4}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm text-gray-700">
                카테고리
                <input
                  type="text"
                  value={faqForm.category}
                  onChange={(event) =>
                    setFaqForm((prev) => ({ ...prev, category: event.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
              <label className="space-y-2 text-sm text-gray-700 md:col-span-2">
                태그 (쉼표로 구분)
                <input
                  type="text"
                  value={faqForm.tags}
                  onChange={(event) => setFaqForm((prev) => ({ ...prev, tags: event.target.value }))}
                  placeholder="예: 결제, 배송, 디자인"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2 items-end">
              <label className="space-y-2 text-sm text-gray-700">
                정렬 순서
                <input
                  type="number"
                  value={faqForm.sort_order}
                  onChange={(event) =>
                    setFaqForm((prev) => ({
                      ...prev,
                      sort_order: Number(event.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={faqForm.is_published}
                  onChange={(event) =>
                    setFaqForm((prev) => ({ ...prev, is_published: event.target.checked }))
                  }
                  className="rounded border-gray-300"
                />
                공개 상태로 노출
              </label>
            </div>

            {faqFormError && <p className="text-sm text-red-600">{faqFormError}</p>}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setFaqForm(emptyFaqForm);
                  setFaqFormOpen(false);
                  setFaqFormError(null);
                }}
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleFaqSave}
                disabled={savingFaq}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingFaq ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : faqs.length === 0 ? (
        <div className="bg-white border border-gray-200/60 rounded-md p-6 text-center text-gray-500">
          등록된 FAQ가 없습니다.
        </div>
      ) : (
        <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    질문/답변
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    카테고리
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    태그
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    정렬
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    업데이트
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {faqs.map((faq) => (
                  <tr key={faq.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 max-w-50">
                      <div className="text-sm font-medium text-gray-900">{faq.question}</div>
                      <div className="text-xs text-gray-500 max-w-xl truncate">
                        {faq.answer}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {faq.category || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {faq.tags && faq.tags.length > 0 ? faq.tags.join(', ') : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {faq.sort_order}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => handleFaqToggle(faq)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          faq.is_published
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {faq.is_published ? (
                          <>
                            <Eye className="w-3 h-3" />
                            공개
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" />
                            비공개
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(faq.updated_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleFaqEdit(faq)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                          편집
                        </button>
                        <button
                          onClick={() => handleFaqDelete(faq.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-red-700 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
