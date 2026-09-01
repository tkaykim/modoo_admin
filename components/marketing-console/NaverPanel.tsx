'use client';

/**
 * 네이버 검색광고 성과 패널.
 *
 * 광고비는 네이버 API, 매출·주문은 우리 DB에서 온다.
 * 두 출처를 한 화면에서 붙여 보는 게 이 패널의 존재 이유다 —
 * 네이버 화면만 보면 광고비만 보이고, DB만 보면 광고비가 안 보인다.
 */

import { useState } from 'react';
import useSWR from 'swr';

type Summary = {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  sessions: number;
  sessionRate: number;
  orders: number;
  revenue: number;
  roas: number;
  cpa: number;
  aov: number;
  bizmoney: number | null;
};

type DailyRow = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  sessions: number;
  orders: number;
  revenue: number;
};

type QueryRow = {
  query: string;
  sessions: number;
  rank: string | null;
  lastSeen: string;
  orders: number;
  revenue: number;
};

type BidDiag = {
  keywordId: string;
  keyword: string;
  group: string;
  bid: number;
  locked: boolean;
  need: Record<string, number | null>;
  estimatedPosition: number | null;
  gapToP5: number;
};

type KeywordDaily = {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  avgRank: number;
};

type KeywordRow = {
  keywordId: string;
  keyword: string;
  group: string;
  bid: number;
  qiGrade: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  avgRank: number;
};

type Payload = {
  range: { since: string; until: string; days: number };
  summary: Summary;
  daily: DailyRow[];
  queries: QueryRow[];
  keywords: KeywordRow[];
  adsError: string | null;
};

const krw = (v: number) => `₩${new Intl.NumberFormat('ko-KR').format(Math.round(v || 0))}`;
const num = (v: number) => new Intl.NumberFormat('ko-KR').format(Math.round(v || 0));
const pct2 = (v: number) => `${(v || 0).toFixed(2)}%`;

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    return r.json();
  });

const RANGES = [7, 14, 30, 60, 90] as const;

