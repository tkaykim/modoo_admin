'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Wallet, Check, Settings2, ChevronDown, ChevronRight, X, CalendarClock } from 'lucide-react';

type PayItem = {
  id: string;
  order_id: string;
  product_title: string;
  design_title: string | null;
  quantity: number;
  factory_amount: number | null;
  factory_status: string | null;
  factory_payment_status: 'pending' | 'completed' | 'cancelled' | null;
  factory_payment_date: string | null;
  factory_price_locked: boolean | null;
  assigned_manufacturer_id: string;
  deadline: string | null;
  factory_name: string;
};

type Summary = {
  factory_id: string;
  factory_name: string;
  payment_cycle: string;
  payment_day: number | null;
  payment_memo: string | null;
  next_payment_date: string | null;
  pending_amount: number;
  pending_count: number;
  paid_amount: number;
  paid_count: number;
  total_count: number;
};

const won = (n: number) => `${Math.round(n || 0).toLocaleString('ko-KR')}원`;
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const payLabel = (s: string | null) => (s === 'completed' ? '지급완료' : s === 'cancelled' ? '취소' : '미지급');

function cycleLabel(cycle: string, day: number | null): string {
  if (cycle === 'monthly') return `매월 · 익월 ${day ?? 10}일 지급`;
  if (cycle === 'weekly') return `매주 · ${WD[day ?? 5]}요일 지급`;
  if (cycle === 'per_order') return '건별 정산';
  return '수동 정산';
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(dateStr + 'T00:00:00');
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

export default function FactoryPayments() {
  const [items, setItems] = useState<PayItem[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'completed' | 'all'>('pending');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [settingsFor, setSettingsFor] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (status !== 'all') qs.set('status', status);
      const res = await fetch(`/api/admin/factory-payments?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '조회에 실패했습니다.');
      setItems(json.data.items || []);
      setSummary(json.data.summary || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPending = useMemo(() => summary.reduce((s, f) => s + f.pending_amount, 0), [summary]);
  const totalPaid = useMemo(() => summary.reduce((s, f) => s + f.paid_amount, 0), [summary]);
  const itemsByFactory = useMemo(() => {
    const m = new Map<string, PayItem[]>();
    for (const it of items) {
      const arr = m.get(it.assigned_manufacturer_id) || [];
      arr.push(it);
      m.set(it.assigned_manufacturer_id, arr);
    }
    return m;
  }, [items]);

  const toggleExpand = (fid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });

  const mark = async (ids: string[], newStatus: 'completed' | 'pending') => {
    if (ids.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/factory-payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderItemIds: ids,
          factoryPaymentStatus: newStatus,
          factoryPaymentDate: newStatus === 'completed' ? payDate : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '처리에 실패했습니다.');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '처리에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const bulkPayFactory = (fid: string) => {
    const ids = (itemsByFactory.get(fid) || [])
      .filter((it) => it.factory_payment_status !== 'completed')
      .map((it) => it.id);
    if (ids.length === 0) {
      alert('이 공장의 미지급 건이 없습니다.');
      return;
    }
    if (!confirm(`이 공장의 미지급 ${ids.length}건을 ${payDate} 지급완료 처리할까요?`)) return;
    mark(ids, 'completed');
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-amber-700" />
          <h1 className="text-xl font-bold">공장 지급 관리</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">지급일</span>
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="rounded border px-2 py-1 text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="rounded border px-2 py-1 text-sm">
            <option value="pending">미지급만</option>
            <option value="all">전체</option>
            <option value="completed">지급완료만</option>
          </select>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-gray-500">미지급 합계</div>
          <div className="text-lg font-bold text-amber-800">{won(totalPending)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">지급완료 합계</div>
          <div className="text-lg font-bold text-gray-900">{won(totalPaid)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">공장 수</div>
          <div className="text-lg font-bold text-gray-900">{summary.length}곳</div>
        </div>
      </div>

      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 불러오는 중...
        </div>
      ) : summary.length === 0 ? (
        <div className="rounded-lg border bg-gray-50 p-8 text-center text-sm text-gray-500">지급 대상 공장이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {summary.map((f) => {
            const d = daysUntil(f.next_payment_date);
            const due = d !== null && d <= 7; // 임박/지남
            const isOpen = expanded.has(f.factory_id);
            const facItems = itemsByFactory.get(f.factory_id) || [];
            return (
              <div key={f.factory_id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                {/* 헤더 */}
                <div className="flex flex-wrap items-center gap-3 p-3">
                  <button onClick={() => toggleExpand(f.factory_id)} className="flex items-center gap-1.5 text-left">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <span className="font-semibold text-gray-900">{f.factory_name}</span>
                  </button>
                  <span className="text-xs text-gray-500">{cycleLabel(f.payment_cycle, f.payment_day)}</span>
                  {f.next_payment_date && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${due ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600'}`}>
                      <CalendarClock className="h-3 w-3" /> 다음 지급 {f.next_payment_date}
                      {d !== null && <span>({d < 0 ? `${-d}일 지남` : d === 0 ? '오늘' : `${d}일 후`})</span>}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold text-amber-800">{won(f.pending_amount)}</div>
                      <div className="text-[11px] text-gray-400">미지급 {f.pending_count}건 · 완료 {won(f.paid_amount)}</div>
                    </div>
                    <button
                      onClick={() => setSettingsFor(f)}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Settings2 className="h-3.5 w-3.5" /> 주기 설정
                    </button>
                    <button
                      onClick={() => bulkPayFactory(f.factory_id)}
                      disabled={saving || f.pending_count === 0}
                      className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50"
                    >
                      일괄 지급
                    </button>
                  </div>
                </div>

                {/* 펼침: 품목 목록 */}
                {isOpen && (
                  <div className="overflow-x-auto border-t bg-gray-50/50">
                    {facItems.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-400">표시할 건이 없습니다 (필터: {status === 'pending' ? '미지급만' : status === 'completed' ? '지급완료만' : '전체'}).</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-xs text-gray-500">
                          <tr>
                            <th className="p-2 text-left">주문 / 디자인</th>
                            <th className="p-2 text-right">수량</th>
                            <th className="p-2 text-right">정산단가</th>
                            <th className="p-2 text-center">확정</th>
                            <th className="p-2 text-center">지급상태</th>
                            <th className="p-2 text-center">지급일</th>
                            <th className="p-2 text-center">처리</th>
                          </tr>
                        </thead>
                        <tbody>
                          {facItems.map((it) => (
                            <tr key={it.id} className="border-t border-gray-100">
                              <td className="p-2">
                                <div className="font-medium text-gray-900">{it.design_title || it.product_title}</div>
                                <div className="font-mono text-[11px] text-gray-400">{it.order_id}</div>
                              </td>
                              <td className="p-2 text-right">{it.quantity}</td>
                              <td className="p-2 text-right font-medium">{won(Number(it.factory_amount || 0))}</td>
                              <td className="p-2 text-center">{it.factory_price_locked ? <span title="정산 확정">🔒</span> : <span className="text-gray-300">—</span>}</td>
                              <td className="p-2 text-center">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${it.factory_payment_status === 'completed' ? 'bg-green-100 text-green-700' : it.factory_payment_status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {payLabel(it.factory_payment_status)}
                                </span>
                              </td>
                              <td className="p-2 text-center text-xs text-gray-600">{it.factory_payment_date || '-'}</td>
                              <td className="p-2 text-center">
                                {it.factory_payment_status === 'completed' ? (
                                  <button onClick={() => mark([it.id], 'pending')} disabled={saving} className="text-xs text-gray-500 hover:underline disabled:opacity-50">취소</button>
                                ) : (
                                  <button onClick={() => mark([it.id], 'completed')} disabled={saving} className="inline-flex items-center gap-1 rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-black disabled:opacity-50">
                                    <Check className="h-3 w-3" /> 지급완료
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        다음 지급 예정일은 공장별 정산 주기 설정으로 자동 계산됩니다. 임박/지난 공장이 위로 정렬됩니다.
        지급 상태/지급일은 공장 지급 관리용이며 고객 결제와 무관합니다.
      </p>

      {settingsFor && (
        <SettingsModal
          factory={settingsFor}
          onClose={() => setSettingsFor(null)}
          onSaved={() => {
            setSettingsFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SettingsModal({ factory, onClose, onSaved }: { factory: Summary; onClose: () => void; onSaved: () => void }) {
  const [cycle, setCycle] = useState(factory.payment_cycle || 'monthly');
  const [day, setDay] = useState<string>(factory.payment_day != null ? String(factory.payment_day) : '');
  const [memo, setMemo] = useState(factory.payment_memo || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/factory-payments/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factoryId: factory.factory_id,
          paymentCycle: cycle,
          paymentDay: day === '' ? null : Number(day),
          paymentMemo: memo,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '저장에 실패했습니다.');
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">{factory.factory_name} · 정산 주기</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">정산 주기</label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="monthly">매월 정산</option>
              <option value="weekly">매주 정산</option>
              <option value="per_order">건별 정산</option>
              <option value="manual">수동</option>
            </select>
          </div>
          {cycle === 'monthly' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">지급일 (익월 며칠)</label>
              <input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} placeholder="예: 10" className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
          )}
          {cycle === 'weekly' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">지급 요일</label>
              <select value={day} onChange={(e) => setDay(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">선택</option>
                {WD.map((w, i) => (
                  <option key={i} value={i}>{w}요일</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">메모 (선택)</label>
            <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 말마감 익월10일" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-2 border-t px-4 py-3">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">취소</button>
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
