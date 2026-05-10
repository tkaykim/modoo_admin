'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Save, Play } from 'lucide-react';
import type { GradePolicy } from '@/lib/salesmen';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('failed');
  return res.json();
};

export default function GradePolicyForm() {
  const { data, mutate } = useSWR<{ policy: GradePolicy }>('/api/admin/grade-policy', fetcher);
  const [draft, setDraft] = useState<Partial<GradePolicy>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reevalResult, setReevalResult] = useState<string | null>(null);

  useEffect(() => {
    if (data?.policy) setDraft(data.policy);
  }, [data?.policy]);

  const setField = <K extends keyof GradePolicy>(k: K, v: GradePolicy[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/grade-policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '저장 실패');
      }
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const reevaluate = async (dryRun: boolean) => {
    setReevalResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/salesmen/reevaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '재평가 호출 실패');
      const summary = `${dryRun ? '[Dry-run] ' : ''}대상 ${payload.evaluated ?? 0}명, 결과 ${
        Array.isArray(payload.results) ? payload.results.length : 0
      }건. 액션 분포: ${actionSummary(payload.results ?? [])}`;
      setReevalResult(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : '재평가 호출 실패');
    }
  };

  if (!data?.policy) {
    return <div className="text-xs text-gray-500">정책을 불러오는 중...</div>;
  }

  return (
    <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">재평가 정책</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">
          매월 1일 자동 재평가에 적용됩니다. 변경 즉시 다음 평가부터 반영.
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          ※ 휴면/이탈 상태는 자동 전환되지 않습니다. 임계는 목록 경고 표시 용도이며, 상태 변경은
          관리자가 영업사원 상세에서 수동으로 진행합니다.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-800">{error}</div>
      )}
      {reevalResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-xs text-blue-800">
          {reevalResult}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <NumberField
          label="평가 윈도우 (개월)"
          value={draft.evaluation_window_months ?? 3}
          onChange={(v) => setField('evaluation_window_months', v)}
          min={1}
          max={12}
          help="이 기간의 월매출 평균으로 등급 판정"
        />
        <NumberField
          label="강등 grace (회)"
          value={draft.demotion_grace_periods ?? 1}
          onChange={(v) => setField('demotion_grace_periods', v)}
          min={0}
          max={6}
          help="유지기준 미달 N회까지 유예 후 강등"
        />
        <NumberField
          label="강등 최대 단계"
          value={draft.demotion_max_steps ?? 1}
          onChange={(v) => setField('demotion_max_steps', v)}
          min={0}
          max={10}
          help="0=강등 비활성"
        />
        <NumberField
          label="수동 변경 잠금 (개월)"
          value={draft.manual_lock_months ?? 3}
          onChange={(v) => setField('manual_lock_months', v)}
          min={0}
          max={24}
          help="관리자가 등급 수동 변경 시 자동 재평가 면제 기간"
        />
        <NumberField
          label="비활동 경고 임계 (개월)"
          value={draft.dormant_inactive_months ?? 3}
          onChange={(v) => setField('dormant_inactive_months', v)}
          min={1}
          max={24}
          help="이 기간 무매출이면 목록에 노란 경고 표시 (자동 상태 변경 X)"
        />
        <NumberField
          label="이탈 위험 임계 (개월)"
          value={draft.churned_inactive_months ?? 6}
          onChange={(v) => setField('churned_inactive_months', v)}
          min={1}
          max={36}
          help="이 기간 무매출이면 목록에 빨간 경고 표시 (자동 상태 변경 X)"
        />
        <NumberField
          label="기본 유지 비율"
          value={Number((draft.default_maintain_ratio ?? 0.7).toFixed(2))}
          onChange={(v) => setField('default_maintain_ratio', v)}
          min={0}
          max={1}
          step={0.05}
          help="등급별 maintain 미설정 시 승급기준×비율"
        />
        <div className="flex items-center gap-2 mt-5">
          <input
            type="checkbox"
            id="auto_reeval"
            checked={draft.auto_reevaluation_enabled ?? true}
            onChange={(e) => setField('auto_reevaluation_enabled', e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="auto_reeval" className="text-xs text-gray-700">
            자동 재평가 (cron) 활성
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs rounded-md disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? '저장 중...' : '정책 저장'}
        </button>
        <button
          onClick={() => reevaluate(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs rounded-md border border-gray-300"
        >
          <Play className="w-3.5 h-3.5" />
          전체 Dry-run
        </button>
        <button
          onClick={() => {
            if (confirm('전체 영업사원에 대해 즉시 재평가를 적용합니다. 진행할까요?')) {
              reevaluate(false);
            }
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md"
        >
          <Play className="w-3.5 h-3.5" />
          전체 즉시 재평가
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  help?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
      {help && <p className="text-[10px] text-gray-500 mt-0.5">{help}</p>}
    </div>
  );
}

function actionSummary(results: Array<{ action: string }>): string {
  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}
