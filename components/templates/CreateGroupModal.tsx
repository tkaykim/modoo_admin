'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from '@/lib/templateCategories';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the newly created group id so caller can route to product-picker. */
  onCreated: (groupId: string) => void;
}

/**
 * Modal: capture group meta (title/category/tags) then POST /api/admin/template-groups.
 * After creation, the caller routes to a product-picker so the admin can add the
 * first product instance.
 */
export default function CreateGroupModal({ isOpen, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory | ''>('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isFeatured, setIsFeatured] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setDescription('');
    setCategory('');
    setTagInput('');
    setTags([]);
    setIsFeatured(false);
    setError(null);
    setSubmitting(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    if (tags.includes(v)) {
      setTagInput('');
      return;
    }
    setTags([...tags, v]);
    setTagInput('');
  };

  const submit = async () => {
    if (!title.trim()) {
      setError('제목을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/template-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          category: category || null,
          tags,
          is_featured: isFeatured,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '그룹 생성에 실패했습니다.');
      const newId = json?.data?.id as string | undefined;
      if (!newId) throw new Error('그룹 ID를 받지 못했습니다.');
      onCreated(newId);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : '그룹 생성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={close}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <h2 className="text-base font-semibold">디자인 그룹 만들기</h2>
          <button onClick={close} className="p-1.5 rounded hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-gray-500">
            같은 디자인 컨셉(예: 가족사진 정중앙)으로 여러 제품에 적용할 묶음을 먼저 만듭니다. 다음 단계에서 첫 제품을 골라 디자인을 배치합니다.
          </p>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 가족사진 정중앙"
              className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">설명 (선택)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="고객에게 보여줄 설명"
              className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:border-black resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TemplateCategory | '')}
              className="w-full px-3 py-2 border border-gray-200 rounded text-sm"
            >
              <option value="">(없음)</option>
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {TEMPLATE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">태그</label>
            <div className="flex gap-1 mb-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="태그 입력 후 Enter"
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs"
              />
              <button
                onClick={addTag}
                className="px-2 rounded bg-gray-100 hover:bg-gray-200 text-xs"
              >
                추가
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[10px]"
                  >
                    #{t}
                    <button
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
            />
            홈/갤러리 상단 노출 (Featured)
          </label>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button
            onClick={close}
            className="px-4 py-1.5 rounded border border-gray-300 text-xs font-medium hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={submitting || !title.trim()}
            className="px-4 py-1.5 rounded bg-black text-white text-xs font-medium hover:bg-gray-800 disabled:bg-gray-300 inline-flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
            그룹 생성 후 제품 선택
          </button>
        </div>
      </div>
    </div>
  );
}
