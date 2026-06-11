'use client';

import { useEffect, useMemo, useState } from 'react';
import { Granularity, GRANULARITIES, Period, periodFor, todayKstYmd } from '@/lib/analytics/period';

// 일/주/월/연/기간선택 + ◀▶ 네비게이터. period 가 바뀔 때마다 onChange 로 올려준다.
// 매출 분석 · 광고 효율 등 분석 탭에서 공용으로 사용 → 기간 컨트롤 통일.
export default function PeriodNavigator({
  initialGranularity = 'month',
  onChange,
}: {
  initialGranularity?: Granularity;
  onChange: (p: Period) => void;
}) {
  const [granularity, setGranularity] = useState<Granularity>(initialGranularity);
  const [offset, setOffset] = useState(0);
  const today = todayKstYmd();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  const period = useMemo(
    () => periodFor(granularity, offset, customFrom, customTo),
    [granularity, offset, customFrom, customTo],
  );

  useEffect(() => {
    onChange(period);
    // onChange 는 부모가 useCallback 으로 고정. period 변화 시에만 통지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.fromYmd, period.toYmd, period.bucket]);

  const changeGranularity = (g: Granularity) => {
    setGranularity(g);
    setOffset(0);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 bg-white border border-gray-200 rounded-md p-1">
        {GRANULARITIES.map((g) => (
          <button
            key={g.value}
            onClick={() => changeGranularity(g.value)}
            className={`px-3 py-1 text-xs font-medium rounded ${
              granularity === g.value ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {granularity !== 'custom' && (
        <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-md p-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded leading-none"
            aria-label="이전 기간"
          >
            ◀
          </button>
          <span className="px-2 text-xs font-semibold text-gray-800 text-center min-w-[80px]">{period.label}</span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={period.atCurrent}
            className={`px-2 py-1 rounded leading-none ${
              period.atCurrent ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'
            }`}
            aria-label="다음 기간"
          >
            ▶
          </button>
        </div>
      )}

      {granularity !== 'custom' && offset !== 0 && (
        <button onClick={() => setOffset(0)} className="px-2 py-1 text-xs text-blue-600 hover:underline">
          현재로
        </button>
      )}

      {granularity === 'custom' && (
        <div className="flex items-center gap-1 text-xs">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="border border-gray-300 rounded px-2 py-1" />
          <span>~</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="border border-gray-300 rounded px-2 py-1" />
        </div>
      )}
    </div>
  );
}
