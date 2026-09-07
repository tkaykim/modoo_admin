'use client';

import { useEffect, useMemo, useState } from 'react';
import { Granularity, GRANULARITIES, Period, periodFor, todayKstYmd } from '@/lib/analytics/period';
import { validateYmd } from '@/lib/analytics/time';

// 기간 선택은 차트의 집계 단위와 구분한다.
export default function PeriodNavigator({ initialGranularity = 'month', onChange }: {
  initialGranularity?: Granularity;
  onChange: (p: Period) => void;
}) {
  const [granularity, setGranularity] = useState<Granularity>(initialGranularity);
  const [offset, setOffset] = useState(0);
  const today = todayKstYmd();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const customValid = validateYmd(customFrom) && validateYmd(customTo) && customFrom <= customTo && customTo <= today;
  const period = useMemo(() => granularity === 'custom' && !customValid ? null : periodFor(granularity, offset, customFrom, customTo), [granularity, offset, customFrom, customTo, customValid]);
  useEffect(() => { if (period) onChange(period); }, [period, onChange]);
  const labels: Record<Granularity, string> = { day: '하루', week: '한 주', month: '한 달', year: '일 년', custom: '직접 선택' };
  return <div className="flex flex-wrap items-center gap-2 min-w-0">
    <span className="text-xs font-medium text-gray-600">조회 기간</span>
    <div className="flex max-w-full overflow-x-auto gap-1 bg-white border border-gray-200 rounded-md p-1" role="group" aria-label="조회 기간 크기">
      {GRANULARITIES.map(g => <button key={g.value} type="button" aria-pressed={granularity === g.value} onClick={() => { setGranularity(g.value); setOffset(0); }} className={`shrink-0 whitespace-nowrap px-3 py-2 text-xs font-medium rounded ${granularity === g.value ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{labels[g.value]}</button>)}
    </div>
    {granularity !== 'custom' && period && <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-md p-1">
      <button type="button" onClick={() => setOffset(o => o - 1)} className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded leading-none" aria-label="이전 기간">◀</button>
      <span className="px-2 text-xs font-semibold text-gray-800 text-center min-w-[80px] whitespace-nowrap">{period.label}</span>
      <button type="button" onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={period.atCurrent} className={`px-3 py-2 rounded leading-none ${period.atCurrent ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`} aria-label="다음 기간">▶</button>
    </div>}
    {granularity !== 'custom' && offset !== 0 && <button type="button" onClick={() => setOffset(0)} className="px-2 py-2 text-xs text-blue-600 hover:underline">현재로</button>}
    {granularity === 'custom' && <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="flex items-center gap-1">시작일<input type="date" max={customTo || today} value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="min-w-0 border border-gray-300 rounded px-2 py-2" /></label>
      <label className="flex items-center gap-1">종료일<input type="date" min={customFrom || undefined} max={today} value={customTo} onChange={e => setCustomTo(e.target.value)} className="min-w-0 border border-gray-300 rounded px-2 py-2" /></label>
      {!customValid && <p role="status" className="w-full text-red-600">오늘까지의 유효한 시작일과 종료일을 선택해 주세요.</p>}
    </div>}
  </div>;
}
