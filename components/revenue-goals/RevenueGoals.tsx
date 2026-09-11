'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Target, TrendingUp, Wallet, CalendarClock, AlertTriangle, CheckCircle2, Pencil, RotateCcw } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { canExecuteMarketingActions } from '@/lib/auth-helpers';
import { useAuthStore } from '@/store/useAuthStore';
import WeeklyGoalChart from '@/components/revenue-goals/WeeklyGoalChart';

// ─────────────────────────────────────────────────────────────────────────────
// 주간 매출 목표 — 관리자 디자인 체계 준수 (Dashboard·MarketingTab 과 동일 토큰)
//   페이지 타이틀 text-xl font-bold / 카드 bg-white border border-gray-200 border-l-4 rounded-md p-3
//   섹션 헤더 px-4 py-3 border-b bg-gray-50 text-sm font-semibold / 표 text-xs + thead text-[11px] uppercase
//   배지 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium / 차트 = MiniBars(TrendBars, 단일축)
// ─────────────────────────────────────────────────────────────────────────────

type WeekRow = {
  week_start: string; orders: number; gross: number; spend: number; ad_ratio: number | null;
  target_gross: number | null; target_orders: number | null; planned_ad_spend: number | null; max_ad_spend: number | null;
  achieved: number | null; status: 'hit' | 'near' | 'miss' | 'current' | 'future' | 'no_goal';
};
type Data = {
  asOf: string;
  last_week: { week_start: string; target: number | null; gross: number; orders: number; achieved: number | null; spend: number; status: WeekRow['status'] } | null;
  freeze: { frozen: boolean; reason: string | null };
  baseline: { weeks: number; gross: number; spend: number; orders: number; ad_ratio: number; aov: number };
  current: {
    week_start: string; target: number; target_orders: number | null; gross: number; orders: number; achieved: number;
    expected_to_date: number; pace_ratio: number; remain_days: number; need_per_day: number;
    spend: number; planned_ad_spend: number; max_ad_spend: number; spend_expected_to_date: number; recommendation: string; rule: string | null;
  };
  weeks: WeekRow[];
  future: { week_start: string; target_gross: number; target_orders: number | null; planned_ad_spend: number | null; max_ad_spend: number | null; rule: string | null }[];
  rules: { growth: number; max_ratio: number };
};

