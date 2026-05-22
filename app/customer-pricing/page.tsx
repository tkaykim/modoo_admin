'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import type {
  CustomerPrintMethodPricing,
  FactoryPricingModel,
  PrintMethodRecord,
} from '@/types/types';
import { SUGGESTED_SIZE_LABELS, parseSizeLabelToCm } from '@/lib/factoryPricing';
import { DollarSign, AlertCircle, Plus, Trash2, Save, Pencil, Eye, Printer } from 'lucide-react';

interface RowDraft {
  tempId: string;
  size: string;
  max_width_cm: string;
  max_height_cm: string;
  pricing_model: FactoryPricingModel;
  unit_price: string;
  base_price: string;
  base_quantity: string;
  additional_price_per_piece: string;
}

const newTempId = () => `t_${Math.random().toString(36).slice(2, 10)}`;

const BULK_METHOD_KEYS = new Set(['screen_printing', 'embroidery', 'applique']);

const defaultModelForKey = (key: string): FactoryPricingModel =>
  BULK_METHOD_KEYS.has(key) ? 'bulk' : 'flat';

const emptyRow = (model: FactoryPricingModel): RowDraft => ({
  tempId: newTempId(),
  size: '',
  max_width_cm: '',
  max_height_cm: '',
  pricing_model: model,
  unit_price: '',
  base_price: '',
  base_quantity: '100',
  additional_price_per_piece: '',
});

const rowFromDb = (r: CustomerPrintMethodPricing): RowDraft => ({
  tempId: r.id,
  size: r.size,
  max_width_cm: r.max_width_cm !== null ? String(r.max_width_cm) : '',
  max_height_cm: r.max_height_cm !== null ? String(r.max_height_cm) : '',
  pricing_model: r.pricing_model,
  unit_price: r.unit_price !== null ? String(r.unit_price) : '',
  base_price: r.base_price !== null ? String(r.base_price) : '',
  base_quantity: r.base_quantity !== null ? String(r.base_quantity) : '100',
  additional_price_per_piece:
    r.additional_price_per_piece !== null ? String(r.additional_price_per_piece) : '',
});

