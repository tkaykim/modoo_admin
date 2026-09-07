'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Target, BadgeDollarSign, TrendingUp, MousePointerClick, ShoppingCart, Megaphone } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import PeriodNavigator from '@/components/analytics/PeriodNavigator';
import type { Period } from '@/lib/analytics/period';
import { addDays } from '@/lib/analytics/time';

type Metrics = Record<'spend' | 'impressions' | 'clicks' | 'reach' | 'ctr' | 'cpc' | 'revenue' | 'orders' | 'roas', number | null>;
type Daily = { date: string; spend: number | null; revenue: number | null };
type Payload = {
  range: { from: string; to: string };
  effectiveRange: { from: string; to: string };
  previousRange: { from: string; to: string };
  comparisonRange: { from: string; to: string };
  comparisonCurrent: Metrics;
  comparisonCurrentError: string | null;
  generatedAt: string;
  hasCompleteDays: boolean;
  current: Metrics;
  previous: Metrics;
  daily: Daily[];
  metaError: string | null;
  previousMetaError: string | null;
  dailyMetaError: string | null;
  dbError: string | null;
  previousDbError: string | null;
};
const num = (n: number | null) => n === null ? '미확인' : new Intl.NumberFormat('ko-KR').format(Math.round(n));
const krw = (n: number | null) => n === null ? '미확인' : '₩' + num(n);
const percent = (n: number | null, digits = 0) => n === null ? '계산 불가' : `${n.toFixed(digits)}%`;
const rangeLabel = (range: { from: string; to: string }) => range.from >= range.to ? '완료 일자 없음' : `${range.from} ~ ${addDays(range.to, -1)}`;

function DeltaBadge({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur === null || prev === null) return <span className="text-xs text-gray-500">비교 불가</span>;
  if (prev === 0) return <span className="text-xs text-gray-500">{cur === 0 ? '변동 없음' : '신규 발생'}</span>;
  const delta = (cur - prev) / prev * 100;
  return <span className="text-xs font-medium text-gray-600">{delta > 0 ? '▲' : delta < 0 ? '▼' : '–'} {Math.abs(delta).toFixed(0)}% <span className="font-normal">직전 대비</span></span>;
}