const won = (n: number | null | undefined) => n == null ? '—' : `₩${new Intl.NumberFormat('ko-KR').format(Math.round(n))}`;
const pct = (r: number | null | undefined) => r == null ? '—' : `${Math.round(r * 100)}%`;
const md = (ymd: string) => { const d = new Date(`${ymd}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}`; };
const weekLabel = (ymd: string) => { const d = new Date(`${ymd}T00:00:00`); const e = new Date(d); e.setDate(e.getDate() + 6); return `${md(ymd)}~${e.getMonth() + 1}/${e.getDate()}`; };

const STATUS: Record<WeekRow['status'], { text: string; cls: string }> = {
  hit: { text: '달성', cls: 'bg-green-100 text-green-800' },
  near: { text: '근접', cls: 'bg-yellow-100 text-yellow-800' },
  miss: { text: '미달', cls: 'bg-red-100 text-red-800' },
  current: { text: '진행중', cls: 'bg-blue-100 text-blue-800' },
  future: { text: '예정', cls: 'bg-gray-100 text-gray-700' },
  no_goal: { text: '목표 없음', cls: 'bg-gray-100 text-gray-500' },
};
const Badge = ({ s }: { s: WeekRow['status'] }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[s].cls}`}>{STATUS[s].text}</span>
);

export default function RevenueGoals() {
  const authUser = useAuthStore((state) => state.user);
  const readOnly = !canExecuteMarketingActions(authUser?.role);
  const { data, error, isLoading, mutate } = useSWR<Data>('/api/admin/revenue-goals', fetcher, { revalidateOnFocus: false });
  const [editing, setEditing] = useState<{ week_start: string; target_gross: number; planned_ad_spend: number | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const r = await fetch('/api/admin/revenue-goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    setSaving(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error ?? '저장 실패'); return; }
    setEditing(null); void mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">주간 매출 목표</h1>
          <p className="text-sm text-gray-500 mt-1">
            매주 +{data ? Math.round((data.rules.growth - 1) * 100) : 10}% 우상향 · 적정 광고비 = 목표 × 최근 4주 광고비율 · 상한 +{data ? Math.round((data.rules.max_ratio - 1) * 100) : 15}%
          </p>
        </div>
        {data && <span className="text-[11px] text-gray-400 whitespace-nowrap">기준 {new Date(data.asOf).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded">{error.message}</div>}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {data && <ThisWeek d={data} onEdit={readOnly ? undefined : () => setEditing({ week_start: data.current.week_start, target_gross: data.current.target, planned_ad_spend: data.current.planned_ad_spend })} />}
      {data && <History d={data} />}
      {data && <Future d={data} onEdit={readOnly ? undefined : (f) => setEditing({ week_start: f.week_start, target_gross: f.target_gross, planned_ad_spend: f.planned_ad_spend })} />}

      {editing && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm bg-white border border-gray-200 rounded-md shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900">{weekLabel(editing.week_start)} 목표 수정</h3>
            </div>
            <div className="p-4 space-y-3">
              <label className="block text-xs text-gray-600">목표 매출(원)
                <input type="number" step={10000} className="mt-1 w-full border border-gray-300 rounded px-2 py-2 text-sm" value={editing.target_gross}
                  onChange={(e) => setEditing({ ...editing, target_gross: Number(e.target.value) })} />
              </label>
              <label className="block text-xs text-gray-600">적정 광고비(원) <span className="text-gray-400">비우면 자동(목표 × 광고비율)</span>
                <input type="number" step={10000} className="mt-1 w-full border border-gray-300 rounded px-2 py-2 text-sm" value={editing.planned_ad_spend ?? ''}
                  onChange={(e) => setEditing({ ...editing, planned_ad_spend: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
              <p className="text-[11px] text-gray-400">상한은 적정 × {data.rules.max_ratio}로 자동 계산됩니다.</p>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button className="px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={() => setEditing(null)}>취소</button>
              <button className="px-3 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" disabled={saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 이번 주 ───────────────────────────────────────────────────────────────────
function ThisWeek({ d, onEdit }: { d: Data; onEdit?: () => void }) {
  const c = d.current;
  const onPace = c.pace_ratio >= 1, nearPace = c.pace_ratio >= 0.9;
  const progress = Math.min(100, (c.gross / Math.max(1, c.target)) * 100);
  const expectedMark = Math.min(100, (c.expected_to_date / Math.max(1, c.target)) * 100);
  const spendScale = Math.max(c.max_ad_spend, c.spend, 1);
  const p = (n: number) => `${Math.min(100, (n / spendScale) * 100)}%`;
  const tone = onPace ? 'text-green-700' : nearPace ? 'text-yellow-700' : 'text-red-700';

  return (
    <section className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">이번 주 · {weekLabel(c.week_start)}</h3>
        {onEdit && <button onClick={onEdit} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
          <Pencil className="w-3.5 h-3.5" /> 목표 수정
        </button>}
      </div>

      <div className="p-4 space-y-4">
        {/* 권고 한 줄 — 가장 먼저 읽을 것 */}
        <div className={`flex items-start gap-2 text-sm rounded px-3 py-2 border ${onPace ? 'bg-green-50 border-green-200 text-green-900' : nearPace ? 'bg-yellow-50 border-yellow-200 text-yellow-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
          {onPace ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{c.recommendation}</span>
        </div>
        {d.freeze.frozen && (
          <p className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">⛔ 이번 주 예산 증액 동결 — {d.freeze.reason}</p>
        )}
        {!d.freeze.frozen && d.freeze.reason && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">⚠ 한계 효율 경고(1주차) — {d.freeze.reason}</p>
        )}

        {/* 목표 진행 바 — 기대선 마커 */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs text-gray-500">목표 대비 진행</span>
            <span className="text-xs text-gray-700"><b className="text-gray-900">{won(c.gross)}</b> / {won(c.target)} · <span className={tone}>{pct(c.achieved)}</span></span>
          </div>
          <div className="relative h-2.5 w-full rounded-sm bg-gray-100 overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded-sm bg-blue-600" style={{ width: `${progress}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-gray-800" style={{ left: `${expectedMark}%` }} title={`오늘까지 기대 ${won(c.expected_to_date)}`} />
          </div>
          <div className="flex justify-between mt-1 text-[11px] text-gray-400">
            <span>파랑 = 현재 매출 · 검정선 = 오늘까지 기대치</span>
            <span>페이스 <b className={tone}>{pct(c.pace_ratio)}</b></span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={Target} accent="border-l-blue-500" label="목표 매출" value={won(c.target)} hint={c.target_orders ? `주문 ${c.target_orders}건 목표` : undefined} />
          <Kpi icon={TrendingUp} accent="border-l-green-500" label="현재 매출" value={won(c.gross)} hint={`주문 ${c.orders}건 · 달성 ${pct(c.achieved)}`} />
          <Kpi icon={CalendarClock} accent="border-l-amber-500" label="남은 일수 · 필요 일매출" value={`${c.remain_days}일`} hint={c.remain_days > 0 ? `일 ${won(c.need_per_day)} 필요` : '이번 주 마감'} />
          <Kpi icon={Wallet} accent="border-l-purple-500" label="광고비" value={won(c.spend)} hint={`적정 ${won(c.planned_ad_spend)} · 상한 ${won(c.max_ad_spend)}`} />
        </div>

        {/* 광고비 바 — 적정·상한 마커 */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs text-gray-500">광고비 집행 (오늘까지 기대 {won(c.spend_expected_to_date)})</span>
            <span className={`text-xs ${c.spend > c.max_ad_spend ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{c.spend > c.max_ad_spend ? '상한 초과' : `상한까지 ${won(c.max_ad_spend - c.spend)}`}</span>
          </div>
          <div className="relative h-2.5 w-full rounded-sm bg-gray-100 overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded-sm bg-purple-500" style={{ width: p(c.spend) }} />
            <div className="absolute inset-y-0 w-0.5 bg-gray-800" style={{ left: p(c.planned_ad_spend) }} title={`적정 ${won(c.planned_ad_spend)}`} />
            <div className="absolute inset-y-0 w-0.5 bg-red-600" style={{ left: p(c.max_ad_spend) }} title={`상한 ${won(c.max_ad_spend)}`} />
          </div>
          <div className="text-[11px] text-gray-400 mt-1">검정선 = 적정 · 빨간선 = 상한(+{Math.round((d.rules.max_ratio - 1) * 100)}%)</div>
        </div>
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, hint, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string; accent: string }) {
  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${accent} rounded-md p-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <Icon className="w-4 h-4 text-gray-400" />
      </div>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

// ── 지난 12주 ─────────────────────────────────────────────────────────────────
function History({ d }: { d: Data }) {
  const rows = [...d.weeks].reverse();
  const lw = d.last_week;
  return (
    <section className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">주간 매출 vs 목표 — 지난 11주 · 이번 주 · 향후 {d.future.length}주</h3>
        {lw && lw.target != null && (
          <span className="text-xs text-gray-600">지난주 {weekLabel(lw.week_start)} · {won(lw.gross)} / {won(lw.target)} · <Badge s={lw.status} /></span>
        )}
      </div>
      <div className="p-4">
        <WeeklyGoalChart rows={d.weeks} future={d.future.map((f) => ({ week_start: f.week_start, target_gross: f.target_gross }))} />
      </div>
      <div className="overflow-x-auto border-t border-gray-200">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 font-medium">주</th>
              <th className="px-4 py-2 font-medium text-right">목표</th>
              <th className="px-4 py-2 font-medium text-right">실적</th>
              <th className="px-4 py-2 font-medium">달성</th>
              <th className="px-4 py-2 font-medium text-right">주문</th>
              <th className="px-4 py-2 font-medium text-right">광고비</th>
              <th className="px-4 py-2 font-medium text-right">광고비율</th>
              <th className="px-4 py-2 font-medium">판정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((w) => (
              <tr key={w.week_start} className={w.status === 'current' ? 'bg-blue-50/40' : 'hover:bg-gray-50'}>
                <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{weekLabel(w.week_start)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{won(w.target_gross)}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">{won(w.gross)}</td>
                <td className="px-4 py-2 min-w-[120px]">
                  {w.achieved == null ? <span className="text-gray-300">—</span> : (
                    <div className="flex items-center gap-2">
                      <div className="relative h-1.5 w-16 rounded-sm bg-gray-100 overflow-hidden">
                        <div className={`absolute inset-y-0 left-0 rounded-sm ${w.achieved >= 1 ? 'bg-green-500' : w.achieved >= 0.9 ? 'bg-yellow-500' : 'bg-red-400'}`} style={{ width: `${Math.min(100, w.achieved * 100)}%` }} />
                      </div>
                      <span className="text-gray-700 tabular-nums">{pct(w.achieved)}</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{w.orders}</td>
                <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{won(w.spend)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${w.ad_ratio != null && w.ad_ratio > 0.3 ? 'text-red-700' : 'text-gray-700'}`}>{pct(w.ad_ratio)}</td>
                <td className="px-4 py-2"><Badge s={w.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── 향후 목표 ─────────────────────────────────────────────────────────────────
function Future({ d, onEdit }: { d: Data; onEdit?: (f: Data['future'][number]) => void }) {
  const b = d.baseline;
  return (
    <section className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">향후 목표</h3>
        <span className="text-[11px] text-gray-400 inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" /> 기준선 = 최근 {b.weeks}주 평균 {won(b.gross / Math.max(1, b.weeks))} · 광고비율 {pct(b.ad_ratio)} · 객단가 {won(b.aov)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 font-medium">주</th>
              <th className="px-4 py-2 font-medium text-right">목표 매출</th>
              <th className="px-4 py-2 font-medium text-right">주문</th>
              <th className="px-4 py-2 font-medium text-right">적정 광고비</th>
              <th className="px-4 py-2 font-medium text-right">상한</th>
              <th className="px-4 py-2 font-medium">근거</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {d.future.map((f) => (
              <tr key={f.week_start} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{weekLabel(f.week_start)}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900 tabular-nums">{won(f.target_gross)}</td>
                <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{f.target_orders ?? '—'}</td>
                <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{won(f.planned_ad_spend)}</td>
                <td className="px-4 py-2 text-right text-gray-700 tabular-nums">{won(f.max_ad_spend)}</td>
                <td className="px-4 py-2 text-gray-500 max-w-[320px] truncate" title={f.rule ?? ''}>{f.rule ?? ''}</td>
                <td className="px-4 py-2 text-right">
                  {onEdit && <button onClick={() => onEdit(f)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50"><Pencil className="w-3 h-3" /> 수정</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
