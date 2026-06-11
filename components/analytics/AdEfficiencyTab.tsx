'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Target, BadgeDollarSign, TrendingUp, MousePointerClick, ShoppingCart, Megaphone } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import PeriodNavigator from '@/components/analytics/PeriodNavigator';
import type { Period } from '@/lib/analytics/period';

type Metrics = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpc: number;
  revenue: number;
  orders: number;
  roas: number;
};

type Payload = {
  range: { from: string; to: string };
  current: Metrics;
  previous: Metrics;
  daily: Array<{ date: string; spend: number; revenue: number }>;
  metaError: string | null;
};

const krw = (n: number) => '₩' + new Intl.NumberFormat('ko-KR').format(Math.round(n));
const num = (n: number) => new Intl.NumberFormat('ko-KR').format(Math.round(n));

function deltaPct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

// good: 이 지표는 오를수록 좋은가. cost 지표(광고비·CPC)는 오르면 빨강.
function DeltaBadge({ cur, prev, goodWhenUp }: { cur: number; prev: number; goodWhenUp: boolean }) {
  const d = deltaPct(cur, prev);
  if (d === null) return <span className="text-[11px] text-gray-400">전기간 0</span>;
  const up = d > 0.05;
  const down = d < -0.05;
  const isGood = (up && goodWhenUp) || (down && !goodWhenUp);
  const isBad = (up && !goodWhenUp) || (down && goodWhenUp);
  const color = isGood ? 'text-emerald-600' : isBad ? 'text-rose-600' : 'text-gray-400';
  const arrow = up ? '▲' : down ? '▼' : '–';
  return (
    <span className={`text-[11px] font-medium ${color}`}>
      {arrow} {Math.abs(d).toFixed(0)}% <span className="text-gray-400">전기간</span>
    </span>
  );
}

