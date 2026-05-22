'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, DollarSign, AlertCircle, Save, Plus, Trash2 } from 'lucide-react';
import type {
  Factory,
  FactoryPricingModel,
  FactoryPrintMethodPricing,
  PrintMethodRecord,
} from '@/types/types';
import { SUGGESTED_SIZE_LABELS, parseSizeLabelToCm } from '@/lib/factoryPricing';

interface Props {
  factory: Factory;
  onClose: () => void;
  onSaved?: () => void;
}

// In-memory draft row — every value is a string so empty inputs work cleanly.
interface RowDraft {
  tempId: string; // local identity for React keys (DB id once saved)
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

const emptyFlatRow = (): RowDraft => ({
  tempId: newTempId(),
  size: '',
  max_width_cm: '',
  max_height_cm: '',
  pricing_model: 'flat',
  unit_price: '',
  base_price: '',
  base_quantity: '100',
  additional_price_per_piece: '',
});

const emptyBulkRow = (): RowDraft => ({
  ...emptyFlatRow(),
  pricing_model: 'bulk',
});

const BULK_METHOD_KEYS = new Set(['screen_printing', 'embroidery', 'applique']);

function defaultModelForMethodKey(key: string): FactoryPricingModel {
  return BULK_METHOD_KEYS.has(key) ? 'bulk' : 'flat';
}

function rowFromDb(r: FactoryPrintMethodPricing): RowDraft {
  return {
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
  };
}

export default function FactoryPricingEditorModal({ factory, onClose, onSaved }: Props) {
  const [methods, setMethods] = useState<PrintMethodRecord[]>([]);
  // print_method_id -> { enabled, rows[] }
  const [rowsByMethod, setRowsByMethod] = useState<Record<string, { enabled: boolean; rows: RowDraft[] }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [methodsRes, pricingRes] = await Promise.all([
          fetch('/api/admin/print-methods'),
          fetch(`/api/admin/factory-print-pricing?factory_id=${factory.id}`),
        ]);
        if (!methodsRes.ok) throw new Error('인쇄기법 목록을 불러오지 못했습니다.');
        if (!pricingRes.ok) throw new Error('공장 단가를 불러오지 못했습니다.');
        const methodsPayload = await methodsRes.json();
        const pricingPayload = await pricingRes.json();

        // Include inactive methods so admin can pre-configure pricing
        // (e.g. dtp/sublimation before going live).
        const fetchedMethods: PrintMethodRecord[] = methodsPayload.data || [];
        const fetchedRows: FactoryPrintMethodPricing[] = pricingPayload.data || [];

        if (cancelled) return;

        const next: Record<string, { enabled: boolean; rows: RowDraft[] }> = {};
        for (const m of fetchedMethods) {
          next[m.id] = { enabled: false, rows: [] };
        }
        for (const r of fetchedRows) {
          if (!next[r.print_method_id]) continue;
          next[r.print_method_id].enabled = true;
          next[r.print_method_id].rows.push(rowFromDb(r));
        }

        setMethods(fetchedMethods);
        setRowsByMethod(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '불러오기에 실패했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [factory.id]);

  const toggleMethod = (method: PrintMethodRecord, enabled: boolean) => {
    setRowsByMethod((prev) => {
      const current = prev[method.id] ?? { enabled: false, rows: [] };
      if (enabled && current.rows.length === 0) {
        const model = defaultModelForMethodKey(method.key);
        return {
          ...prev,
          [method.id]: { enabled: true, rows: [model === 'bulk' ? emptyBulkRow() : emptyFlatRow()] },
        };
      }
      return { ...prev, [method.id]: { ...current, enabled } };
    });
  };

  const updateRow = (methodId: string, tempId: string, patch: Partial<RowDraft>) => {
    setRowsByMethod((prev) => {
      const m = prev[methodId];
      if (!m) return prev;
      return {
        ...prev,
        [methodId]: {
          ...m,
          rows: m.rows.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)),
        },
      };
    });
  };

  const addRow = (methodId: string) => {
    setRowsByMethod((prev) => {
      const m = prev[methodId];
      if (!m) return prev;
      const last = m.rows[m.rows.length - 1];
      const seed = last
        ? { ...last, tempId: newTempId(), size: '', max_width_cm: '', max_height_cm: '' }
        : (defaultModelForMethodKey(methods.find((x) => x.id === methodId)?.key ?? '') === 'bulk'
          ? emptyBulkRow()
          : emptyFlatRow());
      return { ...prev, [methodId]: { ...m, rows: [...m.rows, seed] } };
    });
  };

  const removeRow = (methodId: string, tempId: string) => {
    setRowsByMethod((prev) => {
      const m = prev[methodId];
      if (!m) return prev;
      return { ...prev, [methodId]: { ...m, rows: m.rows.filter((r) => r.tempId !== tempId) } };
    });
  };

