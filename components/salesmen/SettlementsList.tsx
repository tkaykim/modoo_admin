'use client';

import { useState } from 'react';
import useSWR from 'swr';

interface Settlement {
  id: string;
  settlement_period: string;
  gross_revenue: number;
  commission_rate_applied: number;
  commission_amount: number;
  status: 'pending' | 'calculated' | 'paid';
  paid_at: string | null;
  note: string | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('failed');
  return res.json();
};

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  calculated: '미정산',
  paid: '정산완료',
};
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  calculated: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
};

export default function SettlementsList({ salesmanId }: { salesmanId: string }) {
  const { data, mutate, isLoading } = useSWR<{ settlements: Settlement[] }>(
    `/api/admin/salesmen/${salesmanId}/settlements`,
    fetcher
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (period: string, status: 'paid' | 'calculated' | 'pending') => {
    setBusy(period);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/salesmen/${salesmanId}/settlements/${period}/mark-paid`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '상태 변경 실패');
      }
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : '상태 변경 실패');
    } finally {
      setBusy(null);
    }
  };

  const items = data?.settlements ?? [];

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">정산 내역</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="text-xs text-gray-500">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-3">
          정산 기록이 없습니다. (매월 자동 마감 또는 edge function 수동 실행으로 생성)
        </div>
      ) : (
        <table className="w-full text-xs border border-gray-200 rounded-md overflow-hidden">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium text-gray-500">기간</th>
              <th className="px-3 py-1.5 text-right font-medium text-gray-500">매출</th>
              <th className="px-3 py-1.5 text-right font-medium text-gray-500">요율</th>
              <th className="px-3 py-1.5 text-right font-medium text-gray-500">수수료</th>
              <th className="px-3 py-1.5 text-left font-medium text-gray-500">상태</th>
              <th className="px-3 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-1.5 font-mono">{s.settlement_period}</td>
                <td className="px-3 py-1.5 text-right">
                  {Number(s.gross_revenue).toLocaleString('ko-KR')}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {(Number(s.commission_rate_applied) * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-1.5 text-right text-orange-700">
                  {Number(s.commission_amount).toLocaleString('ko-KR')}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full ${
                      STATUS_COLORS[s.status] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right">
                  {s.status !== 'paid' ? (
                    <button
                      onClick={() => setStatus(s.settlement_period, 'paid')}
                      disabled={busy === s.settlement_period}
                      className="px-2 py-0.5 text-[11px] bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
                    >
                      정산완료
                    </button>
                  ) : (
                    <button
                      onClick={() => setStatus(s.settlement_period, 'calculated')}
                      disabled={busy === s.settlement_period}
                      className="px-2 py-0.5 text-[11px] border border-gray-300 hover:bg-gray-50 rounded disabled:opacity-50"
                    >
                      되돌리기
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
