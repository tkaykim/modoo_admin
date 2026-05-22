'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  X, Plus, Trash2, Save, AlertCircle, DollarSign,
} from 'lucide-react';
import type {
  FactoryPrintMethodPricing,
  OrderItemArtwork,
} from '@/types/types';

interface Props {
  orderItemId: string;
  orderItemTitle: string;
  itemQuantity: number;
  /** assigned_manufacturer_id — 모달 단위 단일 공장 */
  factoryId: string | null;
  onClose: () => void;
  onSaved?: () => void;
  /**
   * 'admin' (default): 전체 행 CRUD
   * 'factory': 단가만 조정, 행 추가/삭제 불가, 기법·사이즈 readonly
   */
  mode?: 'admin' | 'factory';
  endpoints?: {
    /** GET 행 목록 */
    listUrl?: string;
    /** POST/PATCH/DELETE 행 */
    mutationUrl?: string;
    /** GET 공장 단가표 옵션 */
    factoryPricingUrl?: string;
  };
}

interface RowDraft {
  tempId: string;
  dbId: string | null;
  print_method_id: string;
  size_label: string;
  /** factory_print_method_pricing.id — 어느 단가 행을 선택했는지 */
  factory_pricing_row_id: string | null;
  applied_quantity: string;
  /** 자동 채움된 기본 단가 (사용자가 수정 가능) */
  factory_unit_price: string;
  /** 추가금액 (예: 단면 28cm 이상 가산) */
  additional_amount: string;
  /** 최종 합계 (자동 = unit × qty + additional, 사용자 override 가능) */
  factory_total: string;
  factory_cost_source: '' | 'auto_match' | 'manual' | 'negotiated' | 'override';
  /** 사용자가 합계를 수기로 만진 적이 있는지 (override 추적용) */
  totalManuallyEdited: boolean;
}

const newTempId = () => `t_${Math.random().toString(36).slice(2, 10)}`;

const blankRow = (defaults: { applied_quantity?: number } = {}): RowDraft => ({
  tempId: newTempId(),
  dbId: null,
  print_method_id: '',
  size_label: '',
  factory_pricing_row_id: null,
  applied_quantity: defaults.applied_quantity ? String(defaults.applied_quantity) : '',
  factory_unit_price: '',
  additional_amount: '',
  factory_total: '',
  factory_cost_source: '',
  totalManuallyEdited: false,
});

const rowFromDb = (a: OrderItemArtwork & { additional_amount?: number | null }): RowDraft => ({
  tempId: a.id,
  dbId: a.id,
  print_method_id: a.print_method_id ?? '',
  size_label: a.size_label ?? '',
  factory_pricing_row_id: a.factory_pricing_row_id,
  applied_quantity: a.applied_quantity !== null ? String(a.applied_quantity) : '',
  factory_unit_price: a.factory_unit_price !== null ? String(a.factory_unit_price) : '',
  additional_amount:
    a.additional_amount !== null && a.additional_amount !== undefined
      ? String(a.additional_amount)
      : '',
  factory_total: a.factory_total !== null ? String(a.factory_total) : '',
  factory_cost_source: (a.factory_cost_source as RowDraft['factory_cost_source']) ?? '',
  totalManuallyEdited: false,
});

/**
 * Calculate factory_total from pricing row + quantity + additional_amount.
 * - flat: unit_price × qty
 * - bulk: base_price + max(0, qty - base_quantity) × additional_price_per_piece
 * Then add additional_amount.
 */
function computeFactoryTotal(
  row: Pick<
    FactoryPrintMethodPricing,
    'pricing_model' | 'unit_price' | 'base_price' | 'base_quantity' | 'additional_price_per_piece'
  > | null,
  quantity: number,
  additional: number
): number | null {
  if (!row) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  let base: number | null = null;
  if (row.pricing_model === 'flat') {
    if (row.unit_price === null || row.unit_price === undefined) return null;
    base = row.unit_price * quantity;
  } else if (row.pricing_model === 'bulk') {
    if (
      row.base_price === null || row.base_price === undefined ||
      row.base_quantity === null || row.base_quantity === undefined ||
      row.additional_price_per_piece === null || row.additional_price_per_piece === undefined
    ) return null;
    const extra = Math.max(0, quantity - row.base_quantity);
    base = row.base_price + extra * row.additional_price_per_piece;
  }
  if (base === null) return null;
  return Math.round(base + (Number.isFinite(additional) ? additional : 0));
}

function computeUnitPriceDisplay(
  row: Pick<FactoryPrintMethodPricing, 'pricing_model' | 'unit_price'> | null
): number | null {
  if (!row) return null;
  if (row.pricing_model === 'flat' && row.unit_price !== null && row.unit_price !== undefined) {
    return row.unit_price;
  }
  // bulk은 단가/개 단순 표시 불가 (수량에 따라 변동) → null 반환, UI에서 안 보이도록
  return null;
}

