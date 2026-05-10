'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Edit2, Save, X } from 'lucide-react';
import type { GradeLevelRow } from '@/lib/salesmen';
import GradeBadge from './GradeBadge';
import GradePolicyForm from './GradePolicyForm';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('failed');
  return res.json();
};

export default function GradeLevelTable() {
  const { data, isLoading, error, mutate } = useSWR<{ levels: GradeLevelRow[] }>(
    '/api/admin/grade-levels',
    fetcher
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<GradeLevelRow>>({});
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!editing || !data?.levels) return;
    const target = data.levels.find((g) => g.level === editing);
    if (target) {
      setDraft({
        label: target.label,
        commission_rate: target.commission_rate,
        monthly_revenue_threshold: target.monthly_revenue_threshold,
        maintain_threshold: target.maintain_threshold ?? null,
      });
    }
  }, [editing, data?.levels]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/admin/grade-levels/${editing}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '저장 실패');
      }
      await mutate();
      setEditing(null);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-red-600">등급 정보를 불러오지 못했습니다.</p>;
  }

  const levels = data?.levels ?? [];

  return (
    <div className="space-y-4">
      <GradePolicyForm />

      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">등급 정책 (LV0 ~ LV10)</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            승급 기준: 평가 윈도우 평균이 이 값 이상이면 승급. 유지 기준 미달 시 grace 카운트 증가 →
            강등.
          </p>
        </div>

        {errMsg && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-800">
            {errMsg}
          </div>
        )}

        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <Th>등급</Th>
              <Th>레이블</Th>
              <Th align="right">수수료율</Th>
              <Th align="right">승급 기준 (월매출)</Th>
              <Th align="right">유지 기준</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {levels.map((g) => {
              const isEditing = editing === g.level;
              return (
                <tr key={g.level}>
                  <td className="px-4 py-2.5">
                    <GradeBadge grade={g.level} />
                  </td>
                  <td className="px-4 py-2.5 text-sm">
                    {isEditing ? (
                      <input
                        value={draft.label ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                      />
                    ) : (
                      <span className="text-gray-900">{g.label}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.001"
                        min={0}
                        max={1}
                        value={Number(draft.commission_rate ?? 0)}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, commission_rate: Number(e.target.value) }))
                        }
                        className="w-24 px-2 py-1 text-xs border border-gray-300 rounded text-right"
                      />
                    ) : (
                      <span>{(Number(g.commission_rate) * 100).toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        value={Number(draft.monthly_revenue_threshold ?? 0)}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            monthly_revenue_threshold: Number(e.target.value),
                          }))
                        }
                        className="w-32 px-2 py-1 text-xs border border-gray-300 rounded text-right"
                      />
                    ) : (
                      <span>{Number(g.monthly_revenue_threshold).toLocaleString('ko-KR')}원</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        value={Number(draft.maintain_threshold ?? 0)}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            maintain_threshold: Number(e.target.value),
                          }))
                        }
                        className="w-32 px-2 py-1 text-xs border border-gray-300 rounded text-right"
                      />
                    ) : (
                      <span className="text-gray-700">
                        {g.maintain_threshold != null
                          ? `${Number(g.maintain_threshold).toLocaleString('ko-KR')}원`
                          : '기본값'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isEditing ? (
                      <div className="inline-flex gap-1">
                        <button
                          onClick={save}
                          disabled={saving}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-orange-500 hover:bg-orange-600 text-white text-[11px] rounded disabled:opacity-50"
                        >
                          <Save className="w-3 h-3" />
                          저장
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="inline-flex items-center gap-1 px-2 py-1 border border-gray-300 hover:bg-gray-50 text-gray-700 text-[11px] rounded"
                        >
                          <X className="w-3 h-3" />
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditing(g.level)}
                        className="inline-flex items-center gap-1 px-2 py-1 border border-gray-300 hover:bg-gray-50 text-gray-700 text-[11px] rounded"
                      >
                        <Edit2 className="w-3 h-3" />
                        편집
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-4 py-2 text-${align} text-xs font-medium text-gray-500 uppercase tracking-wider`}
    >
      {children}
    </th>
  );
}
