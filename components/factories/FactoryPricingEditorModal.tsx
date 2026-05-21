'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, DollarSign, AlertCircle, Save } from 'lucide-react';
import type {
  Factory,
  FactoryPricingModel,
  FactoryPrintMethodPricing,
  PrintMethodRecord,
  PrintSize,
} from '@/types/types';
import { FACTORY_PRINT_SIZES } from '@/lib/factoryPricing';

interface Props {
  factory: Factory;
  onClose: () => void;
  onSaved?: () => void;
}

interface RowDraft {
  print_method_id: string;
  size: PrintSize;
  enabled: boolean;
  pricing_model: FactoryPricingModel;
  unit_price: string;
  base_price: string;
  base_quantity: string;
  additional_price_per_piece: string;
}

const emptyRow = (
  print_method_id: string,
  size: PrintSize,
  pricing_model: FactoryPricingModel
): RowDraft => ({
  print_method_id,
  size,
  enabled: false,
  pricing_model,
  unit_price: '',
  base_price: '',
  base_quantity: '100',
  additional_price_per_piece: '',
});

// Bulk methods (base + additional) vs flat methods (per-unit).
// Mirrors the global print_methods.pricing shape.
const BULK_METHOD_KEYS = new Set(['screen_printing', 'embroidery', 'applique']);

function inferModelFromKey(key: string): FactoryPricingModel {
  return BULK_METHOD_KEYS.has(key) ? 'bulk' : 'flat';
}

interface GlobalSizePrice {
  flatUnit?: number;
  bulkBase?: number;
  bulkBaseQty?: number;
  bulkAdditional?: number;
}

function extractGlobalSizePrice(
  method: PrintMethodRecord | undefined,
  size: PrintSize
): GlobalSizePrice {
  if (!method?.pricing) return {};
  const raw = (method.pricing as Record<string, unknown>)[size];
  if (raw === undefined || raw === null) return {};
  if (typeof raw === 'number') return { flatUnit: raw };
  if (typeof raw === 'object') {
    const obj = raw as { basePrice?: number; baseQuantity?: number; additionalPricePerPiece?: number };
    return {
      bulkBase: obj.basePrice,
      bulkBaseQty: obj.baseQuantity,
      bulkAdditional: obj.additionalPricePerPiece,
    };
  }
  return {};
}