export default function OrderItemArtworksModal({
  orderItemId,
  orderItemTitle,
  itemQuantity,
  factoryId,
  onClose,
  onSaved,
  mode = 'admin',
  endpoints,
}: Props) {
  const isFactoryMode = mode === 'factory';

  const listUrl = endpoints?.listUrl ?? `/api/admin/order-items/${orderItemId}/artworks`;
  const mutationUrl = endpoints?.mutationUrl ?? `/api/admin/order-items/${orderItemId}/artworks`;
  // Factory pricing options:
  //  - admin mode: /api/admin/factory-print-pricing?factory_id=... (existing endpoint)
  //  - factory mode: caller must pass endpoints.factoryPricingUrl
  const factoryPricingUrl =
    endpoints?.factoryPricingUrl ??
    (factoryId
      ? `/api/admin/factory-print-pricing?factory_id=${factoryId}`
      : null);

  const [pricingRows, setPricingRows] = useState<FactoryPrintMethodPricing[]>([]);
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const fetches: Promise<Response>[] = [fetch(listUrl)];
        if (factoryPricingUrl) fetches.push(fetch(factoryPricingUrl));
        const responses = await Promise.all(fetches);
        const [artRes, pricingRes] = responses;

        if (!artRes.ok) throw new Error('작업 항목 목록 로드 실패');
        const artPayload = await artRes.json();

        let fetchedPricing: FactoryPrintMethodPricing[] = [];
        if (pricingRes) {
          if (!pricingRes.ok) {
            throw new Error('공장 단가표 로드 실패');
          }
          const pricingPayload = await pricingRes.json();
          fetchedPricing = pricingPayload.data || [];
        }
        if (cancelled) return;

        setPricingRows(fetchedPricing);
        const drafts = (artPayload.data || []).map(rowFromDb);
        setRows(drafts);
        setOriginalIds(new Set(drafts.map((d: RowDraft) => d.dbId).filter((x: string | null): x is string => !!x)));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '불러오기 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderItemId, listUrl, factoryPricingUrl]);

  /** distinct print_method_id 목록 (공장이 취급하는 것만) */
  const availableMethods = useMemo(() => {
    const map = new Map<string, { id: string; name: string; key: string }>();
    for (const p of pricingRows) {
      if (!p.print_method_id) continue;
      if (!p.is_active) continue;
      const m = p.print_methods;
      if (!m) continue;
      if (!map.has(p.print_method_id)) {
        map.set(p.print_method_id, { id: m.id, name: m.name, key: m.key });
      }
    }
    return Array.from(map.values());
  }, [pricingRows]);

  /** 특정 method의 size 라벨 옵션 */
  const sizeOptionsFor = (printMethodId: string): FactoryPrintMethodPricing[] => {
    return pricingRows.filter((p) => p.print_method_id === printMethodId && p.is_active);
  };

  /** 행의 단가표 행 찾기 */
  const findPricingRow = (row: RowDraft): FactoryPrintMethodPricing | null => {
    if (row.factory_pricing_row_id) {
      return pricingRows.find((p) => p.id === row.factory_pricing_row_id) ?? null;
    }
    return null;
  };

  /** 단가/합계 자동 재계산 후 patch 반환 */
  const recompute = (row: RowDraft): Partial<RowDraft> => {
    const pricingRow = findPricingRow(row);
    if (!pricingRow) return {};
    const qty = Number(row.applied_quantity);
    const add = Number(row.additional_amount) || 0;
    const total = computeFactoryTotal(pricingRow, qty, add);
    const unit = computeUnitPriceDisplay(pricingRow);
    const patch: Partial<RowDraft> = {};
    if (unit !== null) patch.factory_unit_price = String(unit);
    if (total !== null && !row.totalManuallyEdited) {
      patch.factory_total = String(total);
    }
    return patch;
  };

  const updateRow = (tempId: string, patch: Partial<RowDraft>, recalc = true) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const next = { ...r, ...patch };
        if (recalc) {
          Object.assign(next, recompute(next));
        }
        return next;
      })
    );
  };

  /** 인쇄방식 변경 시 사이즈/단가 리셋 */
  const onMethodChange = (tempId: string, methodId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        return {
          ...r,
          print_method_id: methodId,
          size_label: '',
          factory_pricing_row_id: null,
          factory_unit_price: '',
          factory_total: '',
          totalManuallyEdited: false,
          factory_cost_source: 'auto_match',
        };
      })
    );
  };

  /** 사이즈 라벨 변경 시 단가/합계 자동 채움 */
  const onSizeChange = (tempId: string, pricingRowId: string) => {
    const pricingRow = pricingRows.find((p) => p.id === pricingRowId);
    if (!pricingRow) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const next: RowDraft = {
          ...r,
          size_label: pricingRow.size,
          factory_pricing_row_id: pricingRow.id,
          factory_cost_source: 'auto_match',
          totalManuallyEdited: false,
        };
        const qty = Number(next.applied_quantity) || itemQuantity;
        if (!next.applied_quantity) next.applied_quantity = String(qty);
        const add = Number(next.additional_amount) || 0;
        const total = computeFactoryTotal(pricingRow, qty, add);
        const unit = computeUnitPriceDisplay(pricingRow);
        if (unit !== null) next.factory_unit_price = String(unit);
        if (total !== null) next.factory_total = String(total);
        return next;
      })
    );
  };

  const onQuantityChange = (tempId: string, value: string) => {
    updateRow(tempId, { applied_quantity: value }, true);
  };

  const onAdditionalChange = (tempId: string, value: string) => {
    updateRow(tempId, { additional_amount: value }, true);
  };

  const onUnitPriceChange = (tempId: string, value: string) => {
    // 단가 수기 수정 → override
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const next = {
          ...r,
          factory_unit_price: value,
          factory_cost_source: 'override' as const,
        };
        // 수기 수정한 단가 × 갯수 + 추가금액으로 합계 재계산 (totalManuallyEdited=false일 때만)
        if (!r.totalManuallyEdited) {
          const u = Number(value);
          const q = Number(r.applied_quantity);
          const a = Number(r.additional_amount) || 0;
          if (Number.isFinite(u) && Number.isFinite(q) && q > 0) {
            next.factory_total = String(Math.round(u * q + a));
          }
        }
        return next;
      })
    );
  };

  const onTotalChange = (tempId: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        return {
          ...r,
          factory_total: value,
          totalManuallyEdited: true,
          factory_cost_source: 'override' as const,
        };
      })
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, blankRow({ applied_quantity: itemQuantity })]);
  };
  const removeRow = (tempId: string) => {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const currentIds = new Set(rows.map((r) => r.dbId).filter((x): x is string => !!x));
      const idsToDelete: string[] = Array.from(originalIds).filter((id) => !currentIds.has(id));

      if (!isFactoryMode) {
        for (const id of idsToDelete) {
          const res = await fetch(`${mutationUrl}?artwork_id=${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const p = await res.json().catch(() => ({}));
            throw new Error(p?.error || `삭제 실패: ${id}`);
          }
        }
      }

      for (const r of rows) {
        const pricingRow = findPricingRow(r);
        const body: Record<string, unknown> = {
          id: r.dbId,
          print_method_id: r.print_method_id || null,
          size_label: r.size_label || null,
          // dimension는 단가표 행에서 끌어옴 (후속 cm 기반 매칭/리포트용)
          width_cm: pricingRow?.max_width_cm ?? null,
          height_cm: pricingRow?.max_height_cm ?? null,
          applied_quantity: r.applied_quantity === '' ? null : Number(r.applied_quantity),
          factory_pricing_row_id: r.factory_pricing_row_id,
          factory_unit_price: r.factory_unit_price === '' ? null : Number(r.factory_unit_price),
          additional_amount: r.additional_amount === '' ? null : Number(r.additional_amount),
          factory_total: r.factory_total === '' ? null : Number(r.factory_total),
          factory_cost_source: r.factory_cost_source || 'auto_match',
        };
        if (r.dbId) {
          const res = await fetch(mutationUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const p = await res.json().catch(() => ({}));
            throw new Error(p?.error || '수정 실패');
          }
        } else if (!isFactoryMode) {
          const res = await fetch(mutationUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const p = await res.json().catch(() => ({}));
            throw new Error(p?.error || '생성 실패');
          }
        }
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const totalSum = rows.reduce((s, r) => s + (Number(r.factory_total) || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <DollarSign className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              공장 인쇄 작업 — {orderItemTitle}
            </h2>
            {isFactoryMode && (
              <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-800">
                공장 모드
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              {isFactoryMode ? (
                <>본인 공장에 배정된 작업 항목의 <b>공장 작업 비용</b>만 조정할 수 있습니다.</>
              ) : (
                <>
                  <b>공장에 지급할 인쇄 작업</b>을 행 단위로 등록합니다. 인쇄방식·크기 라벨을
                  선택하면 그 공장 단가표에서 단가가 자동으로 채워지고, 갯수·추가금액에 따라
                  합계가 자동 산정됩니다. 단가·합계를 수기로 수정하면 출처가 override로
                  표시됩니다. 저장 시 합계가 order_items.factory_amount로 자동 동기화되어
                  마진 계산에 반영됩니다.
                </>
              )}
            </div>
          </div>

          {!factoryPricingUrl && !isFactoryMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800">
              먼저 이 품목에 공장을 배정해주세요. 공장 단가표가 있어야 자동 산정이 가능합니다.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-xs text-gray-600">
                  주문 수량 <b>{itemQuantity}</b> · 작업 항목 <b>{rows.length}</b>건
                  {availableMethods.length === 0 && !isFactoryMode && factoryPricingUrl && (
                    <span className="ml-2 text-amber-700">
                      (이 공장의 단가표가 비어있습니다. 먼저 공장 단가표를 등록하세요)
                    </span>
                  )}
                </p>
                {!isFactoryMode && (
                  <button
                    type="button"
                    onClick={addRow}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 rounded-md border border-emerald-200"
                  >
                    <Plus className="w-3.5 h-3.5" /> 작업 항목 추가
                  </button>
                )}
              </div>

              {rows.length === 0 && (
                <div className="text-center text-xs text-gray-400 py-8 border border-dashed border-gray-200 rounded-md">
                  등록된 작업 항목이 없습니다.
                  <br />
                  위 &lsquo;작업 항목 추가&rsquo; 버튼을 눌러 인쇄 작업을 등록하세요.
                </div>
              )}

              {rows.map((row) => {
                const sizeOptions = sizeOptionsFor(row.print_method_id);
                return (
                  <div
                    key={row.tempId}
                    className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white"
                  >
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-3">
                        <label className="block text-[10px] text-gray-500 mb-0.5">인쇄방식</label>
                        <select
                          value={row.print_method_id}
                          onChange={(e) => onMethodChange(row.tempId, e.target.value)}
                          disabled={isFactoryMode}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                        >
                          <option value="">선택</option>
                          {availableMethods.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label className="block text-[10px] text-gray-500 mb-0.5">크기 라벨</label>
                        <select
                          value={row.factory_pricing_row_id ?? ''}
                          onChange={(e) => onSizeChange(row.tempId, e.target.value)}
                          disabled={isFactoryMode || !row.print_method_id}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                        >
                          <option value="">선택</option>
                          {sizeOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.size}
                              {p.pricing_model === 'bulk' ? ' (bulk)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] text-gray-500 mb-0.5">갯수</label>
                        <input
                          type="number"
                          min="0"
                          value={row.applied_quantity}
                          onChange={(e) => onQuantityChange(row.tempId, e.target.value)}
                          disabled={isFactoryMode}
                          placeholder={String(itemQuantity)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-[10px] text-gray-500 mb-0.5">
                          단가/개
                          {(() => {
                            const p = findPricingRow(row);
                            if (p?.pricing_model === 'bulk') return ' (bulk — 합계 참조)';
                            return '';
                          })()}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={row.factory_unit_price}
                          onChange={(e) => onUnitPriceChange(row.tempId, e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                        />
                      </div>
                      <div className="col-span-1 flex items-end justify-end">
                        {!isFactoryMode && (
                          <button
                            type="button"
                            onClick={() => removeRow(row.tempId)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-md"
                            title="이 작업 항목 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 pt-2 border-t border-gray-100">
                      <div className="col-span-4">
                        <label className="block text-[10px] text-gray-500 mb-0.5">추가금액</label>
                        <input
                          type="number"
                          value={row.additional_amount}
                          onChange={(e) => onAdditionalChange(row.tempId, e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                        />
                      </div>
                      <div className="col-span-4">
                        <label className="block text-[10px] text-gray-500 mb-0.5">합계 (자동/수정)</label>
                        <input
                          type="number"
                          value={row.factory_total}
                          onChange={(e) => onTotalChange(row.tempId, e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs font-semibold"
                        />
                      </div>
                      <div className="col-span-4">
                        <label className="block text-[10px] text-gray-500 mb-0.5">출처</label>
                        <select
                          value={row.factory_cost_source}
                          onChange={(e) =>
                            updateRow(
                              row.tempId,
                              {
                                factory_cost_source: e.target.value as RowDraft['factory_cost_source'],
                              },
                              false
                            )
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                        >
                          <option value="">미지정</option>
                          <option value="auto_match">자동</option>
                          <option value="manual">수기</option>
                          <option value="negotiated">협의가</option>
                          <option value="override">override</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}

              {rows.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm text-emerald-900 flex justify-between">
                  <span>이 품목 공장 작업 비용 합계 (마진 계산 반영):</span>
                  <b>{totalSum.toLocaleString()} 원</b>
                </div>
              )}
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
            {saving ? '저장 중...' : '배정완료 (저장)'}
          </button>
        </div>
      </div>
    </div>
  );
}
