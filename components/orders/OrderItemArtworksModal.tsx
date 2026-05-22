'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  X, Plus, Trash2, Save, Wand2, AlertCircle, DollarSign,
} from 'lucide-react';
import type { OrderItemArtwork, PrintMethodRecord } from '@/types/types';
import { parseSizeLabelToCm } from '@/lib/factoryPricing';

interface Props {
  orderItemId: string;
  orderItemTitle: string;
  itemQuantity: number; // order_items.quantity — used as default applied_quantity
  factoryId: string | null; // assigned_manufacturer_id (optional)
  onClose: () => void;
  onSaved?: () => void;
  /**
   * 'admin' (default): full RW. CRUD all fields, add/remove rows.
   * 'factory': RW only on factory_unit_price/factory_total/factory_cost_source/note.
   *           Cannot add/remove rows. Other fields disabled.
   */
  mode?: 'admin' | 'factory';
  /**
   * API endpoints — override for factory mode.
   * - listUrl: GET artworks list
   * - mutationUrl: POST/PATCH/DELETE (only PATCH for factory)
   * - autoMatchUrl: POST auto-match
   */
  endpoints?: {
    listUrl?: string;
    mutationUrl?: string;
    autoMatchUrl?: string;
  };
}

interface RowDraft {
  tempId: string;
  dbId: string | null;
  print_method_id: string;
  placement: string;
  size_label: string;
  width_cm: string;
  height_cm: string;
  applied_quantity: string;
  customer_unit_price: string;
  customer_total: string;
  factory_unit_price: string;
  factory_total: string;
  factory_cost_source: '' | 'auto_match' | 'manual' | 'negotiated' | 'override';
  factory_pricing_row_id: string | null;
  note: string;
  matching: boolean;
  matchError: string | null;
}

const newTempId = () => `t_${Math.random().toString(36).slice(2, 10)}`;

const blankRow = (defaults: { applied_quantity?: number } = {}): RowDraft => ({
  tempId: newTempId(),
  dbId: null,
  print_method_id: '',
  placement: '',
  size_label: '',
  width_cm: '',
  height_cm: '',
  applied_quantity: defaults.applied_quantity ? String(defaults.applied_quantity) : '',
  customer_unit_price: '',
  customer_total: '',
  factory_unit_price: '',
  factory_total: '',
  factory_cost_source: '',
  factory_pricing_row_id: null,
  note: '',
  matching: false,
  matchError: null,
});

const rowFromDb = (a: OrderItemArtwork): RowDraft => ({
  tempId: a.id,
  dbId: a.id,
  print_method_id: a.print_method_id ?? '',
  placement: a.placement ?? '',
  size_label: a.size_label ?? '',
  width_cm: a.width_cm !== null ? String(a.width_cm) : '',
  height_cm: a.height_cm !== null ? String(a.height_cm) : '',
  applied_quantity: a.applied_quantity !== null ? String(a.applied_quantity) : '',
  customer_unit_price: a.customer_unit_price !== null ? String(a.customer_unit_price) : '',
  customer_total: a.customer_total !== null ? String(a.customer_total) : '',
  factory_unit_price: a.factory_unit_price !== null ? String(a.factory_unit_price) : '',
  factory_total: a.factory_total !== null ? String(a.factory_total) : '',
  factory_cost_source: (a.factory_cost_source as RowDraft['factory_cost_source']) ?? '',
  factory_pricing_row_id: a.factory_pricing_row_id,
  note: a.note ?? '',
  matching: false,
  matchError: null,
});

