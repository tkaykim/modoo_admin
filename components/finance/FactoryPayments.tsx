'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Wallet, Check } from 'lucide-react';

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
  pending_amount: number;
  pending_count: number;
  paid_amount: number;
  paid_count: number;
  total_count: number;
};

const won = (n: number) => `${Math.round(n || 0).toLocaleString('ko-KR')}원`;
const payLabel = (s: string | null) => (s === 'completed' ? '지급완료' : s === 'cancelled' ? '취소' : '미지급');

export default function FactoryPayments() {
  const [items, setItems] = useState<PayItem[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'completed' | 'all'>('pending');
  const [factoryId, setFactoryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (status !== 'all') qs.set('status', status);
      if (factoryId) qs.set('factoryId', factoryId);
      const res = await fetch(`/api/admin/factory-payments?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '조회에 실패했습니다.');
      setItems(json.data.items || []);
      setSummary(json.data.summary || []);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [status, factoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPending = useMemo(() => summary.reduce((s, f) => s + f.pending_amount, 0), [summary]);
  const totalPaid = useMemo(() => summary.reduce((s, f) => s + f.paid_amount, 0), [summary]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  };

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

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-6 w-6 text-amber-700" />
        <h1 className="text-xl font-bold">공장 지급 관리</h1>
      </div>

      {/* 전체 요약 */}
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

      {/* 공장별 카드 (클릭하면 해당 공장만 필터) */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFactoryId(null)}
          className={`rounded-lg border px-3 py-1.5 text-sm ${!factoryId ? 'border-amber-500 bg-amber-50 font-semibold text-amber-800' : 'border-gray-200 bg-white text-gray-600'}`}
        >
          전체 공장
        </button>
        {summary.map((f) => (
          <button
            key={f.factory_id}
            onClick={() => setFactoryId(f.factory_id)}
            className={`rounded-lg border px-3 py-1.5 text-left text-sm ${factoryId === f.factory_id ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white'}`}
          >
            <span className="font-medium text-gray-900">{f.factory_name}</span>{' '}
            <span className="text-amber-700">{won(f.pending_amount)}</span>
            <span className="text-xs text-gray-400"> · 미지급 {f.pending_count}건</span>
          </button>
        ))}
      </div>

      {/* 필터 + 일괄 처리 */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3">
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="rounded border px-2 py-1 text-sm">
          <option value="pending">미지급</option>
          <option value="completed">지급완료</option>
          <option value="all">전체</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">지급일</span>
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="rounded border px-2 py-1 text-sm" />
          <button
            onClick={() => mark([...selected], 'completed')}
            disabled={saving || selected.size === 0}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            선택 지급완료 ({selected.size})
          </button>
          <button
            onClick={() => mark([...selected], 'pending')}
            disabled={saving || selected.size === 0}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            미지급으로
          </button>
        </div>
      </div>

      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 불러오는 중...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-gray-50 p-8 text-center text-sm text-gray-500">해당 조건의 지급 건이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="p-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                <th className="p-2 text-left">공장</th>
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
              {items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="p-2 text-center"><input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} /></td>
                  <td className="p-2">{it.factory_name}</td>
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
        </div>
      )}

      <p className="mt-3 text-xs text-gray-400">
        지급 대상 = 공장 배정 + 정산단가 입력된 건. 🔒는 관리자 정산 확정(잠금)된 건입니다.
        지급 상태/지급일은 공장 지급 관리용이며 고객 결제와 무관합니다.
      </p>
    </div>
  );
}
