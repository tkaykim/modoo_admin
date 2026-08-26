'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Clock3,
  Eye,
  Loader2,
  MessageCircle,
  MousePointerClick,
  QrCode,
  RefreshCw,
  Route,
  Search,
  Smartphone,
  Store,
} from 'lucide-react';

type RangeKey = '7d' | '30d' | '90d' | 'all';

type PerformanceData = {
  range: { key: RangeKey; from: string; to: string };
  tracking: { campaign_started_at: string; interaction_tracking_note: string };
  overview: {
    total_malls: number;
    visited_malls: number;
    unique_visitors: number;
    pageviews: number;
    product_views: number;
    product_view_sessions: number;
    inquiry_clicks: number;
    inquiry_sessions: number;
    order_starts: number;
    order_start_sessions: number;
    checkout_starts: number;
    checkout_sessions: number;
    action_clicks: number;
    engagement_sessions: number;
    avg_active_seconds: number;
    avg_duration_seconds: number;
    avg_clicks_per_session: number;
    no_action_sessions: number;
    orders: number;
    paid_orders: number;
    revenue: number;
    inquiry_rate: number;
    order_rate: number;
  };
  inquiry_breakdown: Record<'header_kakao' | 'header_phone' | 'other_apparel' | 'design_revision' | 'price_negotiation', number>;
  device_breakdown: { mobile: number; desktop: number; tablet: number; unknown: number };
  channel_breakdown: { direct: number; external: number };
  action_breakdown: Array<{ action: string; count: number }>;
  recent_journeys: Array<{
    session_id: string;
    mall_id: string;
    mall_name: string;
    started_at: string;
    last_event_at: string;
    active_seconds: number;
    duration_seconds: number;
    max_scroll_percent: number;
    click_count: number;
    last_action: string | null;
    actions: Array<{ action: string; elapsed_seconds: number | null; occurred_at: string }>;
  }>;
  daily: Array<{
    date: string;
    unique_visitors: number;
    pageviews: number;
    product_views: number;
    inquiry_clicks: number;
    order_starts: number;
    checkout_starts: number;
    orders: number;
    revenue: number;
  }>;
  malls: Array<{
    id: string;
    name: string;
    slug: string | null;
    source_key: string;
    unique_visitors: number;
    pageviews: number;
    product_views: number;
    inquiry_clicks: number;
    inquiry_sessions: number;
    order_starts: number;
    checkout_starts: number;
    action_clicks: number;
    measured_sessions: number;
    avg_active_seconds: number;
    avg_duration_seconds: number;
    avg_scroll_percent: number;
    orders: number;
    paid_orders: number;
    revenue: number;
    inquiry_rate: number;
    order_rate: number;
    last_visit_at: string | null;
  }>;
};

const ranges: Array<{ key: RangeKey; label: string }> = [
  { key: '7d', label: '최근 7일' },
  { key: '30d', label: '최근 30일' },
  { key: '90d', label: '최근 90일' },
  { key: 'all', label: '박람회 전체' },
];

const inquiryLabels: Array<{ key: keyof PerformanceData['inquiry_breakdown']; label: string }> = [
  { key: 'header_kakao', label: '상단 카카오 문의' },
  { key: 'header_phone', label: '상단 전화 문의' },
  { key: 'other_apparel', label: '다른 의류 제작 문의' },
  { key: 'design_revision', label: '디자인 수정 문의' },
  { key: 'price_negotiation', label: '단가 협의 문의' },
];

