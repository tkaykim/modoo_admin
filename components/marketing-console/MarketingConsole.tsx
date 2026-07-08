'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  BadgeDollarSign,
  CheckCircle2,
  Clipboard,
  Image as ImageIcon,
  MousePointerClick,
  Pause,
  Play,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';
import { fetcher } from '@/lib/fetcher';

type Overview = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpc: number;
  dbRevenue: number;
  dbOrders: number;
  dbRoas: number;
  metaRevenue: number;
  metaRoas: number;
  utmMetaRevenue: number;
  utmMetaOrders: number;
  activeCampaigns: number;
  activeAds: number;
  pendingActions: number;
};

type ActionPayload = {
  type: 'pause_ad' | 'activate_ad' | 'adset_budget';
  targetId: string;
  dailyBudget?: number;
};

type Recommendation = {
  id: string;
  kind: 'pause_ad' | 'activate_ad' | 'adset_budget' | 'video_brief' | 'review';
  priority: 'high' | 'medium' | 'low';
  title: string;
  targetName: string;
  targetId?: string;
  reason: string;
  expectedImpact: string;
  actionLabel: string;
  action?: ActionPayload;
  brief?: string;
};

type Creative = {
  adId: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaignName: string;
  adSetName: string;
  imageUrl: string | null;
  mediaType: 'image' | 'video' | 'dynamic' | 'unknown';
  hasVideo: boolean;
  message: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  verdict: 'winner' | 'watch' | 'kill' | 'fresh';
  reason: string;
};

type AdSet = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaignName: string;
  dailyBudget: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string | null;
};

type WeeklyPlan = {
  mainKeyword: string;
  keywords: string[];
  angles: string[];
  creativeRequests: string[];
};

type Payload = {
  generatedAt: string;
  range: { since: string; until: string; days: number };
  overview: Overview;
  campaigns: Campaign[];
  adSets: AdSet[];
  creatives: Creative[];
  recommendations: Recommendation[];
  weeklyPlan: WeeklyPlan;
};

const krw = (value: number) => `₩${new Intl.NumberFormat('ko-KR').format(Math.round(value || 0))}`;
const num = (value: number) => new Intl.NumberFormat('ko-KR').format(Math.round(value || 0));
const pct = (value: number) => `${(value || 0).toFixed(0)}%`;
const pct2 = (value: number) => `${(value || 0).toFixed(2)}%`;