export default function NaverPanel() {
  const [days, setDays] = useState<number>(14);
  const [device, setDevice] = useState<'MOBILE' | 'PC'>('MOBILE');
  const { data, error, isLoading } = useSWR<Payload>(
    `/api/admin/analytics/naver?days=${days}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  // 순위 진단은 추정 API 5회 호출이라 느리다 — 본 지표와 분리해 지연 로드한다.
  const { data: bids } = useSWR<{ device: string; keywords: BidDiag[] }>(
    `/api/admin/analytics/naver/bids?device=${device}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const bidByKey = new Map((bids?.keywords ?? []).map((b) => [`${b.group}|${b.keyword}`, b]));

  const [expanded, setExpanded] = useState<string | null>(null);
  const [dailyCache, setDailyCache] = useState<Record<string, KeywordDaily[] | 'loading' | 'error'>>({});
  const toggleExpand = (k: KeywordRow) => {
    const next = expanded === k.keywordId ? null : k.keywordId;
    setExpanded(next);
    if (next && !dailyCache[next]) {
      setDailyCache((c) => ({ ...c, [next]: 'loading' }));
      fetch(`/api/admin/analytics/naver/keyword?id=${encodeURIComponent(next)}&days=${days}`)
        .then((r) => r.json())
        .then((j) => setDailyCache((c) => ({ ...c, [next]: Array.isArray(j.daily) ? j.daily : 'error' })))
        .catch(() => setDailyCache((c) => ({ ...c, [next]: 'error' })));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">네이버 검색광고</h2>
          <p className="text-xs text-gray-500">
            광고비는 네이버 API, 매출·주문은 주문 DB 기준입니다. 매체 전환수가 아니라 실주문으로 판정합니다.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                days === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-gray-500">불러오는 중…</p>}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          조회 실패: {String(error.message ?? error)}
        </p>
      )}

      {data && (
        <>
          {data.adsError && (
            <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              광고비 조회 실패 — 매출·세션 지표만 표시됩니다. ({data.adsError})
            </p>
          )}

          <p className="text-xs text-gray-500">
            기간 {data.range.since} ~ {data.range.until}
            {data.summary.bizmoney !== null && ` · 비즈머니 잔액 ${krw(data.summary.bizmoney)}`}
          </p>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="광고비" value={krw(data.summary.spend)} />
            <Stat label="매출 (주문 DB)" value={krw(data.summary.revenue)} tone={data.summary.revenue > 0 ? 'good' : 'bad'} />
            <Stat
              label="실질 ROAS"
              value={data.summary.roas.toFixed(2)}
              tone={data.summary.roas >= 2 ? 'good' : data.summary.roas > 0 ? 'warn' : 'bad'}
              hint="매출 ÷ 광고비"
            />
            <Stat label="주문" value={`${num(data.summary.orders)}건`} tone={data.summary.orders > 0 ? 'good' : 'bad'} />
            <Stat label="노출" value={num(data.summary.impressions)} />
            <Stat label="클릭" value={num(data.summary.clicks)} hint={`CTR ${pct2(data.summary.ctr)}`} />
            <Stat label="CPC" value={krw(data.summary.cpc)} />
            <Stat
              label="세션"
              value={num(data.summary.sessions)}
              hint={`클릭 대비 ${pct2(data.summary.sessionRate)}`}
            />
          </div>

          {data.summary.orders > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="CPA (주문당 광고비)" value={krw(data.summary.cpa)} />
              <Stat label="객단가" value={krw(data.summary.aov)} />
            </div>
          )}

          {data.summary.clicks > 0 && data.summary.orders === 0 && (
            <p className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              클릭 {num(data.summary.clicks)}건에 주문 0건입니다. 표본이 작으면 0건이 정상일 수 있습니다 —
              판정하려면 최소 30~50클릭이 필요합니다.
            </p>
          )}

          <Section title="일별 추이">
            <Table
              head={['날짜', '광고비', '노출', '클릭', 'CTR', 'CPC', '세션', '주문', '매출']}
              rows={data.daily.map((d) => [
                d.date.slice(5),
                krw(d.spend),
                num(d.impressions),
                num(d.clicks),
                pct2(d.ctr),
                krw(d.cpc),
                num(d.sessions),
                d.orders ? `${d.orders}건` : '-',
                d.revenue ? krw(d.revenue) : '-',
              ])}
              empty="기간 내 데이터가 없습니다."
            />
          </Section>

          <Section
            title="유입 검색어"
            desc="광고를 통해 실제로 들어온 검색어입니다. 네이버 자동추적 파라미터에서 수집합니다."
          >
            <Table
              head={['검색어', '세션', '노출순위', '주문', '매출', '최근']}
              rows={data.queries.map((q) => [
                q.query,
                num(q.sessions),
                q.rank ?? '-',
                q.orders ? `${q.orders}건` : '-',
                q.revenue ? krw(q.revenue) : '-',
                q.lastSeen.slice(5),
              ])}
              empty="수집된 검색어가 없습니다."
            />
          </Section>

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
              <div>
                <h3 className="text-xs font-semibold text-gray-900">키워드별 성과 · 노출 순위 진단</h3>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  평균순위 = 기간 실측(노출된 키워드만). 예상순위 = 현재 입찰가를 순위별 필요 입찰가 곡선에 대입한 추정
                  — 노출 0인 키워드가 &quot;왜 안 나가는지&quot;를 보여줍니다. 행을 클릭하면 일별 상세가 열립니다.
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
                {(['MOBILE', 'PC'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      device === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {d === 'MOBILE' ? '모바일' : 'PC'}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              {data.keywords.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-gray-500">키워드 데이터가 없습니다.</p>
              ) : (
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      {['키워드', '그룹', '입찰', '예상순위', '5위까지', '평균순위(실측)', 'QI', '노출', '클릭', 'CTR', 'CPC', '광고비'].map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.keywords.map((k) => {
                      const diag = bidByKey.get(`${k.group}|${k.keyword}`);
                      const est = diag?.estimatedPosition;
                      const daily = dailyCache[k.keywordId];
                      return (
                        <FragmentRow key={k.keywordId}>
                          <tr
                            className={`cursor-pointer hover:bg-gray-50 ${expanded === k.keywordId ? 'bg-blue-50/40' : ''}`}
                            onClick={() => toggleExpand(k)}
                          >
                            <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{k.keyword}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-600">{k.group.replace('모두의유니폼_', '')}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-800">{krw(k.bid)}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {!bids ? (
                                <span className="text-gray-400">…</span>
                              ) : est ? (
                                <span className={est <= 3 ? 'font-semibold text-emerald-700' : 'text-gray-800'}>{est}위권</span>
                              ) : (
                                <span className="font-medium text-red-600">5위 밖</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                              {diag && diag.gapToP5 > 0 ? `+${krw(diag.gapToP5)}` : diag ? '충족' : '-'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-800">{k.avgRank ? k.avgRank.toFixed(1) : '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-800">{k.qiGrade === null ? '-' : k.qiGrade}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-800">{num(k.impressions)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-800">{num(k.clicks)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-800">{pct2(k.ctr)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-800">{k.cpc ? krw(k.cpc) : '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-800">{k.spend ? krw(k.spend) : '-'}</td>
                          </tr>
                          {expanded === k.keywordId && (
                            <tr>
                              <td colSpan={12} className="bg-gray-50 px-4 py-2">
                                {daily === 'loading' || daily === undefined ? (
                                  <p className="py-2 text-[11px] text-gray-500">일별 상세 불러오는 중…</p>
                                ) : daily === 'error' ? (
                                  <p className="py-2 text-[11px] text-red-600">일별 상세 조회 실패</p>
                                ) : (
                                  <table className="min-w-[480px] text-[11px]">
                                    <thead className="text-gray-500">
                                      <tr>
                                        {['날짜', '노출', '클릭', 'CTR', 'CPC', '광고비', '평균순위'].map((h) => (
                                          <th key={h} className="whitespace-nowrap px-2 py-1 text-left font-medium">{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {daily.filter((d) => d.impressions > 0 || d.spend > 0).length === 0 ? (
                                        <tr><td colSpan={7} className="px-2 py-1 text-gray-500">기간 내 노출이 없습니다.</td></tr>
                                      ) : (
                                        daily
                                          .filter((d) => d.impressions > 0 || d.spend > 0)
                                          .map((d) => (
                                            <tr key={d.date} className="text-gray-700">
                                              <td className="whitespace-nowrap px-2 py-1">{d.date.slice(5)}</td>
                                              <td className="whitespace-nowrap px-2 py-1">{num(d.impressions)}</td>
                                              <td className="whitespace-nowrap px-2 py-1">{num(d.clicks)}</td>
                                              <td className="whitespace-nowrap px-2 py-1">{pct2(d.ctr)}</td>
                                              <td className="whitespace-nowrap px-2 py-1">{d.cpc ? krw(d.cpc) : '-'}</td>
                                              <td className="whitespace-nowrap px-2 py-1">{d.spend ? krw(d.spend) : '-'}</td>
                                              <td className="whitespace-nowrap px-2 py-1">{d.avgRank ? d.avgRank.toFixed(1) : '-'}</td>
                                            </tr>
                                          ))
                                      )}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </FragmentRow>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : tone === 'bad' ? 'text-red-700' : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-3 py-2">
        <h3 className="text-xs font-semibold text-gray-900">{title}</h3>
        {desc && <p className="mt-0.5 text-[11px] text-gray-500">{desc}</p>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="px-3 py-6 text-center text-xs text-gray-500">{empty}</p>;
  return (
    <table className="min-w-full text-left text-xs">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          {head.map((h) => (
            <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50">
            {r.map((cell, j) => (
              <td key={j} className="whitespace-nowrap px-3 py-2 text-gray-800">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
