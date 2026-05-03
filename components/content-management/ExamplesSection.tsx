'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase-client';
import { uploadFileToStorage } from '@/lib/supabase-storage';
import { Edit2, Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { ProductionExampleRecord, ProductSummary, ExampleFormState } from './types';
import {
  EXAMPLE_IMAGE_BUCKET,
  EXAMPLE_IMAGE_FOLDER,
  emptyExampleForm,
  sortExamples,
} from './utils';

export default function ExamplesSection() {
  const { data: rawExamples, error: swrError, isLoading: loading, mutate } = useSWR<ProductionExampleRecord[]>('/api/admin/production-examples');
  const productionExamples = rawExamples ? sortExamples(rawExamples) : [];
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exampleForm, setExampleForm] = useState<ExampleFormState>(emptyExampleForm);
  const [exampleFormOpen, setExampleFormOpen] = useState(false);
  const [exampleFormError, setExampleFormError] = useState<string | null>(null);
  const [savingExample, setSavingExample] = useState(false);
  const [uploadingExampleImage, setUploadingExampleImage] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('products')
        .select('id, title')
        .order('title', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
      setProducts([]);
    }
  };

  const handleExampleFormToggle = () => {
    setExampleFormOpen((prev) => !prev);
    setExampleFormError(null);
    if (exampleFormOpen) {
      setExampleForm(emptyExampleForm);
    }
  };

  const handleExampleEdit = (example: ProductionExampleRecord) => {
    setExampleForm({
      id: example.id,
      product_id: example.product_id,
      title: example.title,
      description: example.description ?? '',
      image_url: example.image_url ?? '',
      sort_order: example.sort_order ?? 0,
      is_active: Boolean(example.is_active),
    });
    setExampleFormOpen(true);
    setExampleFormError(null);
  };

  const handleExampleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setExampleFormError('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setUploadingExampleImage(true);
    setExampleFormError(null);

    try {
      const supabase = createClient();
      const uploadResult = await uploadFileToStorage(
        supabase,
        file,
        EXAMPLE_IMAGE_BUCKET,
        EXAMPLE_IMAGE_FOLDER
      );

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || '이미지 업로드에 실패했습니다.');
      }

      setExampleForm((prev) => ({ ...prev, image_url: uploadResult.url ?? '' }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.';
      setExampleFormError(message);
    } finally {
      setUploadingExampleImage(false);
    }
  };

  const handleExampleImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleExampleImageUpload(file);
    event.target.value = '';
  };

  const handleExampleSave = async () => {
    setExampleFormError(null);

    if (uploadingExampleImage) {
      setExampleFormError('이미지 업로드가 완료될 때까지 기다려주세요.');
      return;
    }

    if (!exampleForm.product_id) {
      setExampleFormError('제품을 선택해주세요.');
      return;
    }

    if (!exampleForm.title.trim()) {
      setExampleFormError('제목을 입력해주세요.');
      return;
    }

    if (!exampleForm.image_url.trim()) {
      setExampleFormError('이미지 URL을 입력하거나 이미지를 업로드해주세요.');
      return;
    }

    setSavingExample(true);
    setError(null);

    const payload = {
      id: exampleForm.id ?? undefined,
      product_id: exampleForm.product_id,
      title: exampleForm.title.trim(),
      description: exampleForm.description.trim(),
      image_url: exampleForm.image_url.trim(),
      sort_order: exampleForm.sort_order,
      is_active: exampleForm.is_active,
    };

    try {
      const response = await fetch('/api/admin/production-examples', {
        method: exampleForm.id ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || '제작 사례 저장에 실패했습니다.');
      }

      const responsePayload = await response.json();
      const savedExample = responsePayload?.data as ProductionExampleRecord;

      const updated = exampleForm.id
        ? (rawExamples || []).map((example) => (example.id === savedExample.id ? savedExample : example))
        : [savedExample, ...(rawExamples || [])];
      mutate(updated, { revalidate: false });

      setExampleForm(emptyExampleForm);
      setExampleFormOpen(false);
    } catch (err) {
      console.error('Error saving production example:', err);
      setError(err instanceof Error ? err.message : '제작 사례 저장에 실패했습니다.');
    } finally {
      setSavingExample(false);
    }
  };

  const handleExampleDelete = async (exampleId: string) => {
    const confirmed = window.confirm('이 제작 사례를 삭제할까요?');
    if (!confirmed) return;

    setError(null);
    try {
      const response = await fetch(`/api/admin/production-examples?id=${exampleId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '제작 사례 삭제에 실패했습니다.');
      }

      mutate((rawExamples || []).filter((example) => example.id !== exampleId), { revalidate: false });
    } catch (err) {
      console.error('Error deleting production example:', err);
      setError(err instanceof Error ? err.message : '제작 사례 삭제에 실패했습니다.');
    }
  };

  const handleExampleToggle = async (example: ProductionExampleRecord) => {
    setError(null);
    try {
      const response = await fetch('/api/admin/production-examples', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: example.id,
          is_active: !example.is_active,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '활성 상태 변경에 실패했습니다.');
      }

      const payload = await response.json();
      const updatedExample = payload?.data as ProductionExampleRecord;
      mutate(
        (rawExamples || []).map((item) => (item.id === updatedExample.id ? updatedExample : item)),
        { revalidate: false }
      );
    } catch (err) {
      console.error('Error toggling production example:', err);
      setError(err instanceof Error ? err.message : '활성 상태 변경에 실패했습니다.');
    }
  };

  const handleDrop = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const reordered = [...productionExamples];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Optimistic update with new sort_order values
    const updated = reordered.map((item, i) => ({ ...item, sort_order: i + 1 }));
    mutate(updated, { revalidate: false });

    try {
      const res = await fetch('/api/admin/production-examples/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map((e) => e.id) }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || '순서 변경에 실패했습니다.');
      }
    } catch (err) {
      mutate(); // Revert on error
      setError(err instanceof Error ? err.message : '순서 변경에 실패했습니다.');
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
            <h3 className="text-base font-semibold text-gray-900">제작 사례 관리</h3>
            <p className="text-sm text-gray-500">홈페이지에 노출할 사례를 등록하세요.</p>
          </div>
          <button
            onClick={handleExampleFormToggle}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {exampleFormOpen ? '입력 닫기' : '새 사례 추가'}
          </button>
        </div>

        {exampleFormOpen && (
          <div className="bg-gray-50 rounded-md p-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-gray-700">
                제품 선택
                <select
                  value={exampleForm.product_id}
                  onChange={(event) =>
                    setExampleForm((prev) => ({ ...prev, product_id: event.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                >
                  <option value="">제품 선택</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-gray-700">
                제목
                <input
                  type="text"
                  value={exampleForm.title}
                  onChange={(event) =>
                    setExampleForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
            </div>
            <label className="space-y-2 text-sm text-gray-700">
              설명
              <textarea
                value={exampleForm.description}
                onChange={(event) =>
                  setExampleForm((prev) => ({ ...prev, description: event.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={3}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-3 text-sm text-gray-700 md:col-span-2">
                <label className="space-y-2 text-sm text-gray-700">
                  이미지 URL
                  <input
                    type="text"
                    value={exampleForm.image_url}
                    onChange={(event) =>
                      setExampleForm((prev) => ({ ...prev, image_url: event.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </label>
                <label className="space-y-2 text-sm text-gray-700">
                  이미지 업로드
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleExampleImageInputChange}
                    disabled={uploadingExampleImage}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                  />
                  {uploadingExampleImage && (
                    <span className="text-xs text-gray-500">업로드 중...</span>
                  )}
                </label>
              </div>
              <label className="space-y-2 text-sm text-gray-700">
                정렬 순서
                <input
                  type="number"
                  value={exampleForm.sort_order}
                  onChange={(event) =>
                    setExampleForm((prev) => ({
                      ...prev,
                      sort_order: Number(event.target.value) || 0,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={exampleForm.is_active}
                onChange={(event) =>
                  setExampleForm((prev) => ({ ...prev, is_active: event.target.checked }))
                }
                className="rounded border-gray-300"
              />
              활성 상태로 노출
            </label>

            {exampleFormError && (
              <p className="text-sm text-red-600">{exampleFormError}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setExampleForm(emptyExampleForm);
                  setExampleFormOpen(false);
                  setExampleFormError(null);
                }}
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleExampleSave}
                disabled={savingExample || uploadingExampleImage}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingExample
                  ? '저장 중...'
                  : uploadingExampleImage
                    ? '이미지 업로드 중...'
                    : '저장'}
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : productionExamples.length === 0 ? (
        <div className="bg-white border border-gray-200/60 rounded-md p-6 text-center text-gray-500">
          등록된 제작 사례가 없습니다.
        </div>
      ) : (
        <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-2 py-2" />
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    이미지
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    제목
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    제품
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productionExamples.map((example, idx) => (
                  <tr
                    key={example.id}
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(idx);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null && dragIndex !== idx) {
                        handleDrop(dragIndex, idx);
                      }
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    className={`hover:bg-gray-50 transition-colors ${dragIndex === idx ? 'opacity-50' : ''}`}
                  >
                    <td className="w-10 px-2 py-3 text-center">
                      <GripVertical className="w-4 h-4 text-gray-400 cursor-grab inline-block" />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <img
                        src={example.image_url}
                        alt={example.title}
                        className="w-16 h-16 object-cover rounded-md border border-gray-200"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{example.title}</div>
                      <div className="text-xs text-gray-500 max-w-xs truncate">
                        {example.description}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {example.product?.title || example.product_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => handleExampleToggle(example)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          example.is_active
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {example.is_active ? (
                          <>
                            <Eye className="w-3 h-3" />
                            활성
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" />
                            비활성
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleExampleEdit(example)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                          편집
                        </button>
                        <button
                          onClick={() => handleExampleDelete(example.id)}
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
