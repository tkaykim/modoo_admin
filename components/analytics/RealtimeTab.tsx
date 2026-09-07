'use client';

import useSWR from 'swr';
import { Activity, Globe2 } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';

type RealtimeData = {
  total: number;
  byCountry: { country: string; activeUsers: number }[];
};

const num = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

export default function RealtimeTab({ active = true }: { active?: boolean }) {
  const { data: payload, error, isLoading } = useSWR<RealtimeData>(
    '/api/admin/analytics/ga4/realtime',
    fetcher,
    { refreshInterval: active ? 30000 : 0, revalidateOnFocus: active, isPaused: () => !active },
  );
  const now = new Date();
  const updatedAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-emerald-700 text-xs">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          LIVE
        </span>
        <span className="text-[11px] text-gray-400">30초마다 자동 갱신 · 마지막 업데이트 {updatedAt}</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded">{error.message}</div>}
      {isLoading && !payload && <div className="text-sm text-gray-500">로딩 중...</div>}

      {payload && (
        <>
          <section className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-md p-6">
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium opacity-90">현재 활성 사용자</span>
            </div>
            <div className="text-5xl font-bold">{num(payload.total)}</div>
            <div className="text-xs opacity-75 mt-2">최근 30분 내 활동 (GA4 Realtime)</div>
          </section>

          <section className="bg-white border border-gray-200 rounded-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe2 className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-800">국가별 분포</h2>
            </div>
            {payload.byCountry.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-6">활성 사용자 없음</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[11px] text-gray-500 uppercase">
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1.5">국가</th>
                    <th className="text-right">활성 사용자</th>
                    <th className="text-right">비중</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.byCountry
                    .slice()
                    .sort((a, b) => b.activeUsers - a.activeUsers)
                    .slice(0, 10)
                    .map((c) => {
                      const pct = (c.activeUsers / Math.max(1, payload.total)) * 100;
                      return (
                        <tr key={c.country} className="border-b border-gray-100">
                          <td className="py-2 text-gray-700">{c.country || '(unknown)'}</td>
                          <td className="text-right font-semibold">{num(c.activeUsers)}</td>
                          <td className="text-right text-gray-500 text-xs">{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