const tabs = [
  { id: 'tasks', label: '오늘 할 일' },
  { id: 'creatives', label: '소재 검수' },
  { id: 'upload', label: '소재 업로드' },
  { id: 'campaigns', label: '캠페인' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function MarketingConsole() {
  const [days, setDays] = useState(14);
  const [tab, setTab] = useState<TabId>('tasks');
  const [confirm, setConfirm] = useState<Recommendation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [previewCreative, setPreviewCreative] = useState<Creative | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem('modoo:marketing-console:done');
    if (saved) setDoneIds(JSON.parse(saved) as string[]);
  }, []);

  useEffect(() => {
    if (!previewCreative) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewCreative(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewCreative]);

  const { data, error, isLoading, isValidating, mutate } = useSWR<Payload>(
    `/api/admin/marketing-console?days=${days}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const visibleRecommendations = useMemo(
    () => (data?.recommendations ?? []).filter((item) => !doneIds.includes(item.id)),
    [data?.recommendations, doneIds],
  );

  const topCreatives = useMemo(() => {
    const rows = data?.creatives ?? [];
    return rows.slice(0, 18);
  }, [data?.creatives]);

  const markDone = (id: string) => {
    const next = Array.from(new Set([...doneIds, id]));
    setDoneIds(next);
    window.localStorage.setItem('modoo:marketing-console:done', JSON.stringify(next));
  };

  const executeRecommendation = async (recommendation: Recommendation) => {
    if (!recommendation.action) {
      if (recommendation.brief) {
        await navigator.clipboard.writeText(recommendation.brief);
        setMessage('영상 브리프를 클립보드에 복사했습니다.');
      }
      markDone(recommendation.id);
      setConfirm(null);
      return;
    }

    setBusyId(recommendation.id);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/marketing-console/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true, action: recommendation.action.type, targetId: recommendation.action.targetId, dailyBudget: recommendation.action.dailyBudget }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '실행 실패');
      markDone(recommendation.id);
      setMessage(`${recommendation.actionLabel} 실행이 완료됐습니다.`);
      await mutate();
      setConfirm(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '실행 중 오류가 발생했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const refresh = async () => {
    setMessage(null);
    await mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">마케팅 콘솔</h1>
          <p className="mt-1 text-xs text-gray-500">
            {data ? `${data.range.since} ~ ${data.range.until} · Meta Ads + 주문 DB` : 'Meta Ads + 주문 DB'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
            {[7, 14, 30].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDays(value)}
                className={`px-2.5 py-1 text-xs font-medium rounded ${days === value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {value}일
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isValidating ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</div>}
      {message && <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{message}</div>}
      {isLoading && <div className="rounded-md border border-gray-200 bg-white px-3 py-8 text-center text-sm text-gray-500">불러오는 중...</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Kpi icon={Target} label="광고비" value={krw(data.overview.spend)} hint={`캠페인 ${num(data.overview.activeCampaigns)}개`} />
            <Kpi icon={BadgeDollarSign} label="주문 매출" value={krw(data.overview.dbRevenue)} hint={`주문 ${num(data.overview.dbOrders)}건`} />
            <Kpi icon={TrendingUp} label="실 ROAS" value={pct(data.overview.dbRoas)} hint="DB 매출 기준" tone={data.overview.dbRoas >= 300 ? 'green' : data.overview.dbRoas >= 150 ? 'amber' : 'red'} />
            <Kpi icon={MousePointerClick} label="CTR" value={pct2(data.overview.ctr)} hint={`클릭 ${num(data.overview.clicks)}`} />
            <Kpi icon={Target} label="CPC" value={krw(data.overview.cpc)} hint={`노출 ${num(data.overview.impressions)}`} />
            <Kpi icon={CheckCircle2} label="실행 대기" value={`${num(visibleRecommendations.filter((item) => item.action).length)}건`} hint={`활성 소재 ${num(data.overview.activeAds)}개`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <section className="rounded-md border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">운영 추천</h2>
                  <p className="text-xs text-gray-500">중단·재개·예산 조정은 확인 후 즉시 Meta에 반영됩니다.</p>
                </div>
                <div className="inline-flex rounded-md bg-gray-100 p-0.5">
                  {tabs.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${tab === item.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {tab === 'tasks' && (
                <div className="divide-y divide-gray-100">
                  {visibleRecommendations.map((recommendation) => (
                    <RecommendationRow
                      key={recommendation.id}
                      recommendation={recommendation}
                      busy={busyId === recommendation.id}
                      onDone={() => markDone(recommendation.id)}
                      onConfirm={() => setConfirm(recommendation)}
                    />
                  ))}
                  {visibleRecommendations.length === 0 && (
                    <div className="px-4 py-10 text-center text-sm text-gray-500">오늘 처리할 추천 항목이 없습니다.</div>
                  )}
                </div>
              )}

              {tab === 'creatives' && (
                <div className="grid gap-3 p-4 md:grid-cols-2 2xl:grid-cols-3">
                  {topCreatives.map((creative) => (
                    <CreativeCard
                      key={creative.adId}
                      creative={creative}
                      onPreview={() => setPreviewCreative(creative)}
                      onQuickAction={(recommendation) => setConfirm(recommendation)}
                    />
                  ))}
                </div>
              )}

              {tab === 'upload' && (
                <CreativeUploadPanel
                  adSets={data.adSets}
                  onCreated={async (result) => {
                    setMessage(`${result.mediaType === 'video' ? '영상' : '이미지'} 소재가 PAUSED 광고로 생성됐습니다.`);
                    setTab('creatives');
                    await mutate();
                  }}
                />
              )}

              {tab === 'campaigns' && <CampaignTable campaigns={data.campaigns} adSets={data.adSets} onQuickAction={(recommendation) => setConfirm(recommendation)} />}
            </section>

            <aside className="space-y-4">
              <section className="rounded-md border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-gray-900">이번 주 방향</h2>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{data.weeklyPlan.mainKeyword}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.weeklyPlan.keywords.map((keyword) => (
                    <span key={keyword} className="rounded-full border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700">
                      {keyword}
                    </span>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {data.weeklyPlan.angles.map((angle) => (
                    <div key={angle} className="rounded-md bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-700">
                      {angle}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-md border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-900">소재 요청</h2>
                <div className="mt-3 space-y-2">
                  {data.weeklyPlan.creativeRequests.map((request) => (
                    <div key={request} className="flex items-start gap-2 text-xs text-gray-700">
                      <Video className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span>{request}</span>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          recommendation={confirm}
          busy={busyId === confirm.id}
          onClose={() => setConfirm(null)}
          onConfirm={() => executeRecommendation(confirm)}
        />
      )}

      {previewCreative && (
        <CreativePreviewDialog
          creative={previewCreative}
          onClose={() => setPreviewCreative(null)}
        />
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'gray',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone?: 'gray' | 'green' | 'amber' | 'red';
}) {
  const toneClass = {
    gray: 'text-gray-500',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  }[tone];

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-gray-500">{label}</span>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <div className="mt-1 truncate text-lg font-bold text-gray-900">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-gray-500">{hint}</div>
    </div>
  );
}

function RecommendationRow({
  recommendation,
  busy,
  onDone,
  onConfirm,
}: {
  recommendation: Recommendation;
  busy: boolean;
  onDone: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={recommendation.priority} />
          <span className="text-sm font-semibold text-gray-900">{recommendation.title}</span>
          <span className="truncate text-xs text-gray-500">{recommendation.targetName}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-gray-600">{recommendation.reason}</p>
        <p className="text-xs leading-5 text-gray-500">{recommendation.expectedImpact}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
          확인
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {buttonIcon(recommendation)}
          {busy ? '실행 중' : recommendation.actionLabel}
        </button>
      </div>
    </div>
  );
}

function CreativeCard({
  creative,
  onPreview,
  onQuickAction,
}: {
  creative: Creative;
  onPreview: () => void;
  onQuickAction: (recommendation: Recommendation) => void;
}) {
  const isActive = creative.effectiveStatus === 'ACTIVE';
  const quickAction: Recommendation = isActive
    ? {
        id: `manual-pause:${creative.adId}`,
        kind: 'pause_ad',
        priority: 'medium',
        title: '소재 중단',
        targetName: creative.name,
        targetId: creative.adId,
        reason: creative.reason,
        expectedImpact: '선택한 광고를 Meta에서 PAUSED 상태로 전환합니다.',
        actionLabel: '중단',
        action: { type: 'pause_ad', targetId: creative.adId },
      }
    : {
        id: `manual-activate:${creative.adId}`,
        kind: 'activate_ad',
        priority: 'medium',
        title: '소재 재개',
        targetName: creative.name,
        targetId: creative.adId,
        reason: creative.reason,
        expectedImpact: '선택한 광고를 Meta에서 ACTIVE 상태로 전환합니다.',
        actionLabel: '재개',
        action: { type: 'activate_ad', targetId: creative.adId },
      };

  return (
    <article className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="grid grid-cols-[112px_minmax(0,1fr)]">
        <div className="h-36 bg-gray-100">
          {creative.imageUrl ? (
            <button
              type="button"
              onClick={onPreview}
              aria-label={`${creative.name} 이미지 크게 보기`}
              className="group relative h-full w-full overflow-hidden bg-cover bg-center text-left"
              style={{ backgroundImage: `url("${creative.imageUrl}")` }}
            >
              <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-gray-950/80 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                <ZoomIn className="h-3.5 w-3.5" />
                크게 보기
              </span>
            </button>
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              <ImageIcon className="h-7 w-7" />
            </div>
          )}
        </div>
        <div className="min-w-0 p-3">
          <div className="flex items-center gap-1.5">
            <VerdictBadge verdict={creative.verdict} />
            <StatusBadge status={creative.effectiveStatus} />
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-gray-900">{creative.name}</h3>
          <p className="mt-1 truncate text-[11px] text-gray-500">{creative.campaignName}</p>
          <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
            <Metric label="지출" value={krw(creative.spend)} />
            <Metric label="CTR" value={pct2(creative.ctr)} />
            <Metric label="ROAS" value={pct(creative.roas)} />
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100 px-3 py-2">
        <p className="line-clamp-2 min-h-[2.25rem] text-xs leading-5 text-gray-600">{creative.message || creative.reason}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500">
            {creative.hasVideo ? <Video className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
            {creative.mediaType}
          </span>
          <button type="button" onClick={() => onQuickAction(quickAction)} className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
            {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {isActive ? '중단' : '재개'}
          </button>
        </div>
      </div>
    </article>
  );
}

function CreativePreviewDialog({ creative, onClose }: { creative: Creative; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-gray-950/80 p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${creative.name} 이미지 크게 보기`}
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-md bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <VerdictBadge verdict={creative.verdict} />
              <StatusBadge status={creative.effectiveStatus} />
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
                {creative.hasVideo ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                {creative.mediaType}
              </span>
            </div>
            <h2 className="mt-2 line-clamp-2 text-base font-bold text-gray-900">{creative.name}</h2>
            <p className="mt-0.5 truncate text-xs text-gray-500">{creative.campaignName} · {creative.adSetName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-[58vh] items-center justify-center overflow-auto bg-gray-950 p-3 md:p-5">
            {creative.imageUrl ? (
              <img
                src={creative.imageUrl}
                alt={creative.name}
                className="max-h-[76vh] max-w-full rounded-md bg-white object-contain shadow-xl"
              />
            ) : (
              <div className="flex h-64 w-full max-w-md items-center justify-center rounded-md bg-gray-900 text-gray-500">
                <ImageIcon className="h-10 w-10" />
              </div>
            )}
          </div>

          <aside className="min-h-0 overflow-y-auto border-t border-gray-200 p-4 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="지출" value={krw(creative.spend)} />
              <Metric label="ROAS" value={pct(creative.roas)} />
              <Metric label="CTR" value={pct2(creative.ctr)} />
              <Metric label="CPC" value={krw(creative.cpc)} />
              <Metric label="클릭" value={num(creative.clicks)} />
              <Metric label="구매" value={num(creative.purchases)} />
            </div>

            <div className="mt-4 rounded-md bg-gray-50 px-3 py-2">
              <div className="text-[11px] font-semibold text-gray-500">판정 근거</div>
              <p className="mt-1 text-xs leading-5 text-gray-700">{creative.reason}</p>
            </div>

            <div className="mt-4">
              <div className="text-[11px] font-semibold text-gray-500">광고 카피</div>
              <p className="mt-1 whitespace-pre-wrap rounded-md border border-gray-200 px-3 py-2 text-xs leading-5 text-gray-700">
                {creative.message || '카피 데이터가 없습니다.'}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

type UploadResult = {
  mediaType: 'image' | 'video';
  adId: string;
  creativeId: string;
  status: 'PAUSED';
};

function CreativeUploadPanel({
  adSets,
  onCreated,
}: {
  adSets: AdSet[];
  onCreated: (result: UploadResult) => Promise<void>;
}) {
  const targetAdSets = useMemo(() => {
    const active = adSets.filter((adSet) => adSet.effectiveStatus === 'ACTIVE' || adSet.status === 'ACTIVE');
    return active.length > 0 ? active : adSets;
  }, [adSets]);
  const [adSetId, setAdSetId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [message, setMessage] = useState('');
  const [linkUrl, setLinkUrl] = useState('https://www.modoouniform.com/');
  const [ctaType, setCtaType] = useState('SEE_DETAILS');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adSetId && targetAdSets[0]) setAdSetId(targetAdSets[0].id);
  }, [adSetId, targetAdSets]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const mediaType = file?.type.startsWith('video/') ? 'video' : 'image';

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.files?.[0] ?? null;
    setFile(next);
    setError(null);
    if (next && !name) {
      const baseName = next.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      setName(baseName ? `[신규]${baseName}` : '[신규]소재');
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError('파일을 선택해주세요.');
      return;
    }
    if (!adSetId) {
      setError('대상 광고세트를 선택해주세요.');
      return;
    }
    if (!message.trim()) {
      setError('광고 카피를 입력해주세요.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('confirm', 'true');
      form.set('file', file);
      form.set('adSetId', adSetId);
      form.set('name', name);
      form.set('headline', headline);
      form.set('message', message);
      form.set('linkUrl', linkUrl);
      form.set('ctaType', ctaType);

      const res = await fetch('/api/admin/marketing-console/uploads', { method: 'POST', body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '소재 업로드 실패');
      await onCreated(payload.data as UploadResult);
      setFile(null);
      setName('');
      setHeadline('');
      setMessage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '소재 업로드 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 p-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-gray-700">소재 파일</span>
          <span className="mt-2 flex min-h-[360px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-gray-300 bg-gray-50 text-center hover:border-gray-400 hover:bg-gray-100">
            {previewUrl && file ? (
              mediaType === 'video' ? (
                <video src={previewUrl} controls className="h-full max-h-[420px] w-full bg-black object-contain" />
              ) : (
                <img src={previewUrl} alt={file.name} className="max-h-[420px] w-full object-contain" />
              )
            ) : (
              <span className="flex flex-col items-center gap-2 px-4 text-sm font-medium text-gray-500">
                <Upload className="h-8 w-8 text-gray-400" />
                이미지 또는 영상 선택
              </span>
            )}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
            onChange={onFileChange}
            className="sr-only"
          />
        </label>
        {file && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">{mediaType === 'video' ? 'video' : 'image'}</span>
            <span className="truncate">{file.name}</span>
            <span>{(file.size / 1024 / 1024).toFixed(1)}MB</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">대상 광고세트</span>
            <select
              value={adSetId}
              onChange={(event) => setAdSetId(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            >
              {targetAdSets.map((adSet) => (
                <option key={adSet.id} value={adSet.id}>
                  {adSet.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">CTA</span>
            <select
              value={ctaType}
              onChange={(event) => setCtaType(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            >
              <option value="SEE_DETAILS">자세히 보기</option>
              <option value="LEARN_MORE">더 알아보기</option>
              <option value="CONTACT_US">문의하기</option>
              <option value="SHOP_NOW">구매하기</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">소재명</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="[신규]회사워크샵단체티_0708"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">헤드라인</span>
          <input
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            placeholder="회사 워크샵 단체티, 제작까지 한 번에"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">광고 카피</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={6}
            placeholder={'단체복 제작, 아직 업체 못 정하셨나요?\n로고 시안부터 견적, 제작까지 모두의유니폼에서 빠르게 도와드립니다.'}
            className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">랜딩 URL</span>
          <input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
          />
        </label>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</div>}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="text-xs text-gray-600">
            생성 상태 <span className="font-bold text-gray-900">PAUSED</span>
          </div>
          <button
            type="submit"
            disabled={submitting || targetAdSets.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {submitting ? '생성 중' : 'PAUSED 광고 생성'}
          </button>
        </div>
      </div>
    </form>
  );
}

function CampaignTable({
  campaigns,
  adSets,
  onQuickAction,
}: {
  campaigns: Campaign[];
  adSets: AdSet[];
  onQuickAction: (recommendation: Recommendation) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2 font-semibold">광고세트</th>
            <th className="px-3 py-2 font-semibold">상태</th>
            <th className="px-3 py-2 text-right font-semibold">일예산</th>
            <th className="px-3 py-2 text-right font-semibold">지출</th>
            <th className="px-3 py-2 text-right font-semibold">CTR</th>
            <th className="px-3 py-2 text-right font-semibold">ROAS</th>
            <th className="px-4 py-2 text-right font-semibold">조정</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {adSets.map((adSet) => (
            <tr key={adSet.id} className="align-top">
              <td className="px-4 py-3">
                <div className="max-w-[320px] truncate font-medium text-gray-900">{adSet.name}</div>
                <div className="mt-0.5 max-w-[320px] truncate text-[11px] text-gray-500">{adSet.campaignName}</div>
              </td>
              <td className="px-3 py-3"><StatusBadge status={adSet.effectiveStatus} /></td>
              <td className="px-3 py-3 text-right font-mono text-xs text-gray-700">{krw(adSet.dailyBudget)}</td>
              <td className="px-3 py-3 text-right font-mono text-xs text-gray-700">{krw(adSet.spend)}</td>
              <td className="px-3 py-3 text-right font-mono text-xs text-gray-700">{pct2(adSet.ctr)}</td>
              <td className="px-3 py-3 text-right font-mono text-xs text-gray-700">{pct(adSet.roas)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1.5">
                  <BudgetButton adSet={adSet} direction="down" onQuickAction={onQuickAction} />
                  <BudgetButton adSet={adSet} direction="up" onQuickAction={onQuickAction} />
                </div>
              </td>
            </tr>
          ))}
          {adSets.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                광고세트 데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
        캠페인 {num(campaigns.length)}개 기준입니다.
      </div>
    </div>
  );
}

function BudgetButton({
  adSet,
  direction,
  onQuickAction,
}: {
  adSet: AdSet;
  direction: 'up' | 'down';
  onQuickAction: (recommendation: Recommendation) => void;
}) {
  const dailyBudget = Math.max(10000, Math.min(500000, Math.round(adSet.dailyBudget * (direction === 'up' ? 1.2 : 0.8) / 1000) * 1000));
  const Icon = direction === 'up' ? TrendingUp : TrendingDown;
  return (
    <button
      type="button"
      disabled={!adSet.dailyBudget}
      onClick={() =>
        onQuickAction({
          id: `manual-budget:${adSet.id}:${dailyBudget}`,
          kind: 'adset_budget',
          priority: 'medium',
          title: direction === 'up' ? '광고세트 예산 증액' : '광고세트 예산 감액',
          targetName: adSet.name,
          targetId: adSet.id,
          reason: `현재 일예산 ${krw(adSet.dailyBudget)}에서 ${krw(dailyBudget)}로 조정합니다.`,
          expectedImpact: '선택한 광고세트 예산이 Meta에 즉시 반영됩니다.',
          actionLabel: direction === 'up' ? '증액' : '감액',
          action: { type: 'adset_budget', targetId: adSet.id, dailyBudget },
        })
      }
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-3.5 w-3.5" />
      {direction === 'up' ? '+20%' : '-20%'}
    </button>
  );
}

function ConfirmDialog({
  recommendation,
  busy,
  onClose,
  onConfirm,
}: {
  recommendation: Recommendation;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-md rounded-md bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">{recommendation.title}</h2>
          <p className="mt-1 text-xs text-gray-500">{recommendation.targetName}</p>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="rounded-md bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-700">{recommendation.reason}</div>
          <div className="text-sm leading-6 text-gray-600">{recommendation.expectedImpact}</div>
          {recommendation.action?.type === 'adset_budget' && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              새 일예산은 {krw(recommendation.action.dailyBudget ?? 0)}입니다.
            </div>
          )}
          {recommendation.action && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              이 작업은 Meta 광고관리자에 즉시 반영됩니다.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            취소
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50">
            {busy ? '처리 중' : recommendation.actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Recommendation['priority'] }) {
  const classes = {
    high: 'bg-red-50 text-red-700 border-red-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-gray-50 text-gray-600 border-gray-200',
  }[priority];
  const label = { high: '높음', medium: '중간', low: '낮음' }[priority];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${classes}`}>{label}</span>;
}

function VerdictBadge({ verdict }: { verdict: Creative['verdict'] }) {
  const classes = {
    winner: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    watch: 'bg-amber-50 text-amber-700 border-amber-200',
    kill: 'bg-red-50 text-red-700 border-red-200',
    fresh: 'bg-blue-50 text-blue-700 border-blue-200',
  }[verdict];
  const label = { winner: 'WIN', watch: 'WATCH', kill: 'KILL', fresh: 'NEW' }[verdict];
  return <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${classes}`}>{label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'ACTIVE';
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
      {status}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-gray-50 px-1.5 py-1">
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className="truncate font-mono text-[11px] font-semibold text-gray-700">{value}</div>
    </div>
  );
}

function buttonIcon(recommendation: Recommendation) {
  if (recommendation.kind === 'pause_ad') return <Pause className="h-3.5 w-3.5" />;
  if (recommendation.kind === 'activate_ad') return <Play className="h-3.5 w-3.5" />;
  if (recommendation.kind === 'adset_budget') return <TrendingUp className="h-3.5 w-3.5" />;
  if (recommendation.kind === 'video_brief') return <Clipboard className="h-3.5 w-3.5" />;
  return <CheckCircle2 className="h-3.5 w-3.5" />;
}