export default function FactoryPricingEditorModal({ factory, onClose, onSaved }: Props) {
  const [methods, setMethods] = useState<PrintMethodRecord[]>([]);
  const [rowsByKey, setRowsByKey] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rowKey = (print_method_id: string, size: PrintSize) => `${print_method_id}|${size}`;

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
        // Include inactive methods too so admins can pre-configure pricing
        // before flipping is_active=true (e.g. dtp/sublimation pre-launch).
        const fetchedMethods: PrintMethodRecord[] = methodsPayload.data || [];
        const fetchedRows: FactoryPrintMethodPricing[] = pricingPayload.data || [];

        if (cancelled) return;

        const drafts: Record<string, RowDraft> = {};
        for (const method of fetchedMethods) {
          const model = inferModelFromKey(method.key);
          for (const size of FACTORY_PRINT_SIZES) {
            drafts[rowKey(method.id, size)] = emptyRow(method.id, size, model);
          }
        }
        for (const row of fetchedRows) {
          const key = rowKey(row.print_method_id, row.size);
          if (!drafts[key]) continue;
          drafts[key] = {
            print_method_id: row.print_method_id,
            size: row.size,
            enabled: row.is_active,
            pricing_model: row.pricing_model,
            unit_price: row.unit_price !== null ? String(row.unit_price) : '',
            base_price: row.base_price !== null ? String(row.base_price) : '',
            base_quantity: row.base_quantity !== null ? String(row.base_quantity) : '100',
            additional_price_per_piece:
              row.additional_price_per_piece !== null ? String(row.additional_price_per_piece) : '',
          };
        }

        setMethods(fetchedMethods);
        setRowsByKey(drafts);
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

  const updateRow = (key: string, patch: Partial<RowDraft>) => {
    setRowsByKey((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const toggleMethod = (methodId: string, enabled: boolean) => {
    setRowsByKey((prev) => {
      const next = { ...prev };
      for (const size of FACTORY_PRINT_SIZES) {
        const k = rowKey(methodId, size);
        if (next[k]) next[k] = { ...next[k], enabled };
      }
      return next;
    });
  };

  const methodEnabled = (methodId: string) =>
    FACTORY_PRINT_SIZES.some((size) => rowsByKey[rowKey(methodId, size)]?.enabled);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const rows = Object.values(rowsByKey)
        .filter((r) => r.enabled)
        .map((r) => {
          const base = {
            print_method_id: r.print_method_id,
            size: r.size,
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
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
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
              여기서 설정하는 단가는 <b>공장에 지급하는 금액</b>입니다. 고객 노출 단가는
              인쇄가격표에서 별도로 관리합니다. 각 기법별로 체크하면 해당 공장이 그 기법을
              취급하는 것으로 간주됩니다.
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
                const enabled = methodEnabled(method.id);
                const model = inferModelFromKey(method.key);
                return (
                  <div
                    key={method.id}
                    className={`border rounded-lg overflow-hidden ${enabled ? 'border-emerald-300' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => toggleMethod(method.id, e.target.checked)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium text-gray-900">{method.name}</span>
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                          {model === 'flat' ? 'flat (단가)' : 'bulk (기본+추가)'}
                        </span>
                        {!method.is_active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            비활성 (고객 미노출)
                          </span>
                        )}
                      </label>
                    </div>

                    {enabled && (
                      <div className="p-3 space-y-2">
                        {FACTORY_PRINT_SIZES.map((size) => {
                          const key = rowKey(method.id, size);
                          const row = rowsByKey[key];
                          if (!row) return null;
                          const placeholder = extractGlobalSizePrice(method, size);

                          return (
                            <div key={key} className="grid grid-cols-12 items-center gap-2">
                              <div className="col-span-2 text-xs font-medium text-gray-700">
                                {size}
                              </div>

                              {model === 'flat' ? (
                                <div className="col-span-10">
                                  <label className="block text-[10px] text-gray-500 mb-0.5">
                                    단가 (원/개)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={row.unit_price}
                                    onChange={(e) =>
                                      updateRow(key, { unit_price: e.target.value })
                                    }
                                    placeholder={
                                      placeholder.flatUnit !== undefined
                                        ? `고객가 ${placeholder.flatUnit.toLocaleString()}`
                                        : '0'
                                    }
                                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm"
                                  />
                                </div>
                              ) : (
                                <>
                                  <div className="col-span-4">
                                    <label className="block text-[10px] text-gray-500 mb-0.5">
                                      기본가
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={row.base_price}
                                      onChange={(e) =>
                                        updateRow(key, { base_price: e.target.value })
                                      }
                                      placeholder={
                                        placeholder.bulkBase !== undefined
                                          ? `고객가 ${placeholder.bulkBase.toLocaleString()}`
                                          : '0'
                                      }
                                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm"
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <label className="block text-[10px] text-gray-500 mb-0.5">
                                      기본수량
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={row.base_quantity}
                                      onChange={(e) =>
                                        updateRow(key, { base_quantity: e.target.value })
                                      }
                                      placeholder={
                                        placeholder.bulkBaseQty
                                          ? String(placeholder.bulkBaseQty)
                                          : '100'
                                      }
                                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm"
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <label className="block text-[10px] text-gray-500 mb-0.5">
                                      추가 단가/개
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={row.additional_price_per_piece}
                                      onChange={(e) =>
                                        updateRow(key, {
                                          additional_price_per_piece: e.target.value,
                                        })
                                      }
                                      placeholder={
                                        placeholder.bulkAdditional !== undefined
                                          ? `고객가 ${placeholder.bulkAdditional.toLocaleString()}`
                                          : '0'
                                      }
                                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm"
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
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
