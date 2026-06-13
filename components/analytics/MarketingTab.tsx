'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Users, MousePointerClick, BadgeDollarSign, ShoppingBag, Megaphone, Target, TrendingUp } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';

type CampaignRow = {
  sessionSource: string;
  sessionMedium: string;
  sessionCampaignName: string;
  sessions: number;
  totalUsers: number;
  conversions: number;
  totalRevenue: number;
};

type FunnelRow = {
  step: string;
  event: string;
  users: number;
  eventCount: number;
  conversionFromTopPct: number;
};

type RevenueByDate = { date: string; totalRevenue: number; transactions: number };
type TrafficDaily = { date: string; sessions: number; totalUsers: number; screenPageViews: number };

type OverviewData = {
  range: { days: number };
  campaigns: CampaignRow[];
  revenueByDate: RevenueByDate[];
  dbRevenueByDate: RevenueByDate[];
  funnel: FunnelRow[];
  trafficDaily: TrafficDaily[];
  summary: {
    totalSessions: number;
    totalUsers: number;
    totalRevenue: number;
    totalTransactions: number;
    dbRevenue: number;
    dbTransactions: number;
    dbNetRevenue?: number;
    dbGrossProfit?: number;
    dbItemCost?: number;
    dbPrintCost?: number;
    paidSessions: number;
    organicSessions: number;
  };
};

type MetaCampaignAgg = {
  campaign_id: string;
  campaign_name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
};

type MetaDaily = { date: string; spend: number; impressions: number; clicks: number };

type MetaInsightsData = {
  range: { days: number; since: string; until: string };
  summary: { spend: number; impressions: number; clicks: number; reach: number };
  byCampaign: MetaCampaignAgg[];
  daily: MetaDaily[];
  rowsCount: number;
};

const PRESETS: { value: number; label: string }[] = [
  { value: 7, label: '7일' },
  { value: 14, label: '14일' },
  { value: 30, label: '30일' },
  { value: 60, label: '60일' },
  { value: 90, label: '90일' },
];

const krw = (n: number) => new Intl.NumberFormat('ko-KR').format(Math.round(n)) + '원';
const num = (n: number) => new Intl.NumberFormat('ko-KR').format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

