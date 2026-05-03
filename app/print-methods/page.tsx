'use client';

import { useState, type ChangeEvent } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase-client';
import { uploadFileToStorage } from '@/lib/supabase-storage';
import { Plus, Trash2, Edit2, GripVertical, ImageIcon } from 'lucide-react';
import type { PrintMethodRecord } from '@/types/types';

interface PricingFormState {
  // Transfer pricing (flat per size)
  price_10x10: string;
  price_A4: string;
  price_A3: string;
  // Bulk pricing (base + additional)
  bulk_basePrice_10x10: string;
  bulk_baseQuantity_10x10: string;
  bulk_additionalPrice_10x10: string;
  bulk_basePrice_A4: string;
  bulk_baseQuantity_A4: string;
  bulk_additionalPrice_A4: string;
  bulk_basePrice_A3: string;
  bulk_baseQuantity_A3: string;
  bulk_additionalPrice_A3: string;
}

interface FormState {
  id: string | null;
  key: string;
  name: string;
  description: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  pricing: PricingFormState;
}

const emptyPricing: PricingFormState = {
  price_10x10: '',
  price_A4: '',
  price_A3: '',
  bulk_basePrice_10x10: '',
  bulk_baseQuantity_10x10: '100',
  bulk_additionalPrice_10x10: '',
  bulk_basePrice_A4: '',
  bulk_baseQuantity_A4: '100',
  bulk_additionalPrice_A4: '',
  bulk_basePrice_A3: '',
  bulk_baseQuantity_A3: '100',
  bulk_additionalPrice_A3: '',
};

const emptyForm: FormState = {
  id: null,
  key: '',
  name: '',
  description: '',
  image_url: '',
  sort_order: 0,
  is_active: true,
  pricing: emptyPricing,
};

const isTransferMethod = (key: string) => key === 'dtf' || key === 'dtg';

function parsePricingToForm(pricing: PrintMethodRecord['pricing'], key: string): PricingFormState {
  if (!pricing) return emptyPricing;

  if (isTransferMethod(key)) {
    return {
      ...emptyPricing,
      price_10x10: String(pricing['10x10'] ?? ''),
      price_A4: String(pricing['A4'] ?? ''),
      price_A3: String(pricing['A3'] ?? ''),
    };
  }

  const s10 = pricing['10x10'] as { basePrice?: number; baseQuantity?: number; additionalPricePerPiece?: number } | undefined;
  const sA4 = pricing['A4'] as { basePrice?: number; baseQuantity?: number; additionalPricePerPiece?: number } | undefined;
  const sA3 = pricing['A3'] as { basePrice?: number; baseQuantity?: number; additionalPricePerPiece?: number } | undefined;

  return {
    ...emptyPricing,
    bulk_basePrice_10x10: String(s10?.basePrice ?? ''),
    bulk_baseQuantity_10x10: String(s10?.baseQuantity ?? '100'),
    bulk_additionalPrice_10x10: String(s10?.additionalPricePerPiece ?? ''),
    bulk_basePrice_A4: String(sA4?.basePrice ?? ''),
    bulk_baseQuantity_A4: String(sA4?.baseQuantity ?? '100'),
    bulk_additionalPrice_A4: String(sA4?.additionalPricePerPiece ?? ''),
    bulk_basePrice_A3: String(sA3?.basePrice ?? ''),
    bulk_baseQuantity_A3: String(sA3?.baseQuantity ?? '100'),
    bulk_additionalPrice_A3: String(sA3?.additionalPricePerPiece ?? ''),
  };
}

function buildPricingFromForm(form: FormState): Record<string, unknown> | null {
  if (isTransferMethod(form.key)) {
    const p10 = parseInt(form.pricing.price_10x10);
    const pA4 = parseInt(form.pricing.price_A4);
    const pA3 = parseInt(form.pricing.price_A3);
    if (isNaN(p10) && isNaN(pA4) && isNaN(pA3)) return null;
    return {
      '10x10': p10 || 0,
      A4: pA4 || 0,
      A3: pA3 || 0,
    };
  }

  const bp10 = parseInt(form.pricing.bulk_basePrice_10x10);
  const bpA4 = parseInt(form.pricing.bulk_basePrice_A4);
  const bpA3 = parseInt(form.pricing.bulk_basePrice_A3);
  if (isNaN(bp10) && isNaN(bpA4) && isNaN(bpA3)) return null;

  return {
    '10x10': {
      basePrice: bp10 || 0,
      baseQuantity: parseInt(form.pricing.bulk_baseQuantity_10x10) || 100,
      additionalPricePerPiece: parseInt(form.pricing.bulk_additionalPrice_10x10) || 0,
    },
    A4: {
      basePrice: bpA4 || 0,
      baseQuantity: parseInt(form.pricing.bulk_baseQuantity_A4) || 100,
      additionalPricePerPiece: parseInt(form.pricing.bulk_additionalPrice_A4) || 0,
    },
    A3: {
      basePrice: bpA3 || 0,
      baseQuantity: parseInt(form.pricing.bulk_baseQuantity_A3) || 100,
      additionalPricePerPiece: parseInt(form.pricing.bulk_additionalPrice_A3) || 0,
    },
  };
}

