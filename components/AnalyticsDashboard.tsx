'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { TrendingUp, TrendingDown, Users, ShoppingCart, MessageSquare, BadgeDollarSign, Ban } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import MarketingTab from '@/components/analytics/MarketingTab';
import RealtimeTab from '@/components/analytics/RealtimeTab';

type RangePreset = 'this_week' | 'this_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom';
type AnalyticsTab = 'sales' | 'marketing' | 'realtime';

type AnalyticsPayload = {
  range: { from: string; to: string; preset: RangePreset };
  visitors: { unique_sessions: number; pageviews: number; note?: string };
  orders: {
    total_count: number;
    paid_count: number;
    paid_revenue: number;
    refunded_count: number;
    refunded_amount: number;
    cancelled_count: number;
    cancelled_amount: number;
    confirmed_revenue: number;
  };
  orders_by_source: {
    homepage: { count: number; paid_revenue: number };
    external: { count: number; paid_revenue: number };
    other: { count: number; paid_revenue: number };
  };
  inquiries_by_source: { dashboard: number; chatbot: number; kakao: number };
  daily_series: Array<{
    date: string;
    label: string;
    visitors: number;
    paid_revenue: number;
    refunded_amount: number;
    cancelled_amount: number;
    confirmed_revenue: number;
    order_count: number;
  }>;
  bucket: 'hour' | 'day' | 'month';
};

type Granularity = 'day' | 'week' | 'month' | 'year' | 'custom';

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
  { value: 'year', label: '연간' },
  { value: 'custom', label: '기간선택' },
];

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// UTC 필드가 KST 민간시각을 나타내는 Date
function kstCivilNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60000);
}
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function isoKst(ymdStr: string): string {
  return `${ymdStr}T00:00:00+09:00`;
}
function mdLabel(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

type Period = {
  fromYmd: string;
  toYmd: string; // exclusive
  bucket: 'hour' | 'day' | 'month';
  label: string;
  atCurrent: boolean;
};

// granularity + offset(0=현재, 음수=과거) → 조회 기간(KST) 계산
function periodFor(g: Granularity, offset: number, customFrom: string, customTo: string): Period {
  const now = kstCivilNow();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (g === 'day') {
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() + offset);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    const label =
      offset === 0 ? '오늘' : offset === -1 ? '어제' : offset === -2 ? '그제'
        : `${mdLabel(from)}(${DOW[from.getUTCDay()]})`;
    return { fromYmd: ymd(from), toYmd: ymd(to), bucket: 'hour', label, atCurrent: offset >= 0 };
  }

  if (g === 'week') {
    const dow = today.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow; // 월요일 시작
    const monday = new Date(today);
    monday.setUTCDate(monday.getUTCDate() + diff + offset * 7);
    const to = new Date(monday);
    to.setUTCDate(to.getUTCDate() + 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const label =
      offset === 0 ? '이번주' : offset === -1 ? '지난주' : offset === -2 ? '2주 전'
        : `${mdLabel(monday)}~${mdLabel(sunday)}`;
    return { fromYmd: ymd(monday), toYmd: ymd(to), bucket: 'day', label, atCurrent: offset >= 0 };
  }

  if (g === 'month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const label =
      offset === 0 ? '이번달' : offset === -1 ? '지난달'
        : from.getUTCFullYear() === now.getUTCFullYear()
          ? `${from.getUTCMonth() + 1}월`
          : `${from.getUTCFullYear()}.${from.getUTCMonth() + 1}`;
    return { fromYmd: ymd(from), toYmd: ymd(to), bucket: 'day', label, atCurrent: offset >= 0 };
  }

  if (g === 'year') {
    const y = now.getUTCFullYear() + offset;
    const from = new Date(Date.UTC(y, 0, 1));
    const to = new Date(Date.UTC(y + 1, 0, 1));
    const label = offset === 0 ? '올해' : offset === -1 ? '작년' : `${y}년`;
    return { fromYmd: ymd(from), toYmd: ymd(to), bucket: 'month', label, atCurrent: offset >= 0 };
  }

  // custom: customTo 를 포함하도록 +1일 exclusive
  const toEx = new Date(`${customTo}T00:00:00Z`);
  toEx.setUTCDate(toEx.getUTCDate() + 1);
  return {
    fromYmd: customFrom,
    toYmd: ymd(toEx),
    bucket: 'day',
    label: `${customFrom} ~ ${customTo}`,
    atCurrent: true,
  };
}

const TABS: { value: AnalyticsTab; label: string }[] = [
  { value: 'sales', label: '매출 분석' },
  { value: 'marketing', label: '마케팅 (GA4)' },
  { value: 'realtime', label: '실시간' },
];

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(Math.round(n)) + '원';
const num = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

function todayKstYmd(): string {
  const d = new Date(Date.now() + 9 * 60 * 60000);
  return d.toISOString().slice(0, 10);
}

function buildQuery(p: Period): string {
  const sp = new URLSearchParams({ preset: 'custom', bucket: p.bucket });
  sp.set('from', isoKst(p.fromYmd));
  sp.set('to', isoKst(p.toYmd));
  return sp.toString();
}

export default function AnalyticsDashboard() {
  const [tab, setTab] = useState<AnalyticsTab>('sales');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-gray-800 mr-2">Analytics</h1>
        <div className="flex bg-white border border-gray-200 rounded-md p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                tab === t.value ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'sales' && <SalesTab />}
      {tab === 'marketing' && <MarketingTab />}
      {tab === 'realtime' && <RealtimeTab />}
    </div>
  );
}