export default function AdEfficiencyTab() {
  const [period, setPeriod] = useState<Period | null>(null);
  const onChange = useCallback((p: Period) => setPeriod(p), []);
  const query = period ? `from=${period.fromYmd}&to=${period.toYmd}` : null;
  const { data, error, isLoading } = useSWR<Payload>(query ? `/api/admin/analytics/ad-efficiency?${query}` : null, fetcher, { revalidateOnFocus: false });
  const c = data?.current;
  const p = data?.previous;
  const cc = data?.comparisonCurrent;
  const warnings = data ? [
    data.metaError && '현재 기간 Meta 요약을 불러오지 못했습니다.',
    data.previousMetaError && '이전 기간 Meta 요약을 불러오지 못해 광고 지표를 비교할 수 없습니다.',
    data.dailyMetaError && '일별 Meta 광고비를 불러오지 못했습니다.',
    data.dbError && '현재 기간 주문매출을 불러오지 못했습니다.',
    data.previousDbError && '이전 기간 주문매출을 불러오지 못해 매출을 비교할 수 없습니다.',
    data.comparisonCurrentError && '공통 경과 일자의 비교 데이터를 불러오지 못했습니다.',
  ].filter(Boolean) : [];
  return (
    <div className="space-y-4">
      <PeriodNavigator initialGranularity="month" onChange={onChange} />
      <p className="text-xs text-gray-600">조회 기간 선택 · 광고비와 매출 모두 어제 마감까지 집계합니다.</p>
      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded">{error.message}</div>}
      {warnings.length > 0 && <div role="status" className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded space-y-1">{warnings.map(warning => <p key={String(warning)}>{warning}</p>)}<p>실패한 값과 관련 비율은 미확인 또는 계산 불가로 표시합니다.</p></div>}
      {isLoading && <div role="status" className="text-sm text-gray-500">불러오는 중...</div>}
      {data && !data.hasCompleteDays && <div className="p-4 rounded border border-gray-200 text-sm text-gray-600">선택한 기간에 마감된 날짜가 없습니다.<br />이전 기간을 선택하면 매출과 광고비를 확인할 수 있습니다.</div>}
      {data && data.hasCompleteDays && c && p && cc && <>
        <div className="rounded bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
          <p>집계: {rangeLabel(data.effectiveRange)} · KST</p>
          <p>증감 비교: {rangeLabel(data.comparisonRange)} ↔ {rangeLabel(data.previousRange)} · 완료된 달은 달력 월 전체, 진행 중인 기간은 공통 경과 일자로 비교</p>
          <p>조회 시각: {new Date(data.generatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi icon={Target} label="Meta 광고비" value={krw(c.spend)} accent="border-l-rose-500" delta={<DeltaBadge cur={cc.spend} prev={p.spend} />} />
          <Kpi icon={BadgeDollarSign} label="전체 확정매출" value={krw(c.revenue)} hint="주문 생성일 기준" accent="border-l-green-500" delta={<DeltaBadge cur={cc.revenue} prev={p.revenue} />} />
          <Kpi icon={TrendingUp} label="전체매출÷Meta 광고비" value={percent(c.roas)} hint="전체 금액의 비율" accent="border-l-emerald-600" delta={<DeltaBadge cur={cc.roas} prev={p.roas} />} />
          <Kpi icon={Megaphone} label="CTR (전체 클릭)" value={percent(c.ctr, 2)} hint={`노출 ${num(c.impressions)}`} accent="border-l-purple-500" delta={<DeltaBadge cur={cc.ctr} prev={p.ctr} />} />
          <Kpi icon={MousePointerClick} label="CPC (전체 클릭)" value={c.cpc === null ? '계산 불가' : krw(c.cpc)} hint={`클릭 ${num(c.clicks)}`} accent="border-l-blue-500" delta={<DeltaBadge cur={cc.cpc} prev={p.cpc} />} />
          <Kpi icon={ShoppingCart} label="유효 결제 주문" value={c.orders === null ? '미확인' : `${num(c.orders)}건`} hint="전체 채널 주문" accent="border-l-indigo-500" delta={<DeltaBadge cur={cc.orders} prev={p.orders} />} />
        </div>
        <div className="text-xs leading-relaxed text-gray-600 bg-gray-50 border border-gray-200 rounded p-3">
          <p>전체 확정매출은 해당 기간에 생성된 주문의 현재 유효 결제금액이며 취소·환불·테스트 주문을 제외합니다.</p>
          <p>전체매출÷Meta 광고비는 사업 매출과 Meta 비용의 비율로, 광고 귀속 ROAS나 이익률을 뜻하지 않습니다.</p>
          <p>기간별 비율은 매출·광고비·클릭·노출 합계로 계산하며, 분모가 0이면 계산하지 않습니다.</p>
        </div>
        <section className="bg-white border border-gray-200 rounded-md p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-2">일별 광고비와 전체 확정매출</h2>
          <p className="text-xs text-gray-600 mb-3">광고비(분홍 막대) · 매출(초록 선) · 동일한 원화 축</p>
          <SpendRevenueChart key={`${data.effectiveRange.from}:${data.effectiveRange.to}`} daily={data.daily} />
        </section>
      </>}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, accent, delta }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string; accent: string; delta?: React.ReactNode;
}) {
  return <div className={`min-w-0 bg-white border border-gray-200 border-l-4 ${accent} rounded-md p-3`}>
    <div className="flex items-start justify-between gap-1"><span className="text-xs font-medium text-gray-600">{label}</span><Icon className="w-4 h-4 shrink-0 text-gray-400" /></div>
    <div className="mt-1 text-lg font-bold text-gray-900 break-all">{value}</div>
    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">{hint && <span className="text-xs text-gray-500">{hint}</span>}{delta}</div>
  </div>;
}

const PAD = { l: 70, r: 20, t: 20, b: 35 };
function SpendRevenueChart({ daily }: { daily: Daily[] }) {
  const [selected, setSelected] = useState(0);
  const W = Math.max(680, daily.length * 18);
  const H = 250;
  const chart = useMemo(() => {
    const max = Math.max(1, ...daily.flatMap(d => [d.spend ?? 0, d.revenue ?? 0]));
    const step = (W - PAD.l - PAD.r) / Math.max(1, daily.length);
    const x = (i: number) => PAD.l + step * (i + 0.5);
    const y = (v: number) => H - PAD.b - v / max * (H - PAD.t - PAD.b);
    const path = daily.map((d, i) => d.revenue === null ? '' : `${i === 0 || daily[i - 1].revenue === null ? 'M' : 'L'} ${x(i)} ${y(d.revenue)}`).join(' ');
    return { max, step, x, y, path };
  }, [daily, W]);
  if (daily.length === 0) return <p className="text-sm text-gray-500 py-6">완료된 날짜가 없습니다.</p>;
  const active = daily[Math.min(selected, daily.length - 1)];
  const labelEvery = Math.max(1, Math.ceil(daily.length / Math.max(8, W / 90)));
  return <div className="space-y-3">
    <div className="overflow-x-auto rounded focus-visible:outline-2 focus-visible:outline-blue-600" tabIndex={0} role="region" aria-label="일별 광고비와 매출 차트. 왼쪽과 오른쪽 방향키로 날짜를 선택하거나 아래 날짜 선택과 표를 이용하세요." onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setSelected(i => Math.max(0, Math.min(daily.length - 1, i + (event.key === 'ArrowRight' ? 1 : -1))));
    }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="광고비는 막대, 전체 확정매출은 선으로 표시한 동일 원화 축 차트">
        {[0, 1, 2, 3, 4].map(i => {
          const amount = chart.max * i / 4;
          return <g key={i}><line x1={PAD.l} x2={W - PAD.r} y1={chart.y(amount)} y2={chart.y(amount)} stroke="#e2e8f0" /><text x={PAD.l - 8} y={chart.y(amount) + 4} textAnchor="end" fontSize="12" fill="#475569">{amount >= 10000 ? `${+(amount / 10000).toFixed(1)}만` : num(amount)}</text></g>;
        })}
        {daily.map((d, i) => d.spend !== null && <rect key={d.date} x={chart.x(i) - chart.step * 0.3} y={chart.y(d.spend)} width={chart.step * 0.6} height={H - PAD.b - chart.y(d.spend)} fill="#fb7185" />)}
        <path d={chart.path} fill="none" stroke="#047857" strokeWidth="2.5" />
        {daily.map((d, i) => <g key={d.date}>
          {d.revenue !== null && <circle cx={chart.x(i)} cy={chart.y(d.revenue)} r={i === selected ? 4 : 2.5} fill="#fff" stroke="#047857" strokeWidth="2" />}
          {(i % labelEvery === 0 || i === daily.length - 1) && <text x={chart.x(i)} y={H - 12} textAnchor="middle" fontSize="12" fill="#475569">{d.date.slice(5)}</text>}
          <rect x={chart.x(i) - chart.step / 2} y={PAD.t} width={chart.step} height={H - PAD.t - PAD.b} fill={i === selected ? '#0f172a08' : 'transparent'} onPointerEnter={() => setSelected(i)} onClick={() => setSelected(i)} />
        </g>)}
      </svg>
    </div>
    <div className="flex flex-wrap gap-2 items-center text-sm">
      <label className="flex gap-2 items-center">상세 날짜<select value={active.date} onChange={e => setSelected(daily.findIndex(d => d.date === e.target.value))} className="border border-gray-300 rounded px-2 py-1.5">{daily.map(d => <option key={d.date} value={d.date}>{d.date}</option>)}</select></label>
      <span aria-live="polite">광고비 {krw(active.spend)} · 매출 {krw(active.revenue)}</span>
    </div>
    <details>
      <summary className="cursor-pointer text-sm font-medium text-blue-700 py-2">일별 금액과 데이터 상태 표 보기</summary>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <caption className="sr-only">한국시간 일별 Meta 광고비와 주문 생성일 기준 전체 확정매출</caption>
          <thead className="bg-gray-50"><tr>{['날짜 (KST)', 'Meta 광고비', '전체 확정매출', '전체매출÷Meta 광고비', '상태'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
          <tbody>{daily.map(d => <tr key={d.date} className="border-t border-gray-100"><th scope="row" className="p-2 font-normal">{d.date}</th><td className="p-2">{krw(d.spend)}</td><td className="p-2">{krw(d.revenue)}</td><td className="p-2">{percent(d.spend !== null && d.spend > 0 && d.revenue !== null ? d.revenue / d.spend * 100 : null)}</td><td className="p-2">{d.spend === null || d.revenue === null ? '조회 실패' : '조회 완료'}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  </div>;
}