const PLACEMENT_PRESETS = ['front', 'back', 'left_sleeve', 'right_sleeve', 'pocket', 'other'];

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
  const autoMatchUrl =
    endpoints?.autoMatchUrl ?? `/api/admin/order-items/${orderItemId}/artworks/auto-match`;
  const [methods, setMethods] = useState<PrintMethodRecord[]>([]);
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
        // Print methods list endpoint:
        //  - admin: /api/admin/print-methods (full list)
        //  - factory: /api/my-factory/print-methods (factory-accessible)
        const methodsListUrl = isFactoryMode
          ? '/api/my-factory/print-methods'
          : '/api/admin/print-methods';
        const [methodsRes, artRes] = await Promise.all([
          fetch(methodsListUrl),
          fetch(listUrl),
        ]);
        if (!methodsRes.ok) throw new Error('인쇄기법 목록 로드 실패');
        if (!artRes.ok) throw new Error('아트워크 목록 로드 실패');
        const methodsPayload = await methodsRes.json();
        const artPayload = await artRes.json();
        if (cancelled) return;
        const sortedMethods = ((methodsPayload.data || []) as PrintMethodRecord[]).sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        );
        setMethods(sortedMethods);
        const drafts = ((artPayload.data || []) as OrderItemArtwork[]).map(rowFromDb);
        setRows(drafts);
        setOriginalIds(new Set(drafts.map((d) => d.dbId).filter((x): x is string => !!x)));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '불러오기 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderItemId, isFactoryMode, listUrl]);

  const updateRow = (tempId: string, patch: Partial<RowDraft>) => {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, blankRow({ applied_quantity: itemQuantity })]);
  };

  const removeRow = (tempId: string) => {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const autofillDims = (tempId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const parsed = parseSizeLabelToCm(r.size_label);
        if (!parsed) return r;
        return {
          ...r,
          width_cm: r.width_cm === '' ? String(parsed.width) : r.width_cm,
          height_cm: r.height_cm === '' ? String(parsed.height) : r.height_cm,
        };
      })
    );
  };

  /**
   * Calls auto-match API for this row. Fills customer_/factory_ fields.
   * Does NOT save; user can still edit after.
   */
  const runAutoMatch = async (tempId: string) => {
    const row = rows.find((r) => r.tempId === tempId);
    if (!row) return;
    if (!row.print_method_id) {
      updateRow(tempId, { matchError: '인쇄기법을 먼저 선택하세요' });
      return;
    }
    const w = Number(row.width_cm);
    const h = Number(row.height_cm);
    const q = Number(row.applied_quantity);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      updateRow(tempId, { matchError: '가로/세로(cm)를 입력하세요' });
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      updateRow(tempId, { matchError: '적용 수량을 입력하세요' });
      return;
    }

    updateRow(tempId, { matching: true, matchError: null });
    try {
      const res = await fetch(autoMatchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          print_method_id: row.print_method_id,
          width_cm: w,
          height_cm: h,
          applied_quantity: q,
          // factory_id is only meaningful for admin endpoint; factory endpoint derives from session
          factory_id: isFactoryMode ? undefined : factoryId || undefined,
        }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '자동 매칭 실패');
      }
      const payload = await res.json();
      const customer = payload.data?.customer;
      const factory = payload.data?.factory;

      const patch: Partial<RowDraft> = { matching: false, matchError: null };
      if (customer?.unit_price !== null && customer?.unit_price !== undefined) {
        patch.customer_unit_price = String(customer.unit_price);
      }
      if (customer?.total !== null && customer?.total !== undefined) {
        patch.customer_total = String(customer.total);
      }
      if (factory?.unit_price !== null && factory?.unit_price !== undefined) {
        patch.factory_unit_price = String(factory.unit_price);
        patch.factory_cost_source = 'auto_match';
      }
      if (factory?.total !== null && factory?.total !== undefined) {
        patch.factory_total = String(factory.total);
      }
      if (factory?.matched_row?.id) {
        patch.factory_pricing_row_id = factory.matched_row.id as string;
      }
      if (!customer?.matched_row && !factory?.matched_row) {
        patch.matchError = '매칭 결과 없음. 단가표에 해당 사이즈가 있는지 확인하세요';
      } else if (factoryId && !factory?.matched_row) {
        patch.matchError = '공장 단가만 매칭 실패. 고객가는 매칭됨';
      }
      updateRow(tempId, patch);
    } catch (err) {
      updateRow(tempId, {
        matching: false,
        matchError: err instanceof Error ? err.message : '자동 매칭 오류',
      });
    }
  };

  /** Persist changes via the CRUD endpoint (sequential — N is small per order item) */
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const currentIds = new Set(rows.map((r) => r.dbId).filter((x): x is string => !!x));
      const idsToDelete: string[] = Array.from(originalIds).filter((id) => !currentIds.has(id));

      // Factory mode never deletes rows
      if (!isFactoryMode) {
        for (const id of idsToDelete) {
          const res = await fetch(`${mutationUrl}?artwork_id=${id}`, {
            method: 'DELETE',
          });
          if (!res.ok) {
            const p = await res.json().catch(() => ({}));
            throw new Error(p?.error || `삭제 실패: ${id}`);
          }
        }
      }

      for (const r of rows) {
        const body = {
          id: r.dbId,
          print_method_id: r.print_method_id || null,
          placement: r.placement || null,
          size_label: r.size_label || null,
          width_cm: r.width_cm === '' ? null : Number(r.width_cm),
          height_cm: r.height_cm === '' ? null : Number(r.height_cm),
          applied_quantity: r.applied_quantity === '' ? null : Number(r.applied_quantity),
          customer_unit_price: r.customer_unit_price === '' ? null : Number(r.customer_unit_price),
          customer_total: r.customer_total === '' ? null : Number(r.customer_total),
          factory_unit_price: r.factory_unit_price === '' ? null : Number(r.factory_unit_price),
          factory_total: r.factory_total === '' ? null : Number(r.factory_total),
          factory_cost_source: r.factory_cost_source || null,
          factory_pricing_row_id: r.factory_pricing_row_id,
          note: r.note || null,
        };
        if (r.dbId) {
          // Factory mode: API only accepts whitelist of factory_* + note.
          // Other fields are stripped server-side; we still send the full body
          // for admin mode compatibility.
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
          // Factory mode never creates rows
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

  const sortedMethods = useMemo(() => methods, [methods]);

  const factoryMarginTotal = rows.reduce((sum, r) => {
    const c = Number(r.customer_total);
    const f = Number(r.factory_total);
    if (Number.isFinite(c) && Number.isFinite(f)) return sum + (c - f);
    return sum;
  }, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <DollarSign className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              아트워크 단가 — {orderItemTitle}
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
                <>
                  배정받은 작업의 아트워크별 단가를 확인하고 <b>공장 단가</b>만 조정할 수 있습니다.
                  인쇄기법·위치·사이즈·수량·고객가는 관리자가 정한 값으로 읽기 전용이며, 본인
                  공장 단가표를 사용한 자동 매칭과 협의가(negotiated) 수기 수정이 가능합니다.
                </>
              ) : (
                <>
                  한 주문 상품에 적용된 인쇄 아트워크들을 각각 행으로 입력합니다. 자동 매칭은
                  입력한 cm 기반으로 고객가·공장가를 단가표에서 조회합니다 (회전 허용). 자동
                  결과는 수기로 수정·재정의(negotiated) 가능합니다. 저장 시
                  order_items.factory_amount는 아트워크 행들의 factory_total 합계로 자동
                  갱신됩니다.
                </>
              )}
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
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-xs text-gray-600">
                  주문 수량: <b>{itemQuantity}</b> · 아트워크 행 수:{' '}
                  <b>{rows.length}</b>
                </p>
                {!isFactoryMode && (
                  <button
                    type="button"
                    onClick={addRow}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 rounded-md border border-emerald-200"
                  >
                    <Plus className="w-3.5 h-3.5" /> 아트워크 추가
                  </button>
                )}
              </div>

              {rows.length === 0 && (
                <div className="text-center text-xs text-gray-400 py-8 border border-dashed border-gray-200 rounded-md">
                  등록된 아트워크가 없습니다. <br />
                  이 주문 상품에 인쇄가 들어가면 위 &lsquo;아트워크 추가&rsquo; 버튼을 눌러 입력하세요.
                </div>
              )}

              {rows.map((row) => (
                <div
                  key={row.tempId}
                  className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white"
                >
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-3">
                      <label className="block text-[10px] text-gray-500 mb-0.5">인쇄기법</label>
                      <select
                        value={row.print_method_id}
                        onChange={(e) => updateRow(row.tempId, { print_method_id: e.target.value })}
                        disabled={isFactoryMode}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                      >
                        <option value="">선택</option>
                        {sortedMethods.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {!m.is_active ? ' (비활성)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-gray-500 mb-0.5">위치</label>
                      <input
                        list={`placements-${row.tempId}`}
                        value={row.placement}
                        onChange={(e) => updateRow(row.tempId, { placement: e.target.value })}
                        placeholder="front"
                        disabled={isFactoryMode}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                      />
                      <datalist id={`placements-${row.tempId}`}>
                        {PLACEMENT_PRESETS.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-gray-500 mb-0.5">사이즈 라벨</label>
                      <input
                        value={row.size_label}
                        onChange={(e) => updateRow(row.tempId, { size_label: e.target.value })}
                        onBlur={() => autofillDims(row.tempId)}
                        placeholder="A4 / 25x25"
                        disabled={isFactoryMode}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] text-gray-500 mb-0.5">가로cm</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={row.width_cm}
                        onChange={(e) => updateRow(row.tempId, { width_cm: e.target.value })}
                        disabled={isFactoryMode}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] text-gray-500 mb-0.5">세로cm</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={row.height_cm}
                        onChange={(e) => updateRow(row.tempId, { height_cm: e.target.value })}
                        disabled={isFactoryMode}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-gray-500 mb-0.5">적용 수량</label>
                      <input
                        type="number"
                        min="0"
                        value={row.applied_quantity}
                        onChange={(e) => updateRow(row.tempId, { applied_quantity: e.target.value })}
                        placeholder={String(itemQuantity)}
                        disabled={isFactoryMode}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs disabled:bg-gray-50"
                      />
                    </div>
                    <div className="col-span-1 flex items-end justify-end">
                      {!isFactoryMode && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.tempId)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-md"
                          title="이 아트워크 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2 items-end pt-2 border-t border-gray-100">
                    {/* Customer pricing: hidden in factory mode (factory has no business with it) */}
                    {!isFactoryMode && (
                      <>
                        <div className="col-span-2">
                          <label className="block text-[10px] text-gray-500 mb-0.5">고객 단가/개</label>
                          <input
                            type="number"
                            min="0"
                            value={row.customer_unit_price}
                            onChange={(e) =>
                              updateRow(row.tempId, { customer_unit_price: e.target.value })
                            }
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] text-gray-500 mb-0.5">고객 합계</label>
                          <input
                            type="number"
                            min="0"
                            value={row.customer_total}
                            onChange={(e) => updateRow(row.tempId, { customer_total: e.target.value })}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                          />
                        </div>
                      </>
                    )}
                    <div className="col-span-2">
                      <label className="block text-[10px] text-gray-500 mb-0.5">공장 단가/개</label>
                      <input
                        type="number"
                        min="0"
                        value={row.factory_unit_price}
                        onChange={(e) =>
                          updateRow(row.tempId, { factory_unit_price: e.target.value })
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-gray-500 mb-0.5">공장 합계</label>
                      <input
                        type="number"
                        min="0"
                        value={row.factory_total}
                        onChange={(e) => updateRow(row.tempId, { factory_total: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-gray-500 mb-0.5">공장가 출처</label>
                      <select
                        value={row.factory_cost_source}
                        onChange={(e) =>
                          updateRow(row.tempId, {
                            factory_cost_source: e.target.value as RowDraft['factory_cost_source'],
                          })
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                      >
                        <option value="">미지정</option>
                        <option value="auto_match">자동 매칭</option>
                        <option value="manual">수기 입력</option>
                        <option value="negotiated">협의가</option>
                        <option value="override">수기 override</option>
                      </select>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => runAutoMatch(row.tempId)}
                        disabled={row.matching}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-md disabled:opacity-50"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        {row.matching ? '매칭 중...' : '자동 매칭'}
                      </button>
                    </div>
                  </div>

                  {row.matchError && (
                    <p className="text-[11px] text-amber-700 px-1">{row.matchError}</p>
                  )}

                  <div className="text-[11px] text-gray-500 px-1 flex justify-between">
                    {!isFactoryMode ? (
                      <span>
                        행 마진: {Number.isFinite(Number(row.customer_total) - Number(row.factory_total))
                          ? (Number(row.customer_total) - Number(row.factory_total)).toLocaleString()
                          : '-'} 원
                      </span>
                    ) : (
                      <span>공장 합계: {Number(row.factory_total).toLocaleString()} 원</span>
                    )}
                    <span>
                      {row.factory_pricing_row_id && '매칭된 공장 단가 행 사용'}
                    </span>
                  </div>
                </div>
              ))}

              {rows.length > 0 && !isFactoryMode && (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-700 flex justify-between">
                  <span>전체 인쇄 마진 합계 (고객 총합 − 공장 총합):</span>
                  <b>{factoryMarginTotal.toLocaleString()} 원</b>
                </div>
              )}
              {rows.length > 0 && isFactoryMode && (
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-700 flex justify-between">
                  <span>공장 지급액 합계:</span>
                  <b>
                    {rows
                      .reduce((s, r) => s + (Number(r.factory_total) || 0), 0)
                      .toLocaleString()}
                    {' '}원
                  </b>
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
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
