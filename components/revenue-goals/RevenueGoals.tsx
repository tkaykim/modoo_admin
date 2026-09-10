'use client';

import { useCallback, useEffect, useState } from 'react';

type WeekRow = {
  week_start: string; orders: number; gross: number; spend: number; ad_ratio: number | null;
  target_gross: number | null; target_orders: number | null; planned_ad_spend: number | null; max_ad_spend: number | null;
  achieved: number | null; status: 'hit' | 'near' | 'miss' | 'current' | 'future' | 'no_goal';
};
type Data = {
  asOf: string;
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

const won = (n: number | null | undefined) => n == null ? '—' : Math.round(n).toLocaleString('ko-KR') + '원';
const man = (n: number) => (n / 10_000).toFixed(0) + '만';
const pct = (r: number | null | undefined) => r == null ? '—' : Math.round(r * 100) + '%';
const label = (ymd: string) => { const d = new Date(ymd + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };

const STATUS: Record<WeekRow['status'], { text: string; cls: string }> = {
  hit: { text: '달성', cls: 'bg-emerald-100 text-emerald-800' },
  near: { text: '근접', cls: 'bg-amber-100 text-amber-800' },
  miss: { text: '미달', cls: 'bg-rose-100 text-rose-800' },
  current: { text: '진행중', cls: 'bg-blue-100 text-blue-800' },
  future: { text: '예정', cls: 'bg-gray-100 text-gray-600' },
  no_goal: { text: '목표 없음', cls: 'bg-gray-100 text-gray-500' },
};

export default function RevenueGoals() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ week_start: string; target_gross: number; planned_ad_spend: number | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const r = await fetch('/api/admin/revenue-goals', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) { setErr(j.error ?? '불러오기 실패'); return; }
    setData(j);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const r = await fetch('/api/admin/revenue-goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    setSaving(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error ?? '저장 실패'); return; }
    setEditing(null); void load();
  };

  if (err) return <div className="p-6 text-rose-700">{err}</div>;
  if (!data) return <div className="p-6 text-gray-500">불러오는 중…</div>;
  const c = data.current;
  const paceCls = c.pace_ratio >= 1 ? 'text-emerald-700' : c.pace_ratio >= 0.9 ? 'text-amber-700' : 'text-rose-700';
  const spendOver = c.spend > c.max_ad_spend;

  // 차트 스케일
  const chartRows = data.weeks;
  const maxY = Math.max(...chartRows.map((w) => Math.max(w.gross, w.target_gross ?? 0)), 1);
  const W = 720, H = 220, PAD = 28, bw = (W - PAD * 2) / chartRows.length;
  const y = (v: number) => H - PAD - (v / maxY) * (H - PAD * 2);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">주간 매출 목표</h1>
          <p className="text-sm text-gray-500">매주 +{Math.round((data.rules.growth - 1) * 100)}% 우상향 · 적정 광고비 = 목표 × 최근 4주 광고비율 · 허용 상한 +{Math.round((data.rules.max_ratio - 1) * 100)}%</p>
        </div>
        <span className="text-xs text-gray-400">기준 {new Date(data.asOf).toLocaleString('ko-KR')}</span>
      </header>

      {/* 이번 주 */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">이번 주 ({label(c.week_start)} 주)</h2>
          <button className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50" onClick={() => setEditing({ week_start: c.week_start, target_gross: c.target, planned_ad_spend: c.planned_ad_spend })}>목표 수정</button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi title="목표 매출" value={won(c.target)} sub={c.target_orders ? `주문 ${c.target_orders}건 목표` : undefined} />
          <Kpi title="현재 매출" value={won(c.gross)} sub={`달성 ${pct(c.achieved)} · 주문 ${c.orders}건`} />
          <Kpi title="페이스" value={<span className={paceCls}>{pct(c.pace_ratio)}</span>} sub={`오늘까지 기대 ${won(c.expected_to_date)}`} />
          <Kpi title="남은 일수 / 필요 일매출" value={`${c.remain_days}일`} sub={c.remain_days > 0 ? `일 ${won(c.need_per_day)} 필요` : '이번 주 마감'} />
        </div>
        <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm">
          <div className="mb-1 flex flex-wrap gap-x-6 gap-y-1">
            <span>광고비 <b>{won(c.spend)}</b></span>
            <span className="text-gray-500">적정 {won(c.planned_ad_spend)} (오늘까지 기대 {won(c.spend_expected_to_date)})</span>
            <span className={spendOver ? 'text-rose-700 font-semibold' : 'text-gray-500'}>상한 {won(c.max_ad_spend)}</span>
          </div>
          <Bar value={c.spend} planned={c.planned_ad_spend} max={c.max_ad_spend} />
          <p className={`mt-2 ${c.pace_ratio < 0.9 ? 'text-rose-700' : 'text-gray-700'}`}>{c.recommendation}</p>
        </div>
      </section>

      {/* 12주 차트 */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
        <h2 className="mb-2 font-semibold">최근 12주 — 매출(막대) · 목표(선) · 광고비(점선)</h2>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full min-w-[640px]">
            {chartRows.map((w, i) => {
              const x = PAD + i * bw;
              const fill = w.status === 'hit' ? '#10b981' : w.status === 'miss' ? '#f43f5e' : w.status === 'near' ? '#f59e0b' : w.status === 'current' ? '#3b82f6' : '#cbd5e1';
              return (
                <g key={w.week_start}>
                  <rect x={x + bw * 0.2} y={y(w.gross)} width={bw * 0.6} height={H - PAD - y(w.gross)} fill={fill} rx={3} />
                  <text x={x + bw / 2} y={H - 10} fontSize={10} textAnchor="middle" fill="#6b7280">{label(w.week_start)}</text>
                  <text x={x + bw / 2} y={y(w.gross) - 4} fontSize={9} textAnchor="middle" fill="#374151">{man(w.gross)}</text>
                </g>
              );
            })}
            <polyline fill="none" stroke="#111827" strokeWidth={2}
              points={chartRows.filter((w) => w.target_gross).map((w, _i, arr) => { const i = chartRows.indexOf(w); return `${PAD + i * bw + bw / 2},${y(w.target_gross!)}`; }).join(' ')} />
            <polyline fill="none" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 3"
              points={chartRows.map((w, i) => `${PAD + i * bw + bw / 2},${y(w.spend)}`).join(' ')} />
          </svg>
        </div>
      </section>

      {/* 주간 표 */}
      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">주</th><th className="px-3 py-2 text-right">목표</th><th className="px-3 py-2 text-right">실적</th>
                <th className="px-3 py-2 text-right">달성</th><th className="px-3 py-2 text-right">주문</th>
                <th className="px-3 py-2 text-right">광고비</th><th className="px-3 py-2 text-right">광고비율</th><th className="px-3 py-2">판정</th>
              </tr>
            </thead>
            <tbody>
              {[...data.weeks].reverse().map((w) => {
                const s = STATUS[w.status];
                return (
                  <tr key={w.week_start} className="border-t">
                    <td className="px-3 py-2">{label(w.week_start)} 주</td>
                    <td className="px-3 py-2 text-right">{won(w.target_gross)}</td>
                    <td className="px-3 py-2 text-right font-medium">{won(w.gross)}</td>
                    <td className="px-3 py-2 text-right">{pct(w.achieved)}</td>
                    <td className="px-3 py-2 text-right">{w.orders}</td>
                    <td className="px-3 py-2 text-right">{won(w.spend)}</td>
                    <td className={`px-3 py-2 text-right ${w.ad_ratio != null && w.ad_ratio > 0.3 ? 'text-rose-700' : ''}`}>{pct(w.ad_ratio)}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${s.cls}`}>{s.text}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 향후 목표 */}
      <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
        <h2 className="mb-2 font-semibold">향후 목표 (자동 산출, 수정 가능)</h2>
        <p className="mb-3 text-sm text-gray-500">기준선 = 최근 {data.baseline.weeks}주 평균 매출 {won(data.baseline.gross / Math.max(1, data.baseline.weeks))} · 광고비율 {pct(data.baseline.ad_ratio)} · 객단가 {won(data.baseline.aov)}</p>
        <div className="grid gap-2 md:grid-cols-2">
          {data.future.map((f) => (
            <div key={f.week_start} className="flex items-center justify-between rounded-xl border p-3 text-sm">
              <div>
                <div className="font-medium">{label(f.week_start)} 주 · {won(f.target_gross)}{f.target_orders ? ` · ${f.target_orders}건` : ''}</div>
                <div className="text-xs text-gray-500">적정 광고비 {won(f.planned_ad_spend)} · 상한 {won(f.max_ad_spend)}</div>
                {f.rule && <div className="text-xs text-gray-400">{f.rule}</div>}
              </div>
              <button className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => setEditing({ week_start: f.week_start, target_gross: f.target_gross, planned_ad_spend: f.planned_ad_spend })}>수정</button>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold">{label(editing.week_start)} 주 목표 수정</h3>
            <label className="block text-sm">목표 매출(원)
              <input type="number" step={10000} className="mt-1 w-full rounded-lg border px-3 py-2" value={editing.target_gross}
                onChange={(e) => setEditing({ ...editing, target_gross: Number(e.target.value) })} />
            </label>
            <label className="mt-3 block text-sm">적정 광고비(원) <span className="text-gray-400">— 비우면 자동</span>
              <input type="number" step={10000} className="mt-1 w-full rounded-lg border px-3 py-2" value={editing.planned_ad_spend ?? ''}
                onChange={(e) => setEditing({ ...editing, planned_ad_spend: e.target.value === '' ? null : Number(e.target.value) })} />
            </label>
            <p className="mt-2 text-xs text-gray-500">상한은 적정 × {data.rules.max_ratio}로 자동 계산됩니다.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setEditing(null)}>취소</button>
              <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ title, value, sub }: { title: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Bar({ value, planned, max }: { value: number; planned: number; max: number }) {
  const scale = Math.max(max, value, 1);
  const p = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-gray-200">
      <div className="absolute inset-y-0 left-0 rounded-full bg-blue-500" style={{ width: p(value) }} />
      <div className="absolute inset-y-0 w-0.5 bg-gray-700" style={{ left: p(planned) }} title="적정" />
      <div className="absolute inset-y-0 w-0.5 bg-rose-600" style={{ left: p(max) }} title="상한" />
    </div>
  );
}
