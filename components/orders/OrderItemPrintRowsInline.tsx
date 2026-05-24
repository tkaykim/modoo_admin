'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FactoryPrintMethodPricing, OrderItemArtwork } from '@/types/types';

/**
 * 공장 배정 카드 안에 인라인으로 표시되는 인쇄 행 편집기.
 * - 행 추가/수정/삭제 즉시 API 저장 (debounce 없음 — admin 사용량 적음)
 * - 트리거가 order_items.factory_amount 자동 sync → 부모는 onChanged()로 새로고침
 *
 * 별도 모달 wrapper 없음. 사용자 의도 그대로 1:1 흐름:
 *   공장 선택 → 인쇄방법 추가 → 크기 → 갯수 자동 → 단가 자동 → 추가금액 → 합계 자동
 */

interface Props {
  orderItemId: string;
  itemQuantity: number;
  factoryId: string | null;
  /** 행 변경 후 부모에게 알림 (부모는 fetchOrderItems()로 factory_amount 새로고침) */
  onChanged?: () => void;
}

interface RowDraft {
  tempId: string;
  dbId: string | null;
  print_method_id: string;
  size_label: string;
  factory_pricing_row_id: string | null;
  applied_quantity: string;
  factory_unit_price: string;
  additional_amount: string;
  factory_total: string;
  totalManuallyEdited: boolean;
  saving: boolean;
}

const newTempId = () => `t_${Math.random().toString(36).slice(2, 10)}`;

const rowFromDb = (
  a: OrderItemArtwork & { additional_amount?: number | null }
): RowDraft => ({
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
  totalManuallyEdited: false,
  saving: false,
});

function calcBaseTotal(
  row: Pick<
    FactoryPrintMethodPricing,
    'pricing_model' | 'unit_price' | 'base_price' | 'base_quantity' | 'additional_price_per_piece'
  > | null,
  quantity: number
): number | null {
  if (!row) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (row.pricing_model === 'flat') {
    if (row.unit_price === null || row.unit_price === undefined) return null;
    return row.unit_price * quantity;
  }
  if (row.pricing_model === 'bulk') {
    if (
      row.base_price === null || row.base_price === undefined ||
      row.base_quantity === null || row.base_quantity === undefined ||
      row.additional_price_per_piece === null || row.additional_price_per_piece === undefined
    ) return null;
    const extra = Math.max(0, quantity - row.base_quantity);
    return row.base_price + extra * row.additional_price_per_piece;
  }
  return null;
}

