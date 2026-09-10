'use client';

/**
 * 주간 매출 vs 목표 차트 (revenue-goals 전용, 반응형 SVG)
 *  - 막대 = 주간 실적(파랑 #2563eb, MiniBars 팔레트와 동일), 진행 중 주는 연한 파랑
 *  - 검정 가로선 = 그 주 목표 (같은 단위 ₩ → 단일 축)
 *  - 막대 위 값(만원), 아래 주 라벨, 목표 대비 % 는 색으로 (달성 초록·근접 노랑·미달 빨강)
 *  - hover 시 네이티브 title 로 상세
 */

type Row = {
  week_start: string; gross: number; target_gross: number | null; achieved: number | null;
  status: 'hit' | 'near' | 'miss' | 'current' | 'future' | 'no_goal';
};

const man = (n: number) => `${Math.round(n / 10_000).toLocaleString('ko-KR')}만`;
const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;
const md = (ymd: string) => { const d = new Date(`${ymd}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()}`; };
const PCT_COLOR: Record<string, string> = { hit: '#15803d', near: '#a16207', miss: '#b91c1c', current: '#1d4ed8' };

export default function WeeklyGoalChart({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  const W = 720, H = 220;
  const PAD = { l: 8, r: 8, t: 22, b: 34 };
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const max = Math.max(...rows.map((r) => Math.max(r.gross, r.target_gross ?? 0)), 1) * 1.08;
  const step = plotW / rows.length;
  const barW = Math.min(step * 0.56, 40);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-gray-600">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" /> 주간 매출</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-300" /> 이번 주(진행 중)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-4 bg-gray-900" /> 그 주 목표</span>
        <span className="text-gray-400">막대 아래 % = 목표 대비 달성률</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="주간 매출과 목표 비교">
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <line key={r} x1={PAD.l} x2={W - PAD.r} y1={y(max * r)} y2={y(max * r)} stroke="#f3f4f6" strokeWidth={1} />
        ))}
        {rows.map((r, i) => {
          const cx = PAD.l + i * step + step / 2;
          const x = cx - barW / 2;
          const isCur = r.status === 'current';
          const fill = isCur ? '#93c5fd' : '#2563eb';
          const top = y(r.gross);
          const h = Math.max(0, PAD.t + plotH - top);
          const title = `${md(r.week_start)} 주\n매출 ${won(r.gross)}${r.target_gross ? `\n목표 ${won(r.target_gross)} · 달성 ${Math.round((r.achieved ?? 0) * 100)}%` : ''}${isCur ? '\n(진행 중)' : ''}`;
          return (
            <g key={r.week_start}>
              <title>{title}</title>
              <rect x={PAD.l + i * step} y={PAD.t} width={step} height={plotH} fill="transparent" />
              <rect x={x} y={top} width={barW} height={h} rx={2} fill={fill} />
              {/* 목표선 — 막대보다 살짝 넓게 */}
              {r.target_gross != null && (
                <line x1={x - 4} x2={x + barW + 4} y1={y(r.target_gross)} y2={y(r.target_gross)} stroke="#111827" strokeWidth={2} />
              )}
              {/* 값 */}
              <text x={cx} y={top - 4} fontSize={10} textAnchor="middle" fill="#111827">{man(r.gross)}</text>
              {/* 주 라벨 + 달성률 */}
              <text x={cx} y={H - 20} fontSize={10} textAnchor="middle" fill="#6b7280">{md(r.week_start)}</text>
              {r.achieved != null && (
                <text x={cx} y={H - 7} fontSize={10} fontWeight={600} textAnchor="middle" fill={PCT_COLOR[r.status] ?? '#6b7280'}>
                  {Math.round(r.achieved * 100)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