export default function AdEfficiencyTab() {
  const [period, setPeriod] = useState<Period | null>(null);
  const onChange = useCallback((p: Period) => setPeriod(p), []);

  const query = period ? `from=${period.fromYmd}&to=${period.toYmd}` : null;
  const { data, error, isLoading } = useSWR<Payload>(
    query ? `/api/admin/analytics/ad-efficiency?${query}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const c = data?.current;
  const p = data?.previous;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodNavigator initialGranularity="week" onChange={onChange} />
        <span className="text-[11px] text-gray-400 ml-auto">{period?.label} · 광고비(Meta)+실매출(DB)</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded">{error.message}</div>}
      {data?.metaError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2.5 rounded">
          ⚠ Meta 광고 데이터 로드 실패 — 매출만 표시됩니다. ({data.metaError})
        </div>
      )}
      {isLoading && <div className="text-sm text-gray-500">로딩 중...</div>}

      {c && p && (
        <>
          {/* 핵심 6지표 + 전기간 대비 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={Target} label="광고비" value={krw(c.spend)} accent="border-l-rose-500" delta={<DeltaBadge cur={c.spend} prev={p.spend} goodWhenUp={false} />} />
            <Kpi icon={BadgeDollarSign} label="실매출 (DB)" value={krw(c.revenue)} hint={`주문 ${num(c.orders)}건`} accent="border-l-green-500" delta={<DeltaBadge cur={c.revenue} prev={p.revenue} goodWhenUp />} />
            <Kpi icon={TrendingUp} label="ROAS" value={c.spend > 0 ? `${c.roas.toFixed(0)}%` : '-'} hint="실매출÷광고비" accent={c.roas >= 100 ? 'border-l-emerald-600' : 'border-l-amber-500'} delta={<DeltaBadge cur={c.roas} prev={p.roas} goodWhenUp />} />
            <Kpi icon={Megaphone} label="CTR" value={`${c.ctr.toFixed(2)}%`} hint={`노출 ${num(c.impressions)}`} accent="border-l-purple-500" delta={<DeltaBadge cur={c.ctr} prev={p.ctr} goodWhenUp />} />
            <Kpi icon={MousePointerClick} label="CPC" value={c.clicks > 0 ? krw(c.cpc) : '-'} hint={`클릭 ${num(c.clicks)}`} accent="border-l-blue-500" delta={<DeltaBadge cur={c.cpc} prev={p.cpc} goodWhenUp={false} />} />
            <Kpi icon={ShoppingCart} label="주문" value={`${num(c.orders)}건`} hint={`클릭당 ${c.clicks > 0 ? (c.orders / c.clicks * 100).toFixed(1) : '0'}%`} accent="border-l-indigo-500" delta={<DeltaBadge cur={c.orders} prev={p.orders} goodWhenUp />} />
          </div>

          <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5">
            ROAS = <b>전체 실매출 ÷ 광고비</b>(광고 단독 기여 아님). modoo는 단체주문 1건이 매출을 크게 흔들므로, 절대값보다 <b>CTR·CPC 추세</b>와 <b>전기간 대비</b>로 보세요.
          </p>

          <section className="bg-white border border-gray-200 rounded-md p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">일자별 광고비 vs 실매출</h2>
            <p className="text-xs text-gray-500 mb-3">광고비(빨강 막대, 좌축) · 실매출(초록 선, 우축)</p>
            <SpendRevenueChart daily={data!.daily} />
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, accent, delta }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  accent: string;
  delta?: React.ReactNode;
}) {
  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${accent} rounded-md p-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="mt-1 text-lg font-bold text-gray-900 truncate">{value}</div>
      <div className="mt-0.5 flex items-center justify-between gap-1">
        {hint ? <span className="text-[11px] text-gray-500 truncate">{hint}</span> : <span />}
        {delta}
      </div>
    </div>
  );
}

function SpendRevenueChart({ daily }: { daily: Array<{ date: string; spend: number; revenue: number }> }) {
  const W = 800;
  const H = 220;
  const PAD = { l: 52, r: 52, t: 10, b: 28 };
  const [hover, setHover] = useState<number | null>(null);

  const computed = useMemo(() => {
    const n = daily.length;
    const maxSpend = Math.max(1, ...daily.map((d) => d.spend));
    const maxRev = Math.max(1, ...daily.map((d) => d.revenue));
    const innerW = W - PAD.l - PAD.r;
    const bw = n > 0 ? Math.max(2, (innerW / n) * 0.6) : 0;
    const x = (i: number) => PAD.l + (innerW / Math.max(1, n)) * (i + 0.5);
    const yRev = (v: number) => H - PAD.b - (v / maxRev) * (H - PAD.t - PAD.b);
    const ySpendH = (v: number) => (v / maxSpend) * (H - PAD.t - PAD.b);
    const revPath = daily.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${yRev(d.revenue)}`).join(' ');
    const ticksRev = Array.from({ length: 4 }, (_, i) => (maxRev * (i + 1)) / 4);
    const ticksSpend = Array.from({ length: 4 }, (_, i) => (maxSpend * (i + 1)) / 4);
    return { n, maxSpend, maxRev, bw, x, yRev, ySpendH, revPath, ticksRev, ticksSpend, innerW };
  }, [daily]);

  if (daily.length === 0) return <div className="text-sm text-gray-400 text-center py-8">데이터 없음</div>;

  const labelEvery = Math.max(1, Math.ceil(daily.length / 8));
  const krwShort = (v: number) => (v >= 10000 ? `${Math.round(v / 10000)}만` : num(v));

  return (
    <div className="overflow-x-auto relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56" onMouseLeave={() => setHover(null)}>
        {/* y grid (revenue, right) */}
        {computed.ticksRev.map((t, i) => (
          <g key={`r${i}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={computed.yRev(t)} y2={computed.yRev(t)} stroke="#f1f5f9" />
            <text x={W - PAD.r + 5} y={computed.yRev(t) + 3} fontSize="9" fill="#059669">{krwShort(t)}</text>
          </g>
        ))}
        {/* spend axis labels (left) */}
        {computed.ticksSpend.map((t, i) => (
          <text key={`s${i}`} x={PAD.l - 6} y={H - PAD.b - computed.ySpendH(t) + 3} textAnchor="end" fontSize="9" fill="#e11d48">{krwShort(t)}</text>
        ))}
        {/* spend bars */}
        {daily.map((d, i) => (
          <rect
            key={i}
            x={computed.x(i) - computed.bw / 2}
            y={H - PAD.b - computed.ySpendH(d.spend)}
            width={computed.bw}
            height={computed.ySpendH(d.spend)}
            fill={hover === i ? '#be123c' : '#fb7185'}
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {/* revenue line */}
        <path d={computed.revPath} fill="none" stroke="#059669" strokeWidth="2.5" />
        {daily.map((d, i) => (
          <circle key={i} cx={computed.x(i)} cy={computed.yRev(d.revenue)} r={hover === i ? 4 : 2.5} fill="#fff" stroke="#059669" strokeWidth="2" />
        ))}
        {/* x labels */}
        {daily.map((d, i) => (i % labelEvery === 0 ? (
          <text key={i} x={computed.x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#64748b">{d.date.slice(5)}</text>
        ) : null))}
        {/* hover overlay */}
        {daily.map((d, i) => (
          <rect key={`h${i}`} x={computed.x(i) - computed.innerW / Math.max(1, computed.n) / 2} y={PAD.t} width={computed.innerW / Math.max(1, computed.n)} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && daily[hover] && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-gray-900/95 text-white text-[11px] rounded-md shadow-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none">
          <div className="font-semibold mb-1">{daily[hover].date}</div>
          <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-rose-400" />광고비<span className="font-medium ml-auto pl-3">{krw(daily[hover].spend)}</span></div>
          <div className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />실매출<span className="font-medium ml-auto pl-3">{krw(daily[hover].revenue)}</span></div>
          <div className="flex items-center gap-1.5 pt-0.5 border-t border-gray-700/60 mt-1"><span className="text-gray-400">ROAS</span><span className="font-medium ml-auto pl-3">{daily[hover].spend > 0 ? Math.round(daily[hover].revenue / daily[hover].spend * 100) + '%' : '-'}</span></div>
        </div>
      )}
    </div>
  );
}
