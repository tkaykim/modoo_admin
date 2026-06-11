// 분석 탭 공용 기간 컨트롤 로직 (매출 분석 · 광고 효율 등에서 공유).
// 일/주/월/연/기간선택 + ◀▶ 오프셋 → 조회 기간(KST) 계산.

export type Granularity = 'day' | 'week' | 'month' | 'year' | 'custom';

export const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
  { value: 'year', label: '연간' },
  { value: 'custom', label: '기간선택' },
];

export const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export type Bucket = 'hour' | 'day' | 'month';

export type Period = {
  fromYmd: string;
  toYmd: string; // exclusive
  bucket: Bucket;
  label: string;
  atCurrent: boolean;
};

// UTC 필드가 KST 민간시각을 나타내는 Date
export function kstCivilNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60000);
}
export function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function isoKst(ymdStr: string): string {
  return `${ymdStr}T00:00:00+09:00`;
}
export function todayKstYmd(): string {
  return ymd(kstCivilNow());
}
function mdLabel(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// granularity + offset(0=현재, 음수=과거) → 조회 기간(KST) 계산
export function periodFor(g: Granularity, offset: number, customFrom: string, customTo: string): Period {
  const now = kstCivilNow();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (g === 'day') {
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() + offset);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    const label =
      offset === 0 ? '오늘' : offset === -1 ? '어제' : offset === -2 ? '그제'
        : `${mdLabel(from)}(${DOW[from.getUTCDay()]})`;
    return { fromYmd: ymd(from), toYmd: ymd(to), bucket: 'hour', label, atCurrent: offset >= 0 };
  }

  if (g === 'week') {
    const dow = today.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow; // 월요일 시작
    const monday = new Date(today);
    monday.setUTCDate(monday.getUTCDate() + diff + offset * 7);
    const to = new Date(monday);
    to.setUTCDate(to.getUTCDate() + 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const label =
      offset === 0 ? '이번주' : offset === -1 ? '지난주' : offset === -2 ? '2주 전'
        : `${mdLabel(monday)}~${mdLabel(sunday)}`;
    return { fromYmd: ymd(monday), toYmd: ymd(to), bucket: 'day', label, atCurrent: offset >= 0 };
  }

  if (g === 'month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const label =
      offset === 0 ? '이번달' : offset === -1 ? '지난달'
        : from.getUTCFullYear() === now.getUTCFullYear()
          ? `${from.getUTCMonth() + 1}월`
          : `${from.getUTCFullYear()}.${from.getUTCMonth() + 1}`;
    return { fromYmd: ymd(from), toYmd: ymd(to), bucket: 'day', label, atCurrent: offset >= 0 };
  }

  if (g === 'year') {
    const y = now.getUTCFullYear() + offset;
    const from = new Date(Date.UTC(y, 0, 1));
    const to = new Date(Date.UTC(y + 1, 0, 1));
    const label = offset === 0 ? '올해' : offset === -1 ? '작년' : `${y}년`;
    return { fromYmd: ymd(from), toYmd: ymd(to), bucket: 'month', label, atCurrent: offset >= 0 };
  }

  // custom: customTo 를 포함하도록 +1일 exclusive
  const toEx = new Date(`${customTo}T00:00:00Z`);
  toEx.setUTCDate(toEx.getUTCDate() + 1);
  return {
    fromYmd: customFrom,
    toYmd: ymd(toEx),
    bucket: 'day',
    label: `${customFrom} ~ ${customTo}`,
    atCurrent: true,
  };
}

// 직전 동일 길이 기간 (전기간 대비 비교용). 반환 toYmd 는 exclusive.
export function previousPeriodYmd(period: Period): { fromYmd: string; toYmd: string } {
  const from = new Date(`${period.fromYmd}T00:00:00Z`);
  const to = new Date(`${period.toYmd}T00:00:00Z`);
  const lenDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  const prevFrom = new Date(from);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - lenDays);
  return { fromYmd: ymd(prevFrom), toYmd: period.fromYmd };
}