function SalesTab() {
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [offset, setOffset] = useState(0);
  const today = todayKstYmd();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  const period = useMemo(
    () => periodFor(granularity, offset, customFrom, customTo),
    [granularity, offset, customFrom, customTo],
  );
  const query = buildQuery(period);
  const { data, error, isLoading } = useSWR<AnalyticsPayload>(`/api/admin/analytics?${query}`, fetcher);

  const changeGranularity = (g: Granularity) => {
    setGranularity(g);
    setOffset(0);
  };

  return (
    <div className="space-y-4">
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

        <span className="text-[11px] text-gray-400 ml-auto">{period.label} · DB 실주문 기준</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded">{error.message}</div>}
      {isLoading && <div className="text-sm text-gray-500">로딩 중...</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <KpiCard icon={Users} label="유입자수" value={num(data.visitors.unique_sessions)} hint={data.visitors.note ? '수집 시작 후' : `PV ${num(data.visitors.pageviews)}`} accent="border-l-purple-500" />
            <KpiCard icon={ShoppingCart} label="주문 건수" value={num(data.orders.total_count)} hint={`결제 ${num(data.orders.paid_count)} · 취소 ${num(data.orders.cancelled_count)}`} accent="border-l-blue-500" />
            <KpiCard icon={BadgeDollarSign} label="주문 매출액" value={krw(data.orders.paid_revenue)} hint="결제완료 (취소 제외)" accent="border-l-green-500" />
            <KpiCard icon={Ban} label="취소액" value={krw(data.orders.cancelled_amount)} hint={`${num(data.orders.cancelled_count)}건 (주문상태 취소)`} accent="border-l-rose-500" />
            <KpiCard icon={TrendingDown} label="환불액" value={krw(data.orders.refunded_amount)} hint={`${num(data.orders.refunded_count)}건`} accent="border-l-red-500" />
            <KpiCard icon={TrendingUp} label="확정매출액" value={krw(data.orders.confirmed_revenue)} hint="결제 - 환불 (취소 제외)" accent="border-l-emerald-600" />
            <KpiCard icon={MessageSquare} label="문의 합계" value={num(data.inquiries_by_source.dashboard + data.inquiries_by_source.chatbot + data.inquiries_by_source.kakao)} hint="실제 대시+챗봇+카톡" accent="border-l-orange-500" />
          </div>

          <section className="bg-white border border-gray-200 rounded-md p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">확정매출 추이</h2>
            <p className="text-xs text-gray-500 mb-3">주문 매출액(파랑) · 환불액(빨강) · 확정매출액(초록)</p>
            <TrendChart series={data.daily_series} />
          </section>

          <div className="grid lg:grid-cols-2 gap-3">
            <section className="bg-white border border-gray-200 rounded-md p-4">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">경로별 문의수</h2>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100"><td className="py-2 text-gray-700">대시보드 실제 문의</td><td className="text-right font-semibold">{num(data.inquiries_by_source.dashboard)}</td></tr>
                  <tr className="border-b border-gray-100"><td className="py-2 text-gray-700">챗봇 문의</td><td className="text-right font-semibold">{num(data.inquiries_by_source.chatbot)}</td></tr>
                  <tr><td className="py-2 text-gray-700">카카오톡</td><td className="text-right font-semibold text-gray-400">{num(data.inquiries_by_source.kakao)} <span className="text-[10px]">(연동 예정)</span></td></tr>
                </tbody>
              </table>
            </section>

            <section className="bg-white border border-gray-200 rounded-md p-4">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">주문 경로 구분</h2>
              <table className="w-full text-sm">
                <thead className="text-[11px] text-gray-500 uppercase">
                  <tr className="border-b border-gray-100"><th className="text-left py-1.5">경로</th><th className="text-right">건수</th><th className="text-right">결제매출</th></tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 align-top">
                    <td className="py-2 text-gray-700">
                      <div className="font-medium">고객이 직접 디자인, 주문</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">홈페이지/공동구매 (ORD- / COBUY-)</div>
                    </td>
                    <td className="text-right pt-2">{num(data.orders_by_source.homepage.count)}</td>
                    <td className="text-right font-semibold pt-2">{krw(data.orders_by_source.homepage.paid_revenue)}</td>
                  </tr>
                  <tr className="border-b border-gray-100 align-top">
                    <td className="py-2 text-gray-700">
                      <div className="font-medium">관리자가 생성한 주문</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">카카오톡채널, 홈페이지를 보고도 전화문의나 지인소개로 온 것 (ORDER-)</div>
                    </td>
                    <td className="text-right pt-2">{num(data.orders_by_source.external.count)}</td>
                    <td className="text-right font-semibold pt-2">{krw(data.orders_by_source.external.paid_revenue)}</td>
                  </tr>
                  {data.orders_by_source.other.count > 0 && (
                    <tr className="align-top">
                      <td className="py-2 text-gray-700">기타</td>
                      <td className="text-right pt-2">{num(data.orders_by_source.other.count)}</td>
                      <td className="text-right font-semibold pt-2">{krw(data.orders_by_source.other.paid_revenue)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, hint, accent }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  accent: string;
}) {
  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${accent} rounded-md p-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <div className="mt-1 text-lg font-bold text-gray-900 truncate">{value}</div>
      {hint && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function TrendChart({ series }: { series: AnalyticsPayload['daily_series'] }) {
  const W = 800;
  const H = 220;
  const PAD = { l: 50, r: 12, t: 10, b: 28 };
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { paths, ticks, dates } = useMemo(() => {
    if (series.length === 0) return { paths: null, ticks: [] as number[], dates: [] as string[] };
    const maxVal = Math.max(
      1,
      ...series.flatMap((d) => [d.paid_revenue, d.refunded_amount, d.confirmed_revenue]),
    );
    const xStep = (W - PAD.l - PAD.r) / Math.max(1, series.length - 1);
    const yScale = (v: number) => H - PAD.b - ((v / maxVal) * (H - PAD.t - PAD.b));
    const buildPath = (key: 'paid_revenue' | 'refunded_amount' | 'confirmed_revenue') =>
      series
        .map((d, i) => `${i === 0 ? 'M' : 'L'} ${PAD.l + i * xStep} ${yScale(d[key])}`)
        .join(' ');
    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (maxVal * i) / tickCount);
    return {
      paths: {
        paid: buildPath('paid_revenue'),
        refunded: buildPath('refunded_amount'),
        confirmed: buildPath('confirmed_revenue'),
        yScale,
        xStep,
        maxVal,
      },
      ticks,
      dates: series.map((d) => d.label),
    };
  }, [series]);

  if (!paths) return <div className="text-sm text-gray-400 text-center py-8">데이터 없음</div>;

  const labelEvery = Math.max(1, Math.ceil(dates.length / 8));

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    const xInSvg = svgPt.x;
    const relX = xInSvg - PAD.l;
    const rawIdx = Math.round(relX / paths.xStep);
    const clamped = Math.max(0, Math.min(series.length - 1, rawIdx));
    setHoverIdx(clamped);
  };

  const hoverPoint = hoverIdx !== null ? series[hoverIdx] : null;
  const hoverX = hoverIdx !== null ? PAD.l + hoverIdx * paths.xStep : null;

  let tooltipLeftPct = 0;
  if (hoverX !== null && svgRef.current && containerRef.current) {
    const ctm = svgRef.current.getScreenCTM();
    const containerRect = containerRef.current.getBoundingClientRect();
    if (ctm && containerRect.width > 0) {
      const pt = svgRef.current.createSVGPoint();
      pt.x = hoverX;
      pt.y = 0;
      const screenPt = pt.matrixTransform(ctm);
      tooltipLeftPct = ((screenPt.x - containerRect.left) / containerRect.width) * 100;
    } else {
      tooltipLeftPct = (hoverX / W) * 100;
    }
  }
  const tooltipAlignClass =
    tooltipLeftPct < 12
      ? 'translate-x-0'
      : tooltipLeftPct > 88
        ? '-translate-x-full'
        : '-translate-x-1/2';

  return (
    <div className="overflow-x-auto relative" ref={containerRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-56 cursor-crosshair"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {ticks.map((t, i) => {
          const y = paths.yScale(t);
          return (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="#f1f5f9" />
              <text x={PAD.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round(t).toLocaleString('ko-KR')}</text>
            </g>
          );
        })}
        {dates.map((d, i) => i % labelEvery === 0 ? (
          <text key={i} x={PAD.l + i * paths.xStep} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">{d}</text>
        ) : null)}
        <path d={paths.paid} fill="none" stroke="#2563eb" strokeWidth="2" />
        <path d={paths.refunded} fill="none" stroke="#dc2626" strokeWidth="2" />
        <path d={paths.confirmed} fill="none" stroke="#059669" strokeWidth="2.5" />
        {hoverX !== null && hoverPoint && (
          <g pointerEvents="none">
            <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1" />
            <circle cx={hoverX} cy={paths.yScale(hoverPoint.paid_revenue)} r="3.5" fill="#fff" stroke="#2563eb" strokeWidth="2" />
            <circle cx={hoverX} cy={paths.yScale(hoverPoint.refunded_amount)} r="3.5" fill="#fff" stroke="#dc2626" strokeWidth="2" />
            <circle cx={hoverX} cy={paths.yScale(hoverPoint.confirmed_revenue)} r="3.5" fill="#fff" stroke="#059669" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hoverPoint && (
        <div
          className={`absolute pointer-events-none ${tooltipAlignClass} top-1 z-10 bg-gray-900/95 text-white text-[11px] rounded-md shadow-lg px-2.5 py-1.5 whitespace-nowrap`}
          style={{ left: `${tooltipLeftPct}%` }}
        >
          <div className="font-semibold mb-1">{hoverPoint.label}</div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-gray-300">주문매출</span>
              <span className="font-medium ml-auto">{krw(hoverPoint.paid_revenue)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              <span className="text-gray-300">환불액</span>
              <span className="font-medium ml-auto">{krw(hoverPoint.refunded_amount)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-gray-300">확정매출</span>
              <span className="font-medium ml-auto">{krw(hoverPoint.confirmed_revenue)}</span>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5 border-t border-gray-700/60 mt-1">
              <span className="text-gray-400">주문건수</span>
              <span className="font-medium ml-auto">{num(hoverPoint.order_count)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