function formatPrice(n: number) {
  return n.toLocaleString('ko-KR') + '원';
}

function getPricingSummary(item: PrintMethodRecord): string {
  if (!item.pricing) return '';
  if (isTransferMethod(item.key)) {
    const p = item.pricing as Record<string, number>;
    return `10x10: ${formatPrice(p['10x10'] || 0)} / A4: ${formatPrice(p['A4'] || 0)} / A3: ${formatPrice(p['A3'] || 0)}`;
  }
  const p = item.pricing as Record<string, { basePrice: number }>;
  return `10x10: ${formatPrice(p['10x10']?.basePrice || 0)}~ / A4: ${formatPrice(p['A4']?.basePrice || 0)}~ / A3: ${formatPrice(p['A3']?.basePrice || 0)}~`;
}

export default function PrintMethodsPage() {
  const { data: printMethods, error: swrError, mutate } = useSWR<PrintMethodRecord[]>('/api/admin/print-methods');
  const sorted = printMethods ? [...printMethods].sort((a, b) => a.sort_order - b.sort_order) : [];

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isEditing = form.id !== null;

  const handleFormToggle = () => {
    setFormOpen((prev) => !prev);
    setFormError(null);
    if (formOpen) setForm(emptyForm);
  };

  const handleEdit = (item: PrintMethodRecord) => {
    setForm({
      id: item.id,
      key: item.key,
      name: item.name,
      description: item.description ?? '',
      image_url: item.image_url ?? '',
      sort_order: item.sort_order,
      is_active: item.is_active,
      pricing: parsePricingToForm(item.pricing, item.key),
    });
    setFormOpen(true);
    setFormError(null);
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setUploading(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const result = await uploadFileToStorage(supabase, file, 'products', 'print-methods');
      if (!result.success || !result.url) {
        throw new Error(result.error || '이미지 업로드에 실패했습니다.');
      }
      setForm((prev) => ({ ...prev, image_url: result.url ?? '' }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const updatePricing = (field: keyof PricingFormState, value: string) => {
    setForm((prev) => ({ ...prev, pricing: { ...prev.pricing, [field]: value } }));
  };

  const handleSave = async () => {
    if (!form.key.trim() || !form.name.trim()) {
      setFormError('key와 name은 필수입니다.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const method = isEditing ? 'PATCH' : 'POST';
      const pricing = buildPricingFromForm(form);
      const body = isEditing
        ? { id: form.id, name: form.name, description: form.description || null, image_url: form.image_url || null, sort_order: form.sort_order, is_active: form.is_active, pricing }
        : { key: form.key, name: form.name, description: form.description || null, image_url: form.image_url || null, sort_order: form.sort_order, is_active: form.is_active, pricing };

      const res = await fetch('/api/admin/print-methods', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || '저장에 실패했습니다.');
      }

      await mutate();
      setForm(emptyForm);
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 인쇄 방식을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/admin/print-methods?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || '삭제에 실패했습니다.');
      }
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  };

  const handleToggleActive = async (item: PrintMethodRecord) => {
    const newActive = !item.is_active;
    if (!newActive && !window.confirm(`"${item.name}" 인쇄 방식을 비활성화하시겠습니까?`)) return;
    try {
      const res = await fetch('/api/admin/print-methods', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, is_active: newActive }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || '상태 변경에 실패했습니다.');
      }
      await mutate();
    } catch (err) {
      alert(err instanceof Error ? err.message : '상태 변경에 실패했습니다.');
    }
  };

  const showTransferPricing = isTransferMethod(form.key);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-900">인쇄 방식 관리</h1>
        <button
          onClick={handleFormToggle}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {formOpen ? '취소' : '추가'}
        </button>
      </div>

      {swrError && (
        <div className="p-3 mb-4 text-sm text-red-700 bg-red-50 rounded-md">
          데이터를 불러오지 못했습니다: {swrError.message}
        </div>
      )}

      {/* Form */}
      {formOpen && (
        <div className="p-4 mb-4 bg-white border border-gray-200 rounded-lg">
          <h2 className="text-sm font-semibold mb-3">{isEditing ? '인쇄 방식 수정' : '새 인쇄 방식 추가'}</h2>

          {formError && (
            <div className="p-2 mb-3 text-xs text-red-700 bg-red-50 rounded">{formError}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Key (고유 식별자)</label>
              <input
                type="text"
                value={form.key}
                onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
                disabled={isEditing}
                placeholder="예: dtf, embroidery"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">이름</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="예: DTF 전사"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">설명</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="인쇄 방식에 대한 간단한 설명"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">정렬 순서</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((prev) => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                활성화
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">이미지</label>
              <div className="flex items-start gap-3">
                {form.image_url ? (
                  <div className="relative w-20 h-20 rounded-md overflow-hidden border border-gray-200 flex-shrink-0">
                    <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setForm((prev) => ({ ...prev, image_url: '' }))}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 text-white rounded-full hover:bg-black/70"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 flex-shrink-0">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={form.image_url}
                    onChange={(e) => setForm((prev) => ({ ...prev, image_url: e.target.value }))}
                    placeholder="이미지 URL (https://...)"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 cursor-pointer transition-colors">
                    {uploading ? '업로드 중...' : '파일 업로드'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Pricing Section */}
            <div className="sm:col-span-2 border-t pt-3 mt-1">
              <p className="text-xs font-semibold text-gray-700 mb-2">
                가격 설정 {form.key && <span className="font-normal text-gray-400">({showTransferPricing ? '전사 - 사이즈별 단가' : '벌크 - 기본가 + 추가단가'})</span>}
              </p>

              {showTransferPricing ? (
                <div className="grid grid-cols-3 gap-3">
                  {(['10x10', 'A4', 'A3'] as const).map((size) => (
                    <div key={size}>
                      <label className="block text-[10px] text-gray-500 mb-0.5">{size}</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={form.pricing[`price_${size}` as keyof PricingFormState]}
                          onChange={(e) => updatePricing(`price_${size}` as keyof PricingFormState, e.target.value)}
                          placeholder="0"
                          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md pr-8"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {(['10x10', 'A4', 'A3'] as const).map((size) => (
                    <div key={size} className="grid grid-cols-[60px_1fr_1fr_1fr] gap-2 items-end">
                      <span className="text-[10px] font-medium text-gray-500 pb-1.5">{size}</span>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-0.5">기본가(원)</label>
                        <input
                          type="number"
                          value={form.pricing[`bulk_basePrice_${size}` as keyof PricingFormState]}
                          onChange={(e) => updatePricing(`bulk_basePrice_${size}` as keyof PricingFormState, e.target.value)}
                          placeholder="60000"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-0.5">기본수량</label>
                        <input
                          type="number"
                          value={form.pricing[`bulk_baseQuantity_${size}` as keyof PricingFormState]}
                          onChange={(e) => updatePricing(`bulk_baseQuantity_${size}` as keyof PricingFormState, e.target.value)}
                          placeholder="100"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-0.5">추가단가(원)</label>
                        <input
                          type="number"
                          value={form.pricing[`bulk_additionalPrice_${size}` as keyof PricingFormState]}
                          onChange={(e) => updatePricing(`bulk_additionalPrice_${size}` as keyof PricingFormState, e.target.value)}
                          placeholder="600"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={handleFormToggle}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '저장 중...' : isEditing ? '수정' : '추가'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {!printMethods ? (
        <div className="text-sm text-gray-500 text-center py-8">로딩 중...</div>
      ) : sorted.length === 0 ? (
        <div className="text-sm text-gray-500 text-center py-8">등록된 인쇄 방식이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 bg-white border rounded-lg ${
                !item.is_active ? 'opacity-50' : ''
              }`}
            >
              <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />

              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-12 h-12 rounded-md object-cover border border-gray-200 flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-md border border-gray-200 flex items-center justify-center text-gray-300 flex-shrink-0">
                  <ImageIcon className="w-5 h-5" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{item.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">
                    {item.key}
                  </span>
                  {!item.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded">비활성</span>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>
                )}
                {item.pricing && (
                  <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{getPricingSummary(item)}</p>
                )}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleToggleActive(item)}
                  className={`px-2 py-1 text-[11px] rounded transition-colors ${
                    item.is_active
                      ? 'text-orange-600 hover:bg-orange-50'
                      : 'text-green-600 hover:bg-green-50'
                  }`}
                >
                  {item.is_active ? '비활성화' : '활성화'}
                </button>
                <button
                  onClick={() => handleEdit(item)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
