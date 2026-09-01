'use client';

/**
 * 의존성 없는 미니 차트 2종 (SVG/CSS).
 *
 * 팔레트는 dataviz 검증기 통과본이다 (lightness·chroma·CVD·contrast 전 항목 PASS):
 *   Meta 광고 #2563eb · 네이버 검색광고 #0d9488 · 기타 #8b5cf6
 * 색은 엔티티(채널)에 고정한다 — 시리즈 수가 바뀌어도 색을 재배정하지 않는다.
 * 축은 하나만 쓴다 (이중축 금지). 값 텍스트는 잉크 색, 색은 마크에만.
 */

export const CHANNEL_COLORS: Record<string, string> = {
  'Meta 광고': '#2563eb',
  '네이버 검색광고': '#0d9488',
  기타: '#8b5cf6',
};

type Segment = { key: string; value: number };
export type TrendBarDatum = { label: string; segments: Segment[] };

const fmt = (v: number) => `₩${new Intl.NumberFormat('ko-KR').format(Math.round(v))}`;

/**
 * 스택 컬럼 차트. 세그먼트 사이 2px 서피스 갭, 스택 최상단만 2px 라운드,
 * 컬럼 hover 시 네이티브 title 로 일자별 분해를 보여준다.
 */
export function TrendBars({
  data,
  colors = CHANNEL_COLORS,
  height = 120,
  valueFormat = fmt,
}: {
  data: TrendBarDatum[];
  colors?: Record<string, string>;
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  if (!data.length) return null;
  const totals = data.map((d) => d.segments.reduce((a, s) => a + s.value, 0));
  const max = Math.max(...totals, 1);
  const keys = [...new Set(data.flatMap((d) => d.segments.map((s) => s.key)))];

  const W = Math.max(data.length * 18, 240);
  const H = height;
  const plotH = H - 18; // 하단 라벨 공간
  const barW = Math.max(Math.floor(W / data.length) - 2, 6);
  const step = W / data.length;

  return (
    <div>
      {/* 범례 — 시리즈 2개 이상이면 항상 표시 */}
      {keys.length > 1 && (
        <div className="mb-1 flex flex-wrap gap-3 px-1">
          {keys.map((k) => (
            <span key={k} className="flex items-center gap-1 text-[11px] text-gray-600">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[k] ?? '#8b5cf6' }} />
              {k}
            </span>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <svg width={W} height={H} role="img" aria-label="일별 추이 차트">
          {/* 은은한 그리드 3줄 */}
          {[0.25, 0.5, 0.75].map((r) => (
            <line key={r} x1={0} x2={W} y1={plotH * (1 - r)} y2={plotH * (1 - r)} stroke="#f3f4f6" strokeWidth={1} />
          ))}
          {data.map((d, i) => {
            const total = totals[i];
            let y = plotH;
            const x = i * step + (step - barW) / 2;
            const title = `${d.label}\n합계 ${valueFormat(total)}\n${d.segments
              .filter((s) => s.value > 0)
              .map((s) => `${s.key} ${valueFormat(s.value)}`)
              .join('\n')}`;
            const nonZero = d.segments.filter((s) => s.value > 0);
            return (
              <g key={d.label}>
                <title>{title}</title>
                {/* hover 히트영역 — 마크보다 크게 */}
                <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
                {nonZero.map((s, j) => {
                  const h = (s.value / max) * plotH;
                  y -= h;
                  const isTop = j === nonZero.length - 1;
                  const gap = j > 0 ? 1 : 0; // 세그먼트 사이 서피스 갭
                  const segY = y + gap;
                  const segH = Math.max(h - gap, 0);
                  const fill = colors[s.key] ?? '#8b5cf6';
                  // 데이터 끝(상단)만 둥글린다 — rect rx 는 네 모서리를 다 둥글려
                  // 작은 막대가 알약이 되므로 최상단 세그먼트는 path 로 그린다.
                  if (!isTop || segH < 2) {
                    return <rect key={s.key} x={x} y={segY} width={barW} height={segH} fill={fill} />;
                  }
                  const r = Math.min(3, segH / 2, barW / 2);
                  const pathD = [
                    `M ${x} ${segY + segH}`,
                    `V ${segY + r}`,
                    `Q ${x} ${segY} ${x + r} ${segY}`,
                    `H ${x + barW - r}`,
                    `Q ${x + barW} ${segY} ${x + barW} ${segY + r}`,
                    `V ${segY + segH}`,
                    'Z',
                  ].join(' ');
                  return <path key={s.key} d={pathD} fill={fill} />;
                })}
                {/* x 라벨 — 4일 간격으로만 (충돌 방지) */}
                {i % Math.ceil(data.length / 8) === 0 && (
                  <text x={i * step + step / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="#9ca3af">
                    {d.label.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * 표 셀 안의 비율 막대 — 값 텍스트는 잉크 색으로 위에, 막대는 뒤에 연하게.
 */
export function InlineBar({
  value,
  max,
  color = '#2563eb',
  children,
}: {
  value: number;
  max: number;
  color?: string;
  children: React.ReactNode;
}) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <div className="relative min-w-[90px]">
      <div
        className="absolute inset-y-0 left-0 rounded-sm"
        style={{ width: `${ratio * 100}%`, background: color, opacity: 0.14 }}
      />
      <span className="relative px-1">{children}</span>
    </div>
  );
}