  /** Auto-fill width/height from size label like "25x25" */
  const autofillDims = (methodId: string, tempId: string) => {
    setRowsByMethod((prev) => {
      const m = prev[methodId];
      if (!m) return prev;
      return {
        ...prev,
        [methodId]: {
          ...m,
          rows: m.rows.map((r) => {
            if (r.tempId !== tempId) return r;
            const parsed = parseSizeLabelToCm(r.size);
            if (!parsed) return r;
            return {
              ...r,
              max_width_cm: r.max_width_cm === '' ? String(parsed.width) : r.max_width_cm,
              max_height_cm: r.max_height_cm === '' ? String(parsed.height) : r.max_height_cm,
            };
          }),
        },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const rows: Array<Record<string, unknown>> = [];
      for (const m of methods) {
        const bucket = rowsByMethod[m.id];
        if (!bucket || !bucket.enabled) continue;
        for (const r of bucket.rows) {
          if (!r.size.trim()) {
            throw new Error(`${m.name}: 사이즈 라벨을 입력해주세요.`);
          }
          const base = {
            print_method_id: m.id,
            size: r.size.trim(),
            max_width_cm: r.max_width_cm === '' ? null : Number(r.max_width_cm),
            max_height_cm: r.max_height_cm === '' ? null : Number(r.max_height_cm),
            pricing_model: r.pricing_model,
            is_active: true,
          };
          if (r.pricing_model === 'flat') {
            rows.push({
              ...base,
              unit_price: r.unit_price === '' ? null : Number(r.unit_price),
              base_price: null,
              base_quantity: null,
              additional_price_per_piece: null,
            });
          } else {
            rows.push({
              ...base,
              unit_price: null,
              base_price: r.base_price === '' ? null : Number(r.base_price),
              base_quantity: r.base_quantity === '' ? null : Number(r.base_quantity),
              additional_price_per_piece:
                r.additional_price_per_piece === '' ? null : Number(r.additional_price_per_piece),
            });
          }
        }
      }

      const res = await fetch('/api/admin/factory-print-pricing/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factory_id: factory.id, rows }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || '저장에 실패했습니다.');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const sortedMethods = useMemo(
    () => [...methods].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [methods]
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              공장 단가표 — {factory.name}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              여기서 설정하는 단가는 <b>공장에 지급하는 금액</b>입니다. 사이즈는 자유 라벨이며,
              <b> 가로/세로(cm)</b>를 함께 입력하면 추후 아트워크 크기에 따라 자동 매칭됩니다.
              flat = 개당 단가, bulk = 기본가 + 초과 단가/개.
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sortedMethods.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">활성 인쇄기법이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {sortedMethods.map((method) => {
                const bucket = rowsByMethod[method.id] ?? { enabled: false, rows: [] };
                return (
                  <div
                    key={method.id}
                    className={`border rounded-lg overflow-hidden ${bucket.enabled ? 'border-emerald-300' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bucket.enabled}
                          onChange={(e) => toggleMethod(method, e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium text-gray-900">{method.name}</span>
                        {!method.is_active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            비활성 (고객 미노출)
                          </span>
                        )}
                      </label>
                      {bucket.enabled && (
                        <button
                          type="button"
                          onClick={() => addRow(method.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50 rounded-md"
                        >
                          <Plus className="w-3.5 h-3.5" /> 사이즈 추가
                        </button>
                      )}
                    </div>

                    {bucket.enabled && (
                      <div className="p-3 space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] text-gray-500 px-1">
                          <div className="col-span-2">사이즈 라벨</div>
                          <div className="col-span-1">가로(cm)</div>
                          <div className="col-span-1">세로(cm)</div>
                          <div className="col-span-2">단가 모델</div>
                          <div className="col-span-5">가격</div>
                          <div className="col-span-1"></div>
                        </div>

                        {bucket.rows.length === 0 && (
                          <p className="text-xs text-gray-400 px-1">사이즈 행이 없습니다.</p>
                        )}

                        {bucket.rows.map((row) => (
                          <div key={row.tempId} className="grid grid-cols-12 gap-2 items-start">
                            <div className="col-span-2">
                              <input
                                list="factory-pricing-size-suggestions"
                                value={row.size}
                                onChange={(e) =>
                                  updateRow(method.id, row.tempId, { size: e.target.value })
                                }
                                onBlur={() => autofillDims(method.id, row.tempId)}
                                placeholder="25x25"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                              />
                            </div>
                            <div className="col-span-1">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={row.max_width_cm}
                                onChange={(e) =>
                                  updateRow(method.id, row.tempId, { max_width_cm: e.target.value })
                                }
                                placeholder="cm"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                              />
                            </div>
                            <div className="col-span-1">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={row.max_height_cm}
                                onChange={(e) =>
                                  updateRow(method.id, row.tempId, { max_height_cm: e.target.value })
                                }
                                placeholder="cm"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                              />
                            </div>
                            <div className="col-span-2">
                              <select
                                value={row.pricing_model}
                                onChange={(e) =>
                                  updateRow(method.id, row.tempId, {
                                    pricing_model: e.target.value as FactoryPricingModel,
                                  })
                                }
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
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
                                  onChange={(e) =>
                                    updateRow(method.id, row.tempId, { unit_price: e.target.value })
                                  }
                                  placeholder="개당 단가 (원)"
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                                />
                              </div>
                            ) : (
                              <div className="col-span-5 grid grid-cols-3 gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.base_price}
                                  onChange={(e) =>
                                    updateRow(method.id, row.tempId, { base_price: e.target.value })
                                  }
                                  placeholder="기본가"
                                  className="px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                                />
                                <input
                                  type="number"
                                  min="1"
                                  value={row.base_quantity}
                                  onChange={(e) =>
                                    updateRow(method.id, row.tempId, {
                                      base_quantity: e.target.value,
                                    })
                                  }
                                  placeholder="기본수량"
                                  className="px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  value={row.additional_price_per_piece}
                                  onChange={(e) =>
                                    updateRow(method.id, row.tempId, {
                                      additional_price_per_piece: e.target.value,
                                    })
                                  }
                                  placeholder="추가/개"
                                  className="px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                                />
                              </div>
                            )}

                            <div className="col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => removeRow(method.id, row.tempId)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-md"
                                title="이 사이즈 삭제"
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
              })}

              <datalist id="factory-pricing-size-suggestions">
                {SUGGESTED_SIZE_LABELS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
