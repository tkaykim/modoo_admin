'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, X, Loader2, Wand2, AlertCircle, Plus, Trash2, MinusCircle, PlusCircle } from 'lucide-react';

type ItemSummary = {
  id: string;
  product_title: string;
  quantity: number;
};

type Suggestion = {
  orderItemId: string;
  suggested_unit_cost: number | null;
  total_qty: number | null;
  matched_qty: number | null;
  existing: { unit_cost: number; cost_source: string } | null;
};

type Adjustment = { amount: string; reason: string };

interface Props {
  items: ItemSummary[];
  onClose: () => void;
  onSuccess: () => void;
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

export default function ConfirmPurchaseOrderModal({ items, onClose, onSuccess }: Props) {
  const [suggestions, setSuggestions] = useState<Map<string, Suggestion>>(new Map());
  const [adjustments, setAdjustments] = useState<Record<string, Adjustment[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const ids = items.map((i) => i.id).join(',');
        const res = await fetch(`/api/admin/purchase-orders/confirm?ids=${ids}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || '단가 조회 실패');
        const map = new Map<string, Suggestion>();
        for (const s of json.data as Suggestion[]) {
          map.set(s.orderItemId, s);
        }
        setSuggestions(map);
      } catch (e: any) {
        setError(e?.message || '로드 실패');
      } finally {
        setLoading(false);
      }
    })();
  }, [items]);

  const getBaseUnitCost = (itemId: string) => {
    const s = suggestions.get(itemId);
    return s?.existing?.unit_cost ?? s?.suggested_unit_cost ?? 0;
  };

  const itemTotal = (itemId: string, qty: number) => {
    const base = Number(getBaseUnitCost(itemId)) * qty;
    const adjSum = (adjustments[itemId] || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
    return base + adjSum;
  };

  const grandTotal = useMemo(() => {
    return items.reduce((s, it) => s + itemTotal(it.id, it.quantity), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, suggestions, adjustments]);

  const allFilled = useMemo(() => {
    for (const it of items) {
      if (getBaseUnitCost(it.id) <= 0 && (adjustments[it.id] || []).length === 0) return false;
      const adjs = adjustments[it.id] || [];
      for (const a of adjs) {
        if (!a.amount || !a.reason.trim()) return false;
      }
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, suggestions, adjustments]);

  const addAdjustment = (itemId: string) => {
    setAdjustments((p) => ({ ...p, [itemId]: [...(p[itemId] || []), { amount: '', reason: '' }] }));
  };
  const updateAdjustment = (itemId: string, idx: number, patch: Partial<Adjustment>) => {
    setAdjustments((p) => {
      const next = [...(p[itemId] || [])];
      next[idx] = { ...next[idx], ...patch };
      return { ...p, [itemId]: next };
    });
  };
  const removeAdjustment = (itemId: string, idx: number) => {
    setAdjustments((p) => {
      const next = [...(p[itemId] || [])];
      next.splice(idx, 1);
      return { ...p, [itemId]: next };
    });
  };

  const submit = async () => {
    setError(null);
    if (!allFilled) {
      setError('조정 행은 금액과 사유를 모두 입력하세요');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        items: items.map((it) => ({
          orderItemId: it.id,
          base_unit_cost: Number(getBaseUnitCost(it.id)),
          adjustments: (adjustments[it.id] || []).map((a) => ({
            amount: Number(a.amount),
            reason: a.reason.trim(),
          })),
        })),
      };
      const res = await fetch('/api/admin/purchase-orders/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '확정 실패');
      onSuccess();
    } catch (e: any) {
      setError(e?.message || '확정 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-600" /> 발주 확정 ({items.length}건)
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 단가표 조회 중...
            </div>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 flex items-start gap-2 text-sm text-blue-900">
                <Wand2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  단가표(<code className="text-xs bg-blue-100 px-1 rounded">product_costs</code>)에서 자동 조회한 매당 단가를 기본으로 사용합니다.
                  필요하면 <b>±금액 조정</b>을 추가해 사유와 함께 기록하세요. 확정 시 발주 상태가 <b>발주완료</b>로 변경됩니다.
                </div>
              </div>

              <div className="space-y-3">
                {items.map((item) => {
                  const sug = suggestions.get(item.id);
                  const base = Number(getBaseUnitCost(item.id));
                  const adjs = adjustments[item.id] || [];
                  const noLookup = sug?.suggested_unit_cost == null && !sug?.existing;
                  const baseTotal = base * item.quantity;
                  const adjSum = adjs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
                  const total = baseTotal + adjSum;

                  return (
                    <div key={item.id} className="border rounded p-3 bg-white">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900 truncate">{item.product_title}</div>
                          <div className="text-xs text-gray-500">총 {item.quantity}개</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-gray-500">발주 금액</div>
                          <div className="font-semibold text-gray-900">{won(total)}</div>
                        </div>
                      </div>

                      {/* 단가표 자동 적용 박스 */}
                      <div className={`rounded px-2 py-1.5 text-xs flex items-center justify-between gap-2 ${noLookup ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'}`}>
                        {noLookup ? (
                          <span className="text-amber-700 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> 단가표에 등록된 가격이 없습니다 — 아래 조정으로 직접 입력하세요</span>
                        ) : (
                          <>
                            <span className="text-blue-900">
                              단가표 적용: <b>{won(base)}/매</b> × {item.quantity}개 = <b>{won(baseTotal)}</b>
                              {sug?.existing && <span className="ml-1 text-gray-500">(기존 등록값)</span>}
                            </span>
                            {sug?.matched_qty != null && sug?.total_qty != null && sug.matched_qty < sug.total_qty && (
                              <span className="text-amber-700 text-[10px]">{sug.total_qty - sug.matched_qty}개 매칭 안됨</span>
                            )}
                          </>
                        )}
                      </div>

                      {/* 조정 행들 */}
                      {adjs.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {adjs.map((a, idx) => {
                            const amtNum = Number(a.amount) || 0;
                            const isPositive = amtNum >= 0;
                            return (
                              <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5">
                                <button
                                  onClick={() => updateAdjustment(item.id, idx, { amount: String(-amtNum) })}
                                  className={`flex items-center gap-0.5 text-xs ${isPositive ? 'text-emerald-700' : 'text-rose-700'}`}
                                  title="부호 토글"
                                >
                                  {isPositive ? <PlusCircle className="w-4 h-4" /> : <MinusCircle className="w-4 h-4" />}
                                </button>
                                <input
                                  type="number"
                                  value={a.amount}
                                  onChange={(e) => updateAdjustment(item.id, idx, { amount: e.target.value })}
                                  placeholder="금액 (음수 가능)"
                                  className="w-32 border rounded px-2 py-1 text-sm"
                                />
                                <span className="text-xs text-gray-400">원</span>
                                <input
                                  type="text"
                                  value={a.reason}
                                  onChange={(e) => updateAdjustment(item.id, idx, { reason: e.target.value })}
                                  placeholder="사유 (예: 시즌 인상분, 불량 보전 차감 등)"
                                  className="flex-1 border rounded px-2 py-1 text-sm"
                                />
                                <button onClick={() => removeAdjustment(item.id, idx)} className="text-gray-400 hover:text-red-500">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <button
                        onClick={() => addAdjustment(item.id)}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> ± 금액 조정 추가
                      </button>

                      {adjSum !== 0 && (
                        <div className="mt-2 text-xs text-gray-600 flex justify-end gap-3">
                          <span>기본 {won(baseTotal)}</span>
                          <span className={adjSum >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {adjSum >= 0 ? '+' : ''}{won(adjSum)}
                          </span>
                          <span className="font-semibold text-gray-900">= {won(total)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex items-center justify-between sticky bottom-0">
          <div>
            <div className="text-xs text-gray-500">총 발주 금액</div>
            <div className="text-lg font-bold text-gray-900">{won(grandTotal)}</div>
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600 mr-2">{error}</span>}
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded">취소</button>
            <button
              onClick={submit}
              disabled={submitting || loading || !allFilled}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} 발주 확정
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