export default function CustomerPricingPage() {
  const authStatus = useAuthStore((s) => s.authStatus);
  const [methods, setMethods] = useState<PrintMethodRecord[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // 1) Load all active+inactive print methods on mount
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/print-methods');
        if (!res.ok) throw new Error('인쇄 방식 목록을 불러오지 못했습니다.');
        const payload = await res.json();
        const list = ((payload.data || []) as PrintMethodRecord[]).sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        );
        if (cancelled) return;
        setMethods(list);
        if (!selectedMethodId && list.length > 0) setSelectedMethodId(list[0].id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '불러오기 실패');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  // 2) Load pricing rows whenever selected method changes
  useEffect(() => {
    if (!selectedMethodId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/admin/customer-print-pricing?print_method_id=${selectedMethodId}`
        );
        if (!res.ok) throw new Error('단가 조회 실패');
        const payload = await res.json();
        const drafts = ((payload.data || []) as CustomerPrintMethodPricing[]).map(rowFromDb);
        if (cancelled) return;
        setRows(drafts);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '단가 조회 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMethodId, reloadKey]);

  const selectedMethod = useMemo(
    () => methods.find((m) => m.id === selectedMethodId) || null,
    [methods, selectedMethodId]
  );

  const updateRow = (tempId: string, patch: Partial<RowDraft>) => {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    const model = selectedMethod ? defaultModelForKey(selectedMethod.key) : 'flat';
    setRows((prev) => [...prev, emptyRow(model)]);
  };

  const removeRow = (tempId: string) => {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const autofillDims = (tempId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const parsed = parseSizeLabelToCm(r.size);
        if (!parsed) return r;
        return {
          ...r,
          max_width_cm: r.max_width_cm === '' ? String(parsed.width) : r.max_width_cm,
          max_height_cm: r.max_height_cm === '' ? String(parsed.height) : r.max_height_cm,
        };
      })
    );
  };

  const handleSave = async () => {
    if (!selectedMethodId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = rows.map((r) => {
        const base = {
          size: r.size.trim(),
          max_width_cm: r.max_width_cm === '' ? null : Number(r.max_width_cm),
          max_height_cm: r.max_height_cm === '' ? null : Number(r.max_height_cm),
          pricing_model: r.pricing_model,
          is_active: true,
        };
        if (r.pricing_model === 'flat') {
          return {
            ...base,
            unit_price: r.unit_price === '' ? null : Number(r.unit_price),
            base_price: null,
            base_quantity: null,
            additional_price_per_piece: null,
          };
        }
        return {
          ...base,
          unit_price: null,
          base_price: r.base_price === '' ? null : Number(r.base_price),
          base_quantity: r.base_quantity === '' ? null : Number(r.base_quantity),
          additional_price_per_piece:
            r.additional_price_per_piece === '' ? null : Number(r.additional_price_per_piece),
        };
      });

      const res = await fetch('/api/admin/customer-print-pricing/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ print_method_id: selectedMethodId, rows: payload }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '저장 실패');
      }
      setEditMode(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const readOnly = !editMode;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-blue-600" />
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">고객가 단가표</h1>
          <span
            className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
              editMode ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {editMode ? (
              <>
                <Pencil className="w-3 h-3" /> 수정 모드
              </>
            ) : (
              <>
                <Eye className="w-3 h-3" /> 보기 모드
              </>
            )}
          </span>
        </div>
        {!loading &&
          (editMode ? (
            <button
              onClick={() => {
                setEditMode(false);
                setReloadKey((k) => k + 1);
              }}
              disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              <Eye className="w-4 h-4" /> 보기 모드로
            </button>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
            >
              <Pencil className="w-4 h-4" /> 수정
            </button>
          ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800 flex gap-2 mb-4">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          여기서 설정하는 단가는 <b>고객 노출가</b>입니다. 사이즈별 가로/세로(cm)를 함께 입력하면
          추후 아트워크 크기에 따라 자동 매칭됩니다(A4 = 21×29.7cm, A3 = 29.7×42cm, 회전 허용).
          현재 modoo_app 에디터는 기존 <b>인쇄 방식 관리(JSON)</b> 페이지를 사용하므로, 이 단가표
          변경이 즉시 고객에 노출되지는 않습니다. 추후 에디터 업그레이드 후 전환 예정.
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Method tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4 border-b border-gray-200 pb-2">
        {methods.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              if (editMode) {
                // Discard edits when switching tab
                setEditMode(false);
                setReloadKey((k) => k + 1);
              }
              setSelectedMethodId(m.id);
            }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              selectedMethodId === m.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Printer className="w-3 h-3 inline mr-1" />
            {m.name}
            {!m.is_active && (
              <span className="ml-1 text-[9px] opacity-70">(비활성)</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !selectedMethod ? (
        <p className="text-sm text-gray-500">인쇄 방식을 선택해주세요.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{selectedMethod.name}</span>
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                {defaultModelForKey(selectedMethod.key) === 'flat' ? 'flat (단가)' : 'bulk (기본+추가)'}
              </span>
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50 rounded-md"
              >
                <Plus className="w-3.5 h-3.5" /> 사이즈 추가
              </button>
            )}
          </div>

          <div className="p-3 space-y-2">
            <div className="grid grid-cols-12 gap-2 text-[10px] text-gray-500 px-1">
              <div className="col-span-2">사이즈 라벨</div>
              <div className="col-span-1">가로(cm)</div>
              <div className="col-span-1">세로(cm)</div>
              <div className="col-span-2">단가 모델</div>
              <div className="col-span-5">가격</div>
              <div className="col-span-1"></div>
            </div>

            {rows.length === 0 && (
              <p className="text-xs text-gray-400 px-1 py-4 text-center">
                등록된 사이즈가 없습니다.
              </p>
            )}

            {rows.map((row) => (
              <div key={row.tempId} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-2">
                  <input
                    list="customer-pricing-size-suggestions"
                    value={row.size}
                    onChange={(e) => updateRow(row.tempId, { size: e.target.value })}
                    onBlur={() => autofillDims(row.tempId)}
                    placeholder="A4"
                    disabled={readOnly}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={row.max_width_cm}
                    onChange={(e) => updateRow(row.tempId, { max_width_cm: e.target.value })}
                    placeholder="cm"
                    disabled={readOnly}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={row.max_height_cm}
                    onChange={(e) => updateRow(row.tempId, { max_height_cm: e.target.value })}
                    placeholder="cm"
                    disabled={readOnly}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                  />
                </div>
                <div className="col-span-2">
                  <select
                    value={row.pricing_model}
                    onChange={(e) =>
                      updateRow(row.tempId, { pricing_model: e.target.value as FactoryPricingModel })
                    }
                    disabled={readOnly}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                  >
                    <option value="flat">flat (개당)</option>
                    <option value="bulk">bulk (기본+추가)</option>
                  </select>
                </div>

                {row.pricing_model === 'flat' ? (
                  <div className="col-span-5">
                    <input
                      type="number"
                      min="0"
                      value={row.unit_price}
                      onChange={(e) => updateRow(row.tempId, { unit_price: e.target.value })}
                      placeholder="개당 단가 (원)"
                      disabled={readOnly}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                    />
                  </div>
                ) : (
                  <div className="col-span-5 grid grid-cols-3 gap-1">
                    <input
                      type="number"
                      min="0"
                      value={row.base_price}
                      onChange={(e) => updateRow(row.tempId, { base_price: e.target.value })}
                      placeholder="기본가"
                      disabled={readOnly}
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                    />
                    <input
                      type="number"
                      min="1"
                      value={row.base_quantity}
                      onChange={(e) => updateRow(row.tempId, { base_quantity: e.target.value })}
                      placeholder="기본수량"
                      disabled={readOnly}
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                    />
                    <input
                      type="number"
                      min="0"
                      value={row.additional_price_per_piece}
                      onChange={(e) =>
                        updateRow(row.tempId, { additional_price_per_piece: e.target.value })
                      }
                      placeholder="추가/개"
                      disabled={readOnly}
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                    />
                  </div>
                )}

                <div className="col-span-1 flex justify-end">
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.tempId)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-md"
                      title="이 사이즈 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <datalist id="customer-pricing-size-suggestions">
              {SUGGESTED_SIZE_LABELS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {!readOnly && (
            <div className="bg-white border-t border-gray-200 px-4 py-3 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
