'use client';

/**
 * 주간 매출(막대) vs 목표(선) 차트 — revenue-goals 전용, 반응형 SVG
 *  - 파란 막대 = 실제 주간 매출 (진행 중인 이번 주는 연한 파랑)
 *  - 검정 선 + 점 = 주간 목표. 과거·현재·향후 8주까지 이어져 우상향 목표선이 그대로 보인다
 *  - 막대 위 = 실적 금액(만원), 목표 점 위 = 목표 금액(만원, 실적이 없는 향후 주에만)
 *  - 막대 아래 = 주 시작일, 그 아래 = 달성률(달성 초록·근접 노랑·미달 빨강·진행중 파랑)
 *  - 같은 단위(₩) 하나의 축. hover 시 네이티브 title 로 상세
 */

type PastRow = {
  week_start: string; gross: number; target_gross: number | null; achieved: number | null;
  status: 'hit' | 'near' | 'miss' | 'current' | 'future' | 'no_goal';
};
type FutureRow = { week_start: string; target_gross: number };

type Pt = { week_start: string; gross: number | null; target: number | null; achieved: number | null; status: PastRow['status'] };

const man = (n: number) => `${Math.round(n / 10_000).toLocaleString('ko-KR')}만`;
const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;
const md = (ymd: string) => { const d = new Date(`${ymd}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}`; };
const PCT_COLOR: Record<string, string> = { hit: '#15803d', near: '#a16207', miss: '#b91c1c', current: '#1d4ed8' };

export default function WeeklyGoalChart({ rows, future }: { rows: PastRow[]; future: FutureRow[] }) {
  const pts: Pt[] = [
    ...rows.map((r) => ({ week_start: r.week_start, gross: r.gross, target: r.target_gross, achieved: r.achieved, status: r.status })),
    ...future.map((f) => ({ week_start: f.week_start, gross: null, target: f.target_gross, achieved: null, status: 'future' as const })),
  ];
  if (!pts.length) return null;

  const W = 980, H = 240;
  const PAD = { l: 10, r: 10, t: 26, b: 36 };
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const max = Math.max(...pts.map((p) => Math.max(p.gross ?? 0, p.target ?? 0)), 1) * 1.1;
  const step = plotW / pts.length;
  const barW = Math.min(step * 0.58, 34);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const cx = (i: number) => PAD.l + i * step + step / 2;
  const splitX = PAD.l + rows.length * step; // 현재/미래 경계

  const targetLine = pts.map((p, i) => (p.target != null ? `${cx(i)},${y(p.target)}` : null)).filter(Boolean).join(' ');

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-gray-600">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" /> 실제 매출</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-300" /> 이번 주(진행 중)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-4 bg-gray-900" /><span className="inline-block h-2 w-2 rounded-full bg-gray-900 -ml-3" /> 목표(선){future.length ? ` — 향후 ${future.length}주까지` : ''}</span>
        <span className="text-gray-400">막대 아래 % = 목표 대비 달성률</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[760px]" role="img" aria-label="주간 매출과 목표 비교">
          {[0.25, 0.5, 0.75, 1].map((r) => (
            <line key={r} x1={PAD.l} x2={W - PAD.r} y1={y(max * r)} y2={y(max * r)} stroke="#f3f4f6" strokeWidth={1} />
          ))}
          {/* 미래 영역 — 연한 배경 + 경계선 */}
          {future.length > 0 && (
            <>
              <rect x={splitX} y={PAD.t} width={W - PAD.r - splitX} height={plotH} fill="#f9fafb" />
              <line x1={splitX} x2={splitX} y1={PAD.t - 6} y2={PAD.t + plotH} stroke="#d1d5db" strokeDasharray="3 3" />
              <text x={splitX + 4} y={PAD.t - 10} fontSize={10} fill="#9ca3af">향후 목표 →</text>
            </>
          )}
          {/* 실적 막대 */}
          {pts.map((p, i) => {
            if (p.gross == null) return null;
            const x = cx(i) - barW / 2; const top = y(p.gross);
            const isCur = p.status === 'current';
            const title = `${md(p.week_start)} 주\n매출 ${won(p.gross)}${p.target ? `\n목표 ${won(p.target)} · 달성 ${Math.round((p.achieved ?? 0) * 100)}%` : ''}${isCur ? '\n(진행 중)' : ''}`;
            const labelY = Math.min(top, p.target != null ? y(p.target) : top) - 5;
            return (
              <g key={p.week_start}>
                <title>{title}</title>
                <rect x={x} y={top} width={barW} height={Math.max(0, PAD.t + plotH - top)} rx={2} fill={isCur ? '#93c5fd' : '#2563eb'} />
                <text x={cx(i)} y={labelY} fontSize={10} textAnchor="middle" fill="#111827">{man(p.gross)}</text>
              </g>
            );
          })}
          {/* 목표선 + 점 */}
          {targetLine && <polyline points={targetLine} fill="none" stroke="#111827" strokeWidth={2} strokeLinejoin="round" />}
          {pts.map((p, i) => p.target != null && (
            <g key={`t-${p.week_start}`}>
              <title>{`${md(p.week_start)} 주 목표 ${won(p.target)}`}</title>
              <circle cx={cx(i)} cy={y(p.target)} r={3.2} fill="#111827" />
              {p.gross == null && (
                <text x={cx(i)} y={y(p.target) - 8} fontSize={10} textAnchor="middle" fill="#111827">{man(p.target)}</text>
              )}
            </g>
          ))}
          {/* x 라벨 + 달성률 */}
          {pts.map((p, i) => (
            <g key={`x-${p.week_start}`}>
              <text x={cx(i)} y={H - 22} fontSize={10} textAnchor="middle" fill="#6b7280">{md(p.week_start)}</text>
              {p.achieved != null && (
                <text x={cx(i)} y={H - 8} fontSize={10} fontWeight={600} textAnchor="middle" fill={PCT_COLOR[p.status] ?? '#6b7280'}>{Math.round(p.achieved * 100)}%</text>
              )}
              {p.gross == null && p.target != null && (
                <text x={cx(i)} y={H - 8} fontSize={10} textAnchor="middle" fill="#9ca3af">목표</text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
