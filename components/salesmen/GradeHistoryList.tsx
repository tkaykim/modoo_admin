'use client';

import useSWR from 'swr';
import type { GradeChange } from '@/lib/salesmen';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('failed');
  return res.json();
};

const REASON_LABELS: Record<string, string> = {
  initial_registration: '최초 등록',
  manual_change: '수동 변경',
  manual_set: '수동 변경',
  manual_unlock: '잠금 해제',
  admin_override: '관리자 override',
  auto_promote: '자동 승급',
  auto_demote: '자동 강등',
  auto_grace: '유예',
};
const REASON_COLORS: Record<string, string> = {
  initial_registration: 'bg-gray-100 text-gray-700',
  manual_change: 'bg-blue-100 text-blue-800',
  manual_set: 'bg-blue-100 text-blue-800',
  manual_unlock: 'bg-blue-50 text-blue-700',
  admin_override: 'bg-purple-100 text-purple-800',
  auto_promote: 'bg-green-100 text-green-800',
  auto_demote: 'bg-red-100 text-red-800',
  auto_grace: 'bg-yellow-100 text-yellow-800',
};

export default function GradeHistoryList({ salesmanId }: { salesmanId: string }) {
  const { data, isLoading } = useSWR<{ changes: GradeChange[] }>(
    `/api/admin/salesmen/${salesmanId}/grade-changes`,
    fetcher
  );
  const changes = data?.changes ?? [];

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">등급 변경 이력</h3>
      {isLoading ? (
        <div className="text-xs text-gray-500">불러오는 중...</div>
      ) : changes.length === 0 ? (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-3">
          변경 이력이 없습니다.
        </div>
      ) : (
        <ul className="border border-gray-200 rounded-md divide-y max-h-72 overflow-y-auto text-xs">
          {changes.map((c) => (
            <li key={c.id} className="px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full ${
                    REASON_COLORS[c.reason] ?? 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {REASON_LABELS[c.reason] ?? c.reason}
                </span>
                <span className="font-mono text-gray-700">
                  {c.prev_level ?? '-'} → {c.new_level}
                </span>
                <span className="text-gray-500 ml-auto">
                  {new Date(c.changed_at).toLocaleString('ko-KR')}
                </span>
              </div>
              {(c.evaluated_avg_revenue != null || c.evaluation_window_months != null) && (
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {c.evaluation_window_months != null && (
                    <>윈도우 {c.evaluation_window_months}개월 </>
                  )}
                  {c.evaluated_avg_revenue != null && (
                    <>· 평균 {Number(c.evaluated_avg_revenue).toLocaleString('ko-KR')}원</>
                  )}
                  {c.evaluated_periods && c.evaluated_periods.length > 0 && (
                    <> · {c.evaluated_periods.join(', ')}</>
                  )}
                </div>
              )}
              {c.note && <div className="text-[11px] text-gray-600 mt-0.5">{c.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