const number = new Intl.NumberFormat('ko-KR');
const currency = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
const percent = (value: number) => `${(value * 100).toFixed(value > 0 && value < 0.01 ? 1 : 0)}%`;
const duration = (seconds: number) => {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}초`;
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest > 0 ? `${minutes}분 ${rest}초` : `${minutes}분`;
};

function actionLabel(action: string | null): string {
  if (!action) return '클릭 없이 종료';
  if (action.startsWith('product_preview:') || action === 'product_preview') return '상품 상세 열기';
  if (action === 'product_preview_close') return '상품 상세 닫기';
  if (action.startsWith('order_start:') || action === 'order_start') return '주문 시작';
  if (action === 'header_kakao_inquiry') return '상단 카카오 문의';
  if (action === 'header_phone_inquiry') return '전화 문의';
  if (action === 'floating_inquiry:other_apparel') return '다른 의류 제작 문의';
  if (action === 'floating_inquiry:design_revision') return '디자인 수정 문의';
  if (action === 'floating_inquiry:price_negotiation') return '단가 협의 문의';
  if (action.startsWith('text:')) return action.slice(5);
  if (action.startsWith('aria:')) return action.slice(5);
  return action;
}
const kstDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '-';

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

export default function PartnerMallPerformanceDashboard() {
  const [range, setRange] = useState<RangeKey>('all');
  const [data, setData] = useState<PerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/partner-malls/performance?range=${range}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '성과 데이터를 불러오지 못했습니다.');
      setData(result.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '성과 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredMalls = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLocaleLowerCase('ko-KR');
    return query
      ? data.malls.filter((mall) => mall.name.toLocaleLowerCase('ko-KR').includes(query))
      : data.malls;
  }, [data, search]);

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          <p className="font-bold">성과 데이터를 불러오지 못했습니다.</p>
          <p className="mt-1 text-sm">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white">다시 시도</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const overview = data.overview;
  const maxDailyVisitors = Math.max(1, ...data.daily.map((item) => item.unique_visitors));
  const maxInquiry = Math.max(1, ...inquiryLabels.map((item) => data.inquiry_breakdown[item.key]));
  const mobileShare = overview.unique_visitors > 0 ? data.device_breakdown.mobile / overview.unique_visitors : 0;
  const directShare = overview.unique_visitors > 0 ? data.channel_breakdown.direct / overview.unique_visitors : 0;

  const funnel = [
    { label: 'QR·링크 방문', value: overview.unique_visitors, sessions: overview.unique_visitors },
    { label: '상품 상세 확인', value: overview.product_views, sessions: overview.product_view_sessions },
    { label: '주문 수량 선택', value: overview.order_starts, sessions: overview.order_start_sessions },
    { label: '배송지 입력 이동', value: overview.checkout_starts, sessions: overview.checkout_sessions },
    { label: '주문 생성', value: overview.orders, sessions: overview.orders },
  ];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-violet-700">
              <QrCode className="h-4 w-4" />
              제84회 프랜차이즈 박람회
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">오프라인 영업 성과</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              박람회 전용 76개 파트너몰의 방문부터 문의·상품 관심·주문까지 한 화면에서 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {ranges.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${range === item.key ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm leading-6 text-violet-950">
          <p className="font-bold">QR 성과 해석 기준</p>
          <p className="mt-1">파트너몰별 전용 주소 방문을 QR 또는 공유 링크 유입으로 귀속합니다.</p>
          <p>카메라 스캔과 메신저 재공유는 브라우저에서 구분할 수 없어 합산된 추정 성과입니다.</p>
          <p className="mt-1 text-xs text-violet-700">{data.tracking.interaction_tracking_note}</p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard label="방문이 발생한 링크" value={`${overview.visited_malls}/${overview.total_malls}개`} detail="업체별 고유 파트너몰 주소 기준" icon={QrCode} accent="bg-violet-50 text-violet-700" />
          <MetricCard label="링크 유입량" value={`${number.format(overview.unique_visitors)}명`} detail={`${number.format(overview.pageviews)}회 조회`} icon={Eye} accent="bg-blue-50 text-blue-700" />
          <MetricCard label="평균 활성 체류" value={overview.engagement_sessions > 0 ? duration(overview.avg_active_seconds) : '측정 시작'} detail={`${number.format(overview.engagement_sessions)}개 세션 측정 · 숨김 시간 제외`} icon={Clock3} accent="bg-indigo-50 text-indigo-700" />
          <MetricCard label="페이지 내 클릭" value={`${number.format(overview.action_clicks)}회`} detail={overview.engagement_sessions > 0 ? `세션당 평균 ${overview.avg_clicks_per_session.toFixed(1)}회` : '버튼·탭 클릭 순서 기록 중'} icon={MousePointerClick} accent="bg-emerald-50 text-emerald-700" />
          <MetricCard label="문의 버튼 클릭" value={`${number.format(overview.inquiry_clicks)}회`} detail={`${number.format(overview.inquiry_sessions)}명 · 방문 대비 ${percent(overview.inquiry_rate)}`} icon={MessageCircle} accent="bg-amber-50 text-amber-700" />
          <MetricCard label="실제 주문" value={`${number.format(overview.orders)}건`} detail={`결제 완료 ${number.format(overview.paid_orders)}건 · ${currency.format(overview.revenue)}`} icon={Store} accent="bg-cyan-50 text-cyan-700" />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.65fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-5 w-5 text-emerald-700" />
              <h2 className="text-lg font-black text-slate-950">많이 누른 위치</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">파트너몰 안에서 실제로 선택한 버튼과 탭입니다.</p>
            <div className="mt-5 space-y-3">
              {data.action_breakdown.slice(0, 10).map((item, index) => (
                <div key={item.action} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-slate-500 shadow-sm">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{actionLabel(item.action)}</span>
                  <strong className="text-sm text-slate-950">{number.format(item.count)}회</strong>
                </div>
              ))}
              {data.action_breakdown.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                  클릭 경로 추적을 시작했습니다.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <Route className="h-5 w-5 text-violet-700" />
              <h2 className="text-lg font-black text-slate-950">최근 방문 흐름</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">방문자가 어떤 순서로 눌러보고 어느 행동에서 나갔는지 세션별로 보여줍니다.</p>
            <div className="mt-5 max-h-[430px] space-y-3 overflow-y-auto pr-1">
              {data.recent_journeys.slice(0, 30).map((journey) => (
                <div key={`${journey.mall_id}:${journey.session_id}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Link href={`/partner_malls/${journey.mall_id}`} className="text-sm font-black text-slate-900 hover:text-violet-700">{journey.mall_name}</Link>
                      <p className="mt-0.5 text-xs text-slate-400">{kstDateTime(journey.started_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">활성 체류 {journey.active_seconds > 0 ? duration(journey.active_seconds) : '측정 중'}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">클릭 {journey.click_count}회</span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">스크롤 {journey.max_scroll_percent}%</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-600">방문</span>
                    {journey.actions.slice(0, 12).map((item, index) => (
                      <span key={`${item.occurred_at}:${index}`} className="contents">
                        <ArrowRight className="h-3 w-3 text-slate-300" />
                        <span className="rounded-lg bg-violet-50 px-2 py-1 font-semibold text-violet-800">{actionLabel(item.action)}</span>
                      </span>
                    ))}
                    {journey.actions.length === 0 && <><ArrowRight className="h-3 w-3 text-slate-300" /><span className="rounded-lg bg-slate-50 px-2 py-1 text-slate-500">클릭 없이 종료</span></>}
                    <ArrowRight className="h-3 w-3 text-slate-300" />
                    <span className="rounded-lg bg-rose-50 px-2 py-1 font-bold text-rose-700">마지막: {actionLabel(journey.last_action)}</span>
                  </div>
                </div>
              ))}
              {data.recent_journeys.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-500">
                  아직 기간 내 방문 기록이 없습니다.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-5 w-5 text-violet-700" />
              <h2 className="text-lg font-black text-slate-950">방문 전환 퍼널</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">같은 방문자가 여러 번 행동하면 행동 횟수와 세션 수가 다를 수 있습니다.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-5">
              {funnel.map((stage, index) => {
                const width = overview.unique_visitors > 0 ? Math.max(8, (stage.sessions / overview.unique_visitors) * 100) : 0;
                return (
                  <div key={stage.label} className="relative rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold text-slate-500">{index + 1}단계</p>
                    <p className="mt-1 min-h-10 text-sm font-black text-slate-900">{stage.label}</p>
                    <p className="mt-3 text-xl font-black text-slate-950">{number.format(stage.value)}</p>
                    <p className="text-xs text-slate-500">{number.format(stage.sessions)}개 세션</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.min(100, width)}%` }} />
                    </div>
                    {index < funnel.length - 1 && <ArrowRight className="absolute -right-4 top-1/2 z-10 hidden h-4 w-4 text-slate-300 sm:block" />}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-blue-700" />
              <h2 className="text-lg font-black text-slate-950">QR 유입 신호</h2>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-xs font-bold text-blue-700">모바일 방문 비중</p>
                <p className="mt-2 text-2xl font-black text-blue-950">{percent(mobileShare)}</p>
                <p className="mt-1 text-xs text-blue-700">{number.format(data.device_breakdown.mobile)}명</p>
              </div>
              <div className="rounded-xl bg-slate-100 p-4">
                <p className="text-xs font-bold text-slate-600">직접·QR 추정 비중</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{percent(directShare)}</p>
                <p className="mt-1 text-xs text-slate-500">외부 추천 주소가 없는 방문</p>
              </div>
            </div>
            <div className="mt-4 text-xs leading-5 text-slate-500">
              <p>모바일·직접 방문 비중이 높을수록 현장 QR 배포 영향일 가능성이 큽니다.</p>
              <p>정확한 인과 추정은 파트너몰별 방문·문의·주문 흐름을 함께 보세요.</p>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.45fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-black text-slate-950">문의 유형별 클릭</h2>
            <p className="mt-1 text-sm text-slate-500">버튼별 관심사를 확인해 후속 영업 메시지를 정할 수 있습니다.</p>
            <div className="mt-5 space-y-4">
              {inquiryLabels.map((item) => {
                const value = data.inquiry_breakdown[item.key];
                return (
                  <div key={item.key}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="font-semibold text-slate-700">{item.label}</span>
                      <strong className="text-slate-950">{number.format(value)}회</strong>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${(value / maxInquiry) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-black text-slate-950">일자별 반응</h2>
            <p className="mt-1 text-sm text-slate-500">QR 배포일과 후속 연락일을 비교해 반응이 생긴 시점을 확인하세요.</p>
            <div className="mt-5 max-h-80 space-y-3 overflow-y-auto pr-1">
              {data.daily.map((item) => (
                <div key={item.date} className="grid grid-cols-[76px_1fr_auto] items-center gap-3 text-xs">
                  <span className="font-semibold text-slate-500">{item.date.slice(5).replace('-', '.')}</span>
                  <div className="h-7 overflow-hidden rounded-lg bg-slate-100">
                    <div className="flex h-full items-center rounded-lg bg-blue-100 px-2 text-[11px] font-bold text-blue-900" style={{ width: `${Math.max(8, (item.unique_visitors / maxDailyVisitors) * 100)}%` }}>
                      {number.format(item.unique_visitors)}명
                    </div>
                  </div>
                  <span className="min-w-28 text-right text-slate-500">문의 {item.inquiry_clicks} · 주문 {item.orders}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-slate-700" />
                <h2 className="text-lg font-black text-slate-950">파트너몰별 성과</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">방문자가 많은 순서로 76개 박람회 파트너몰을 비교합니다.</p>
            </div>
            <label className="relative block w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="업체명 검색" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1040px] w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left">순위 / 파트너몰</th>
                  <th className="px-4 py-3 text-right">방문자</th>
                  <th className="px-4 py-3 text-right">조회</th>
                  <th className="px-4 py-3 text-right">평균 활성 체류</th>
                  <th className="px-4 py-3 text-right">페이지 내 클릭</th>
                  <th className="px-4 py-3 text-right">문의 클릭</th>
                  <th className="px-4 py-3 text-right">주문</th>
                  <th className="px-4 py-3 text-right">결제 매출</th>
                  <th className="px-5 py-3 text-right">최근 방문</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMalls.map((mall) => {
                  const rank = data.malls.findIndex((item) => item.id === mall.id) + 1;
                  return (
                    <tr key={mall.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${rank <= 3 ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-500'}`}>{rank}</span>
                          <div className="min-w-0">
                            <Link href={`/partner_malls/${mall.id}`} className="font-bold text-slate-900 hover:text-violet-700">{mall.name}</Link>
                            <p className="mt-0.5 text-[11px] text-slate-400">{mall.source_key.split(':').at(-1)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-black text-slate-950">{number.format(mall.unique_visitors)}</td>
                      <td className="px-4 py-4 text-right text-slate-600">{number.format(mall.pageviews)}</td>
                      <td className="px-4 py-4 text-right font-bold text-indigo-700">{mall.measured_sessions > 0 ? duration(mall.avg_active_seconds) : '-'}</td>
                      <td className="px-4 py-4 text-right text-slate-600">{number.format(mall.action_clicks)}</td>
                      <td className="px-4 py-4 text-right font-bold text-amber-700">{number.format(mall.inquiry_clicks)}</td>
                      <td className="px-4 py-4 text-right font-bold text-emerald-700">{number.format(mall.orders)}</td>
                      <td className="px-4 py-4 text-right font-bold text-slate-900">{currency.format(mall.revenue)}</td>
                      <td className="px-5 py-4 text-right text-xs text-slate-500">{kstDateTime(mall.last_visit_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredMalls.length === 0 && <p className="p-8 text-center text-sm text-slate-500">검색 결과가 없습니다.</p>}
        </section>
      </div>
    </div>
  );
}