export default function OrderItemPrintRowsInline({
  orderItemId,
  itemQuantity,
  factoryId,
  onChanged,
}: Props) {
  const [pricingRows, setPricingRows] = useState<FactoryPrintMethodPricing[]>([]);
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load existing artwork rows ONCE per order item.
  // Crucially: this does NOT re-run when factoryId changes — that would wipe
  // unsaved user input. Switching factories only refreshes the pricing options,
  // not the rows themselves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const artRes = await fetch(`/api/admin/order-items/${orderItemId}/artworks`);
        if (!artRes.ok) throw new Error('인쇄 행 로드 실패');
        const artPayload = await artRes.json();
        if (cancelled) return;
        setRows((artPayload.data || []).map(rowFromDb));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '불러오기 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderItemId]);

  // Load pricing options whenever the assigned factory changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!factoryId) {
          setPricingRows([]);
          return;
        }
        const pRes = await fetch(`/api/admin/factory-print-pricing?factory_id=${factoryId}`);
        if (!pRes.ok) return;
        const pPayload = await pRes.json();
        if (cancelled) return;
        setPricingRows(pPayload.data || []);
      } catch {
        // pricing fetch failure shouldn't block the editor
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [factoryId]);

  // distinct methods this factory handles
  const availableMethods = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of pricingRows) {
      if (!p.print_method_id || !p.is_active || !p.print_methods) continue;
      if (!map.has(p.print_method_id)) {
        map.set(p.print_method_id, { id: p.print_methods.id, name: p.print_methods.name });
      }
    }
    return Array.from(map.values());
  }, [pricingRows]);

  const sizeOptionsFor = (methodId: string) =>
    pricingRows.filter((p) => p.print_method_id === methodId && p.is_active);

  const findPricing = (row: RowDraft) =>
    row.factory_pricing_row_id
      ? pricingRows.find((p) => p.id === row.factory_pricing_row_id) ?? null
      : null;

  const persistRow = async (row: RowDraft) => {
    const pricing = findPricing(row);
    const body: Record<string, unknown> = {
      print_method_id: row.print_method_id || null,
      size_label: row.size_label || null,
      width_cm: pricing?.max_width_cm ?? null,
      height_cm: pricing?.max_height_cm ?? null,
      applied_quantity: row.applied_quantity === '' ? null : Number(row.applied_quantity),
      factory_pricing_row_id: row.factory_pricing_row_id,
      factory_unit_price: row.factory_unit_price === '' ? null : Number(row.factory_unit_price),
      additional_amount: row.additional_amount === '' ? null : Number(row.additional_amount),
      factory_total: row.factory_total === '' ? null : Number(row.factory_total),
      factory_cost_source: row.totalManuallyEdited ? 'override' : 'auto_match',
    };
    if (row.dbId) {
      const res = await fetch(`/api/admin/order-items/${orderItemId}/artworks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.dbId, ...body }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '수정 실패');
      }
    } else {
      const res = await fetch(`/api/admin/order-items/${orderItemId}/artworks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '생성 실패');
      }
      const payload = await res.json();
      if (payload?.data?.id) {
        setRows((prev) =>
          prev.map((r) => (r.tempId === row.tempId ? { ...r, dbId: payload.data.id } : r))
        );
      }
    }
    onChanged?.();
  };

  /** 자동저장: row를 받아 즉시 persist. 에러 시 message만 띄움 */
  const autoSave = async (row: RowDraft) => {
    if (!row.print_method_id || !row.factory_pricing_row_id) return; // 필수 빠지면 저장 안 함
    setRows((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, saving: true } : r)));
    try {
      await persistRow(row);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setRows((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, saving: false } : r)));
    }
  };

  const onMethodChange = (tempId: string, methodId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.tempId === tempId
          ? {
              ...r,
              print_method_id: methodId,
              size_label: '',
              factory_pricing_row_id: null,
              factory_unit_price: '',
              factory_total: '',
              totalManuallyEdited: false,
            }
          : r
      )
    );
  };

  const onSizeChange = (tempId: string, pricingRowId: string) => {
    const p = pricingRows.find((x) => x.id === pricingRowId);
    if (!p) return;
    setRows((prev) => {
      const next = prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const qty = Number(r.applied_quantity) || itemQuantity;
        const add = Number(r.additional_amount) || 0;
        const baseTotal = calcBaseTotal(p, qty);
        const unit = p.pricing_model === 'flat' && p.unit_price !== null ? p.unit_price : null;
        return {
          ...r,
          size_label: p.size,
          factory_pricing_row_id: p.id,
          applied_quantity: r.applied_quantity || String(qty),
          factory_unit_price: unit !== null ? String(unit) : r.factory_unit_price,
          factory_total: baseTotal !== null ? String(Math.round(baseTotal + add)) : r.factory_total,
          totalManuallyEdited: false,
        };
      });
      const target = next.find((r) => r.tempId === tempId);
      if (target) autoSave(target);
      return next;
    });
  };

  const onQuantityChange = (tempId: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const p = findPricing(r);
        const qty = Number(value);
        const add = Number(r.additional_amount) || 0;
        const baseTotal = calcBaseTotal(p, qty);
        return {
          ...r,
          applied_quantity: value,
          factory_total:
            !r.totalManuallyEdited && baseTotal !== null
              ? String(Math.round(baseTotal + add))
              : r.factory_total,
        };
      })
    );
  };

  const onAdditionalChange = (tempId: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const p = findPricing(r);
        const qty = Number(r.applied_quantity);
        const add = Number(value) || 0;
        const baseTotal = calcBaseTotal(p, qty);
        return {
          ...r,
          additional_amount: value,
          factory_total:
            !r.totalManuallyEdited && baseTotal !== null
              ? String(Math.round(baseTotal + add))
              : r.factory_total,
        };
      })
    );
  };

  const onUnitPriceChange = (tempId: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const u = Number(value);
        const q = Number(r.applied_quantity);
        const a = Number(r.additional_amount) || 0;
        return {
          ...r,
          factory_unit_price: value,
          factory_total:
            !r.totalManuallyEdited && Number.isFinite(u) && Number.isFinite(q) && q > 0
              ? String(Math.round(u * q + a))
              : r.factory_total,
        };
      })
    );
  };

  const onTotalChange = (tempId: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.tempId === tempId ? { ...r, factory_total: value, totalManuallyEdited: true } : r
      )
    );
  };

  /** blur 시 저장 (사용자가 인쇄방법·크기 모두 선택했고 입력 다 했을 때) */
  const onBlurSave = (tempId: string) => {
    const target = rows.find((r) => r.tempId === tempId);
    if (target) autoSave(target);
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        tempId: newTempId(),
        dbId: null,
        print_method_id: '',
        size_label: '',
        factory_pricing_row_id: null,
        applied_quantity: String(itemQuantity),
        factory_unit_price: '',
        additional_amount: '',
        factory_total: '',
        totalManuallyEdited: false,
        saving: false,
      },
    ]);
  };

  const removeRow = async (tempId: string) => {
    const target = rows.find((r) => r.tempId === tempId);
    if (!target) return;
    if (target.dbId) {
      try {
        const res = await fetch(
          `/api/admin/order-items/${orderItemId}/artworks?artwork_id=${target.dbId}`,
          { method: 'DELETE' }
        );
        if (!res.ok) {
          const p = await res.json().catch(() => ({}));
          throw new Error(p?.error || '삭제 실패');
        }
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : '삭제 실패');
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const totalSum = rows.reduce((s, r) => s + (Number(r.factory_total) || 0), 0);

  if (loading) {
    return (
      <div className="text-[11px] text-gray-400 py-2">인쇄 정보 불러오는 중...</div>
    );
  }

  return (
    <div className="space-y-2 border-t border-gray-100 pt-2 mt-1">
      {!factoryId && (
        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[11px] text-blue-800">
          공장을 선택하면 그 공장의 단가표 기반으로 인쇄방법과 크기를 선택할 수 있습니다.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-[11px] text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center px-1">
        <span className="text-[11px] font-medium text-gray-700">
          🖨️ 인쇄 ({rows.length}건)
        </span>
        <button
          type="button"
          onClick={addRow}
          disabled={!factoryId || availableMethods.length === 0}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-emerald-700 border border-emerald-200 hover:bg-emerald-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          title={!factoryId ? '공장을 먼저 선택하세요' : ''}
        >
          <Plus className="w-3 h-3" /> 인쇄방법 추가
        </button>
      </div>

      {factoryId && availableMethods.length === 0 && (
        <div className="text-[10px] text-amber-700 px-1">
          이 공장의 단가표가 비어있습니다. 공장관리 &gt; 단가표에서 먼저 등록하세요.
        </div>
      )}

      {rows.map((row) => (
        <div
          key={row.tempId}
          className="border border-gray-200 rounded p-2 space-y-1.5 bg-gray-50/50"
        >
          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-3">
              <label className="block text-[9px] text-gray-500 mb-0.5">인쇄방법</label>
              <select
                value={row.print_method_id}
                onChange={(e) => onMethodChange(row.tempId, e.target.value)}
                className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px]"
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
              <label className="block text-[9px] text-gray-500 mb-0.5">크기</label>
              <select
                value={row.factory_pricing_row_id ?? ''}
                onChange={(e) => onSizeChange(row.tempId, e.target.value)}
                disabled={!row.print_method_id}
                className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px] disabled:bg-gray-100"
              >
                <option value="">선택</option>
                {sizeOptionsFor(row.print_method_id).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.size}
                    {p.pricing_model === 'bulk' ? ' (bulk)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[9px] text-gray-500 mb-0.5">갯수</label>
              <input
                type="number"
                min="0"
                value={row.applied_quantity}
                onChange={(e) => onQuantityChange(row.tempId, e.target.value)}
                onBlur={() => onBlurSave(row.tempId)}
                placeholder={String(itemQuantity)}
                className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px]"
              />
            </div>
            <div className="col-span-3">
              <label className="block text-[9px] text-gray-500 mb-0.5">단가/개</label>
              <input
                type="number"
                min="0"
                value={row.factory_unit_price}
                onChange={(e) => onUnitPriceChange(row.tempId, e.target.value)}
                onBlur={() => onBlurSave(row.tempId)}
                className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px]"
              />
            </div>
            <div className="col-span-1 flex items-end justify-end">
              <button
                type="button"
                onClick={() => removeRow(row.tempId)}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
                title="삭제"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-4">
              <label className="block text-[9px] text-gray-500 mb-0.5">추가금액</label>
              <input
                type="number"
                value={row.additional_amount}
                onChange={(e) => onAdditionalChange(row.tempId, e.target.value)}
                onBlur={() => onBlurSave(row.tempId)}
                placeholder="0"
                className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px]"
              />
            </div>
            <div className="col-span-7">
              <label className="block text-[9px] text-gray-500 mb-0.5">합계</label>
              <input
                type="number"
                value={row.factory_total}
                onChange={(e) => onTotalChange(row.tempId, e.target.value)}
                onBlur={() => onBlurSave(row.tempId)}
                className="w-full px-1.5 py-1 border border-gray-300 rounded text-[11px] font-semibold"
              />
            </div>
            <div className="col-span-1 flex items-end justify-end text-[9px] text-gray-400">
              {row.saving ? '저장중' : row.dbId ? '저장됨' : ''}
            </div>
          </div>
        </div>
      ))}

      {rows.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 text-[11px] text-emerald-900 flex justify-between">
          <span>합계 (마진 반영)</span>
          <b>{totalSum.toLocaleString()} 원</b>
        </div>
      )}
    </div>
  );
}