export default function MarketingTab() {
  const [days, setDays] = useState<number>(30);
  const [paidOnly, setPaidOnly] = useState(false);

  const { data: payload, error, isLoading } = useSWR<OverviewData>(
    `/api/admin/analytics/ga4/overview?days=${days}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const { data: meta, error: metaError, isLoading: metaLoading } = useSWR<MetaInsightsData>(
    `/api/admin/analytics/meta/insights?days=${days}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const campaigns = useMemo(() => {
    if (!payload) return [];
    const list = paidOnly ? payload.campaigns.filter((c) => c.sessionMedium === 'paid') : payload.campaigns;
    return [...list].sort((a, b) => b.sessions - a.sessions);
  }, [payload, paidOnly]);

  // Meta 캠페인 ID → 광고비/클릭/노출 매핑 (캠페인 표에 join)
  const metaSpendByCampaign = useMemo(() => {
    const m = new Map<string, MetaCampaignAgg>();
    meta?.byCampaign.forEach((c) => m.set(c.campaign_id, c));
    return m;
  }, [meta]);

  // ROAS 계산 (DB 실매출 ÷ Meta 총 지출). 실매출 = 결제완료·취소/환불 제외 전체 주문(광고 단독 귀속 아님).
  const totalSpend = meta?.summary.spend ?? 0;
  const dbRevenue = payload?.summary.dbRevenue ?? 0;
  const ga4Revenue = payload?.summary.totalRevenue ?? 0;
  const roasPct = totalSpend > 0 ? (dbRevenue / totalSpend) * 100 : 0;
  // 이익 ROAS·진짜 마진 (실원가 반영) — 매출 ROAS는 원가를 무시하므로 이게 진짜 광고 수익성
  const grossProfit = payload?.summary.dbGrossProfit ?? 0;
  const netRev = payload?.summary.dbNetRevenue ?? dbRevenue;
  const profitRoasPct = totalSpend > 0 ? (grossProfit / totalSpend) * 100 : 0;
  const marginPct = netRev > 0 ? (grossProfit / netRev) * 100 : 0;
  const printPctOfRev = netRev > 0 ? ((payload?.summary.dbPrintCost ?? 0) / netRev) * 100 : 0;
  const itemPctOfRev = netRev > 0 ? ((payload?.summary.dbItemCost ?? 0) / netRev) * 100 : 0;
  const etcPctOfRev = Math.max(0, 100 - marginPct - printPctOfRev - itemPctOfRev);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 bg-white border border-gray-200 rounded-md p-1">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1 text-xs font-medium rounded ${
                days === p.value ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-700 ml-2">
          <input type="checkbox" checked={paidOnly} onChange={(e) => setPaidOnly(e.target.checked)} />
          유료 매체만
        </label>
        <span className="text-[11px] text-gray-400 ml-auto">캐시 30분 · GA4 Data API</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded">{error.message}</div>}
      {isLoading && <div className="text-sm text-gray-500">로딩 중...</div>}

      {payload && (
        <>
          {/* 마케팅 ROI 핵심 지표 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={Target} label="Meta 광고비" value={meta ? krw(meta.summary.spend) : (metaLoading ? '...' : '-')} hint={meta ? `클릭 ${num(meta.summary.clicks)} · 노출 ${num(meta.summary.impressions)}` : (metaError ? 'Meta API 오류' : '연동 중')} accent="border-l-rose-500" />
            <KpiCard icon={BadgeDollarSign} label="실매출 (DB)" value={krw(dbRevenue)} hint={`주문 ${num(payload.summary.dbTransactions)}건 · 취소/환불 제외`} accent="border-l-green-500" />
            <KpiCard icon={TrendingUp} label="ROAS 매출 / 이익" value={meta ? `${roasPct.toFixed(0)}% / ${profitRoasPct.toFixed(0)}%` : '-'} hint={meta && totalSpend > 0 ? '이익ROAS=매출총이익÷광고비 (마진 반영)' : '광고비 데이터 필요'} accent={meta && profitRoasPct >= 100 ? 'border-l-emerald-600' : 'border-l-amber-500'} />
            <KpiCard icon={MousePointerClick} label="평균 CPC" value={meta && meta.summary.clicks > 0 ? krw(meta.summary.spend / meta.summary.clicks) : '-'} hint={meta ? `도달 ${num(meta.summary.reach)}명` : '-'} accent="border-l-blue-500" />
          </div>
          <p className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded px-2.5 py-1.5">
            💰 <b>진짜 마진 {marginPct.toFixed(0)}%</b> (실원가 반영: 인쇄 {printPctOfRev.toFixed(0)}% · 원단 {itemPctOfRev.toFixed(0)}% · 기타 {etcPctOfRev.toFixed(0)}%). 매출 ROAS는 원가를 무시하므로, 증액 판단은 <b>이익 ROAS {profitRoasPct.toFixed(0)}%</b>(광고 1원당 매출총이익) 기준으로 하세요.
          </p>
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
            ⚠ GA4 추정매출 <b>{krw(ga4Revenue)}</b> (GA4 구매이벤트 기준)은 중복·테스트 발화로 부풀려질 수 있어 참고용입니다. 매출 정본은 <b>실매출(DB)</b>이며, ROAS는 전체 실매출÷광고비라 광고 단독 기여가 아닙니다.
          </p>

          {/* GA4 트래픽 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCard icon={Users} label="총 세션" value={num(payload.summary.totalSessions)} hint={`사용자 ${num(payload.summary.totalUsers)}`} accent="border-l-purple-500" />
            <KpiCard icon={MousePointerClick} label="유료 세션" value={num(payload.summary.paidSessions)} hint={`전체 중 ${pct((payload.summary.paidSessions / Math.max(1, payload.summary.totalSessions)) * 100)}`} accent="border-l-blue-500" />
            <KpiCard icon={Megaphone} label="자연 유입" value={num(payload.summary.organicSessions)} hint={`전체 중 ${pct((payload.summary.organicSessions / Math.max(1, payload.summary.totalSessions)) * 100)}`} accent="border-l-emerald-500" />
          </div>

          <section className="bg-white border border-gray-200 rounded-md p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">일자별 트래픽 · 실매출</h2>
            <p className="text-xs text-gray-500 mb-3">세션(파랑, 좌축) · 실매출 DB(초록, 우축)</p>
            <DualAxisChart traffic={payload.trafficDaily} revenue={payload.dbRevenueByDate} />
          </section>

          <section className="bg-white border border-gray-200 rounded-md p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">구매 퍼널</h2>
            <FunnelView rows={payload.funnel} />
          </section>

          <section className="bg-white border border-gray-200 rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">캠페인별 성과 ({campaigns.length}건)</h2>
              <span className="text-[11px] text-gray-400">캠페인 ID는 Meta 광고 ID와 동일 (예: 6910040178646)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[11px] text-gray-500 uppercase bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-2">소스</th>
                    <th className="text-left py-2 px-2">매체</th>
                    <th className="text-left py-2 px-2">캠페인</th>
                    <th className="text-right py-2 px-2">세션</th>
                    <th className="text-right py-2 px-2">전환</th>
                    <th className="text-right py-2 px-2">매출</th>
                    <th className="text-right py-2 px-2">광고비</th>
                    <th className="text-right py-2 px-2">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, i) => {
                    const metaRow = metaSpendByCampaign.get(c.sessionCampaignName);
                    const spend = metaRow?.spend ?? 0;
                    const camRoas = spend > 0 ? (c.totalRevenue / spend) * 100 : null;
                    return (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-1.5 px-2 text-gray-700">{c.sessionSource}</td>
                        <td className="py-1.5 px-2 text-gray-700">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                            c.sessionMedium === 'paid' ? 'bg-blue-100 text-blue-700' :
                            c.sessionMedium === 'organic' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {c.sessionMedium}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-gray-700 font-mono text-[11px]" title={metaRow?.campaign_name || ''}>
                          {metaRow ? <span className="text-gray-900">{metaRow.campaign_name}</span> : c.sessionCampaignName}
                        </td>
                        <td className="py-1.5 px-2 text-right">{num(c.sessions)}</td>
                        <td className="py-1.5 px-2 text-right">{num(c.conversions)}</td>
                        <td className="py-1.5 px-2 text-right font-semibold">{c.totalRevenue > 0 ? krw(c.totalRevenue) : '-'}</td>
                        <td className="py-1.5 px-2 text-right text-rose-600">{spend > 0 ? krw(spend) : '-'}</td>
                        <td className={`py-1.5 px-2 text-right font-semibold ${camRoas === null ? 'text-gray-400' : camRoas >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {camRoas !== null ? `${camRoas.toFixed(0)}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {campaigns.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-gray-400">데이터 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {meta && meta.byCampaign.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-md p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-800">Meta 광고 캠페인 ({meta.byCampaign.length}건)</h2>
                <span className="text-[11px] text-gray-400">{meta.range.since} ~ {meta.range.until}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[11px] text-gray-500 uppercase bg-gray-50">
                    <tr>
                      <th className="text-left py-2 px-2">상태</th>
                      <th className="text-left py-2 px-2">캠페인명</th>
                      <th className="text-right py-2 px-2">노출</th>
                      <th className="text-right py-2 px-2">클릭</th>
                      <th className="text-right py-2 px-2">CTR</th>
                      <th className="text-right py-2 px-2">CPC</th>
                      <th className="text-right py-2 px-2">지출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meta.byCampaign.map((c) => {
                      const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
                      const cpc = c.clicks > 0 ? c.spend / c.clicks : 0;
                      const isActive = c.status === 'ACTIVE';
                      return (
                        <tr key={c.campaign_id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-1.5 px-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                              isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-gray-800">{c.campaign_name}</td>
                          <td className="py-1.5 px-2 text-right">{num(c.impressions)}</td>
                          <td className="py-1.5 px-2 text-right">{num(c.clicks)}</td>
                          <td className="py-1.5 px-2 text-right">{ctr.toFixed(2)}%</td>
                          <td className="py-1.5 px-2 text-right">{cpc > 0 ? krw(cpc) : '-'}</td>
                          <td className="py-1.5 px-2 text-right font-semibold text-rose-600">{krw(c.spend)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {metaError && !meta && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded">
              <div className="font-semibold mb-1">Meta 광고비 데이터 로드 실패</div>
              <div className="font-mono break-all">{metaError.message}</div>
              <div className="mt-1 text-amber-700">.env.local의 META_ACCESS_TOKEN / META_AD_ACCOUNT_ID 설정과 토큰 권한(ads_read)을 확인해주세요.</div>
            </div>
          )}
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

function FunnelView({ rows }: { rows: FunnelRow[] }) {
  if (!rows.length) return <div className="text-sm text-gray-400 text-center py-6">데이터 없음</div>;
  const top = rows[0]?.users || 1;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const pctW = Math.max(2, (r.users / Math.max(1, top)) * 100);
        const drop = i > 0 ? rows[i - 1].conversionFromTopPct - r.conversionFromTopPct : 0;
        return (
          <div key={r.event} className="flex items-center gap-3">
            <div className="w-24 text-xs text-gray-700 truncate">{r.step}</div>
            <div className="flex-1 relative h-7 bg-gray-100 rounded">
              <div
                className="absolute left-0 top-0 h-full rounded bg-gradient-to-r from-blue-500 to-blue-600 flex items-center px-2"
                style={{ width: `${pctW}%` }}
              >
                <span className="text-[11px] text-white font-medium">{num(r.users)}명</span>
              </div>
            </div>
            <div className="w-20 text-right text-xs">
              <div className="font-semibold text-gray-800">{pct(r.conversionFromTopPct)}</div>
              {drop > 0 && i > 0 && <div className="text-[10px] text-rose-500">−{drop.toFixed(1)}%p</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DualAxisChart({ traffic, revenue }: { traffic: TrafficDaily[]; revenue: RevenueByDate[] }) {
  const W = 800;
  const H = 220;
  const PAD = { l: 50, r: 50, t: 10, b: 28 };
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const computed = useMemo(() => {
    const allDates = Array.from(new Set([
      ...traffic.map((t) => t.date),
      ...revenue.map((r) => r.date),
    ])).sort();
    const trafficMap = new Map(traffic.map((t) => [t.date, t]));
    const revenueMap = new Map(revenue.map((r) => [r.date, r]));

    const sessionsArr = allDates.map((d) => trafficMap.get(d)?.sessions ?? 0);
    const usersArr = allDates.map((d) => trafficMap.get(d)?.totalUsers ?? 0);
    const revenueArr = allDates.map((d) => revenueMap.get(d)?.totalRevenue ?? 0);
    const txArr = allDates.map((d) => revenueMap.get(d)?.transactions ?? 0);

    const maxS = Math.max(1, ...sessionsArr);
    const maxR = Math.max(1, ...revenueArr);
    const xStep = (W - PAD.l - PAD.r) / Math.max(1, allDates.length - 1);
    const yLeft = (v: number) => H - PAD.b - (v / maxS) * (H - PAD.t - PAD.b);
    const yRight = (v: number) => H - PAD.b - (v / maxR) * (H - PAD.t - PAD.b);
    const buildPath = (arr: number[], scale: (v: number) => number) =>
      arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${PAD.l + i * xStep} ${scale(v)}`).join(' ');

    const tickCount = 4;
    const ticksLeft = Array.from({ length: tickCount + 1 }, (_, i) => ({
      v: (maxS * i) / tickCount,
      y: yLeft((maxS * i) / tickCount),
    }));
    const ticksRight = Array.from({ length: tickCount + 1 }, (_, i) => ({
      v: (maxR * i) / tickCount,
      y: yRight((maxR * i) / tickCount),
    }));

    const formatDate = (d: string) =>
      d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
    const shortDate = (d: string) =>
      d.length === 8 ? `${d.slice(4, 6)}/${d.slice(6, 8)}` : d.slice(5);

    return {
      rawDates: allDates,
      dates: allDates.map(shortDate),
      fullDates: allDates.map(formatDate),
      sessionsArr,
      usersArr,
      revenueArr,
      txArr,
      sessionsPath: buildPath(sessionsArr, yLeft),
      revenuePath: buildPath(revenueArr, yRight),
      ticksLeft,
      ticksRight,
      xStep,
      yLeft,
      yRight,
    };
  }, [traffic, revenue]);

  if (computed.dates.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">데이터 없음</div>;
  }

  const { dates, fullDates, sessionsArr, usersArr, revenueArr, txArr, sessionsPath, revenuePath, ticksLeft, ticksRight, xStep, yLeft, yRight } = computed;
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
    const relX = svgPt.x - PAD.l;
    const rawIdx = Math.round(relX / xStep);
    const clamped = Math.max(0, Math.min(dates.length - 1, rawIdx));
    setHoverIdx(clamped);
  };

  const hoverX = hoverIdx !== null ? PAD.l + hoverIdx * xStep : null;

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
        {ticksLeft.map((t, i) => (
          <g key={`l${i}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} stroke="#f1f5f9" />
            <text x={PAD.l - 6} y={t.y + 3} textAnchor="end" fontSize="10" fill="#2563eb">{Math.round(t.v).toLocaleString('ko-KR')}</text>
          </g>
        ))}
        {ticksRight.map((t, i) => (
          <text key={`r${i}`} x={W - PAD.r + 6} y={t.y + 3} textAnchor="start" fontSize="10" fill="#059669">{Math.round(t.v).toLocaleString('ko-KR')}</text>
        ))}
        {dates.map((d, i) => i % labelEvery === 0 ? (
          <text key={i} x={PAD.l + i * xStep} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">{d}</text>
        ) : null)}
        <path d={sessionsPath} fill="none" stroke="#2563eb" strokeWidth="2" />
        <path d={revenuePath} fill="none" stroke="#059669" strokeWidth="2" />
        {hoverX !== null && hoverIdx !== null && (
          <g pointerEvents="none">
            <line x1={hoverX} x2={hoverX} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1" />
            <circle cx={hoverX} cy={yLeft(sessionsArr[hoverIdx])} r="3.5" fill="#fff" stroke="#2563eb" strokeWidth="2" />
            <circle cx={hoverX} cy={yRight(revenueArr[hoverIdx])} r="3.5" fill="#fff" stroke="#059669" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hoverIdx !== null && (
        <div
          className={`absolute pointer-events-none ${tooltipAlignClass} top-1 z-10 bg-gray-900/95 text-white text-[11px] rounded-md shadow-lg px-2.5 py-1.5 whitespace-nowrap`}
          style={{ left: `${tooltipLeftPct}%` }}
        >
          <div className="font-semibold mb-1">{fullDates[hoverIdx]}</div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-gray-300">세션</span>
              <span className="font-medium ml-auto">{num(sessionsArr[hoverIdx])}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-300" />
              <span className="text-gray-300">사용자</span>
              <span className="font-medium ml-auto">{num(usersArr[hoverIdx])}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-gray-300">매출</span>
              <span className="font-medium ml-auto">{krw(revenueArr[hoverIdx])}</span>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5 border-t border-gray-700/60 mt-1">
              <span className="text-gray-400">거래</span>
              <span className="font-medium ml-auto">{num(txArr[hoverIdx])}건</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
