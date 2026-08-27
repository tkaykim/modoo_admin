'use client';

/**
 * 채널 성과 — 다채널 운영의 첫 화면.
 *
 * 설계 원칙 (시니어 마케터의 판단 순서):
 *  1) 요약 카드에서 "광고비 대비 돈이 되고 있나"를 5초 안에 읽는다 (혼합 ROAS).
 *  2) 채널 테이블에서 어느 채널이 벌고 어느 채널이 새는지 비교한다 (CVR·ROAS·CPA).
 *  3) 이상한 채널이 보이면 Meta 상세/네이버 상세 탭으로 내려가 원인을 판다.
 *  판단은 여기서, 실행(예산·입찰·소재)은 마케팅 콘솔에서.
 */

import { useState } from 'react';
import useSWR from 'swr';

type ChannelRow = {
  channel: string;
  paid: boolean;
  spend: number;
  sessions: number;
  formInquiries: number;
  chatbotSessions: number;
  inquiries: number;
  orders: number;
  revenue: number;
  aov: number;
  roas: number | null;
  cpa: number | null;
  cvr: number;
};

type Payload = {
  range: { since: string; until: string; days: number };
  summary: {
    totalSpend: number;
    paidRevenue: number;
    totalRevenue: number;
    blendedRoas: number;
    paidRevenueShare: number;
    totalOrders: number;
    totalInquiries: number;
  };
  channels: ChannelRow[];
  daily: { date: string; total: number; meta: number; naver: number }[];
  adsErrors: string[];
  notes: string[];
};

const krw = (v: number) => `₩${new Intl.NumberFormat('ko-KR').format(Math.round(v || 0))}`;
const num = (v: number) => new Intl.NumberFormat('ko-KR').format(Math.round(v || 0));

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    return r.json();
  });

const RANGES = [7, 14, 30, 60, 90] as const;

export default function ChannelPerformance({ onDrill }: { onDrill?: (tab: string) => void }) {
  const [days, setDays] = useState<number>(14);
  const { data, error, isLoading } = useSWR<Payload>(`/api/admin/analytics/channels?days=${days}`, fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">채널 성과</h2>
          <p className="text-xs text-gray-500">
            모든 유입 채널의 광고비·문의·매출을 한 표에서 비교합니다. 매출은 주문 DB 기준입니다.
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
          {data.adsErrors.length > 0 && (
            <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              일부 광고비 조회 실패 — 해당 채널의 광고비·ROAS만 비어 있습니다. ({data.adsErrors.join(' / ')})
            </p>
          )}

          <p className="text-xs text-gray-500">기간 {data.range.since} ~ {data.range.until}</p>

          {/* 1단: 돈이 되고 있나 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <Stat label="총 광고비" value={krw(data.summary.totalSpend)} />
            <Stat
              label="광고 귀속 매출"
              value={krw(data.summary.paidRevenue)}
              tone={data.summary.paidRevenue > 0 ? 'good' : 'bad'}
            />
            <Stat
              label="혼합 ROAS"
              value={data.summary.blendedRoas.toFixed(2)}
              tone={data.summary.blendedRoas >= 2 ? 'good' : data.summary.blendedRoas >= 1 ? 'warn' : 'bad'}
              hint="광고 귀속 매출 ÷ 총 광고비"
            />
            <Stat label="전체 매출" value={krw(data.summary.totalRevenue)} />
            <Stat
              label="광고 매출 비중"
              value={`${data.summary.paidRevenueShare.toFixed(1)}%`}
              hint="전체 매출 중 광고 귀속"
            />
            <Stat label="총 주문" value={`${num(data.summary.totalOrders)}건`} />
            <Stat label="총 문의" value={`${num(data.summary.totalInquiries)}건`} hint="폼+챗봇, 프록시" />
          </div>

          {/* 2단: 어느 채널이 벌고 어느 채널이 새나 */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-3 py-2">
              <h3 className="text-xs font-semibold text-gray-900">채널별 비교</h3>
              <p className="mt-0.5 text-[11px] text-gray-500">
                CVR = 세션 대비 주문율. 유료 채널은 ROAS·CPA로, 자연 채널은 CVR·매출로 봅니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    {['채널', '광고비', '세션', '문의', '주문', '매출', '객단가', 'CVR', 'ROAS', 'CPA'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.channels.map((c) => (
                    <tr key={c.channel} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="font-medium text-gray-900">{c.channel}</span>
                        {c.paid && (
                          <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            유료
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800">{c.spend ? krw(c.spend) : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800">{num(c.sessions)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800">
                        {c.inquiries ? (
                          <span title={`폼 ${c.formInquiries} · 챗봇 ${c.chatbotSessions}`}>{num(c.inquiries)}</span>
                        ) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800">{c.orders ? `${num(c.orders)}건` : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                        {c.revenue ? krw(c.revenue) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800">{c.aov ? krw(c.aov) : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800">{c.sessions ? `${c.cvr.toFixed(2)}%` : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {c.roas === null ? (
                          <span className="text-gray-400">-</span>
                        ) : (
                          <span className={c.roas >= 2 ? 'font-semibold text-emerald-700' : c.roas >= 1 ? 'text-amber-700' : 'font-semibold text-red-700'}>
                            {c.roas.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-800">{c.cpa === null ? '-' : krw(c.cpa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {onDrill && (
              <div className="flex gap-2 border-t border-gray-100 px-3 py-2">
                <button type="button" onClick={() => onDrill('ad_efficiency')} className="text-[11px] font-medium text-blue-600 hover:underline">
                  Meta 상세 →
                </button>
                <button type="button" onClick={() => onDrill('naver')} className="text-[11px] font-medium text-blue-600 hover:underline">
                  네이버 상세 →
                </button>
              </div>
            )}
          </div>

          {/* 3단: 일별 흐름 — 큰 건 하나가 주간을 좌우하는 사업이라 일별 원값을 그대로 보여준다 */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-3 py-2">
              <h3 className="text-xs font-semibold text-gray-900">일별 매출 (주문 DB)</h3>
              <p className="mt-0.5 text-[11px] text-gray-500">
                단체복은 큰 건 한 건이 주간 매출을 좌우합니다 — 일별 등락으로 판정하지 마세요 (최소 14일).
              </p>
            </div>
            <div className="overflow-x-auto">
              {data.daily.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-gray-500">기간 내 주문이 없습니다.</p>
              ) : (
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      {['날짜', '전체 매출', 'Meta 귀속', '네이버 귀속'].map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.daily.map((d) => (
                      <tr key={d.date} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-3 py-2 text-gray-800">{d.date.slice(5)}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{krw(d.total)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-800">{d.meta ? krw(d.meta) : '-'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-800">{d.naver ? krw(d.naver) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <ul className="space-y-0.5 text-[11px] text-gray-400">
            {data.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
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
