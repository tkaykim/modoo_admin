export type Grain = 'hour' | 'day' | 'week' | 'month';
export const DAY = 86400000;
export function dayKey(iso: string | Date = new Date()): string {
  return new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
export function validateYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function kstIso(ymd: string): string {
  if (!validateYmd(ymd)) throw new RangeError('날짜 형식이 올바르지 않습니다.');
  return new Date(`${ymd}T00:00:00+09:00`).toISOString();
}
export function addDays(ymd: string, count: number): string {
  return new Date(Date.parse(ymd + 'T00:00:00Z') + count * DAY).toISOString().slice(0, 10);
}
export function monthStart(ymd: string, offset = 0): string {
  const d = new Date(ymd + 'T00:00:00Z');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
}
export function weekStart(ymd: string): string {
  const dow = new Date(ymd + 'T00:00:00Z').getUTCDay();
  return addDays(ymd, -(dow + 6) % 7);
}
export function bucketKey(iso: string, grain: Grain): string {
  const civil = new Date(Date.parse(iso) + 9 * 3600000).toISOString();
  if (grain === 'hour') return civil.slice(0, 13).replace('T', ' ');
  if (grain === 'month') return civil.slice(0, 7);
  return grain === 'week' ? weekStart(civil.slice(0, 10)) : civil.slice(0, 10);
}
export function bucketStart(key: string, grain: Grain): string {
  return grain === 'hour' ? new Date(key.replace(' ', 'T') + ':00:00+09:00').toISOString() : kstIso(grain === 'month' ? key + '-01' : key);
}
export function bucketEnd(key: string, grain: Grain): string {
  if (grain === 'hour') return new Date(Date.parse(bucketStart(key, grain)) + 3600000).toISOString();
  return kstIso(grain === 'month' ? monthStart(key + '-01', 1) : addDays(key, grain === 'week' ? 7 : 1));
}
export function bucketKeys(fromIso: string, toIso: string, grain: Grain): string[] {
  const keys: string[] = [];
  let start = Date.parse(fromIso);
  while (start < Date.parse(toIso)) {
    const key = bucketKey(new Date(start).toISOString(), grain);
    keys.push(key);
    start = Date.parse(bucketEnd(key, grain));
    if (keys.length > 1000) throw new RangeError('표시 범위가 너무 큽니다. 집계 단위를 바꿔 주세요.');
  }
  return keys;
}
export function bucketLabel(key: string, grain: Grain): string {
  if (grain === 'hour') return `${key.slice(5, 10)} ${key.slice(11)}시`;
  if (grain === 'month') return `${key.slice(0, 4)}.${key.slice(5)}`;
  if (grain === 'week') return `${key.slice(5)}~${addDays(key, 6).slice(5)}`;
  return key.slice(5);
}
export function trendRange(grain: Grain, count: number, offset = 0, completedOnly = false, asOf = new Date()) {
  const today = dayKey(asOf);
  const current = grain === 'month' ? monthStart(today) : grain === 'week' ? weekStart(today) : today;
  const shift = offset - (completedOnly ? 1 : 0);
  const last = grain === 'month' ? monthStart(current, shift) : addDays(current, shift * (grain === 'week' ? 7 : 1));
  const fromYmd = grain === 'month' ? monthStart(last, -(count - 1)) : addDays(last, -(count - 1) * (grain === 'week' ? 7 : 1));
  const toYmd = grain === 'month' ? monthStart(last, 1) : addDays(last, grain === 'week' ? 7 : 1);
  return {fromYmd, toYmd};
}
/** Last displayed bucket versus the preceding calendar bucket, matching elapsed time when partial. */
export function lastBucketComparison(fromIso: string, toIso: string, grain: Grain, steps = 1) {
  const keys = bucketKeys(fromIso, toIso, grain);
  const key = keys.at(-1);
  if (!key) return null;
  const fullStart = Date.parse(bucketStart(key, grain)), fullEnd = Date.parse(bucketEnd(key, grain));
  const from = Math.max(fullStart, Date.parse(fromIso)), to = Math.min(fullEnd, Date.parse(toIso));
  const priorKey = grain === 'month' ? monthStart(key + '-01', -steps).slice(0, 7)
    : bucketKey(new Date(fullStart - steps * (grain === 'week' ? 7 * DAY : grain === 'hour' ? 3600000 : DAY)).toISOString(), grain);
  const priorStart = Date.parse(bucketStart(priorKey, grain)), priorEnd = Date.parse(bucketEnd(priorKey, grain));
  const full = from === fullStart && to === fullEnd;
  const sharedEnd = Math.min(to - fullStart, priorEnd - priorStart);
  if (!full && from - fullStart >= sharedEnd) return null;
  return {
    current: {fromIso:new Date(from).toISOString(),toIso:new Date(full ? to : fullStart + sharedEnd).toISOString()},
    previous: {fromIso:new Date(full ? priorStart : priorStart + from - fullStart).toISOString(),toIso:new Date(full ? priorEnd : priorStart + sharedEnd).toISOString()},
  };
}
/** Complete days only: an in-flight ad day cannot be matched to prior intraday spend. */
export function calendarComparison(fromYmd: string, toYmd: string, asOf = new Date()) {
  const today = dayKey(asOf);
  const end = toYmd < today ? toYmd : today;
  const fullYear = fromYmd.endsWith('-01-01') && toYmd === monthStart(fromYmd, 12);
  if (fullYear) {
    const prevFrom = monthStart(fromYmd, -12);
    if (toYmd <= today) return {current: {fromYmd, toYmd}, previous: {fromYmd: prevFrom, toYmd: fromYmd}};
    const elapsed = Math.max(0, Math.min((Date.parse(end) - Date.parse(fromYmd)) / DAY, (Date.parse(fromYmd) - Date.parse(prevFrom)) / DAY));
    return {current: {fromYmd, toYmd: addDays(fromYmd, elapsed)}, previous: {fromYmd: prevFrom, toYmd: addDays(prevFrom, elapsed)}};
  }
  const fullMonth = fromYmd.endsWith('-01') && toYmd === monthStart(fromYmd, 1);
  if (fullMonth) {
    const prevFrom = monthStart(fromYmd, -1);
    if (toYmd <= today) return {current: {fromYmd, toYmd}, previous: {fromYmd: prevFrom, toYmd: fromYmd}};
    const elapsed = Math.max(0, Math.min((Date.parse(end) - Date.parse(fromYmd)) / DAY, (Date.parse(fromYmd) - Date.parse(prevFrom)) / DAY));
    return {current: {fromYmd, toYmd: addDays(fromYmd, elapsed)}, previous: {fromYmd: prevFrom, toYmd: addDays(prevFrom, elapsed)}};
  }
  const span = Math.round((Date.parse(toYmd) - Date.parse(fromYmd)) / DAY);
  const elapsed = Math.max(0, Math.round((Date.parse(end) - Date.parse(fromYmd)) / DAY));
  const previousFrom = addDays(fromYmd, -span);
  return {current: {fromYmd, toYmd: addDays(fromYmd, elapsed)}, previous: {fromYmd: previousFrom, toYmd: addDays(previousFrom, elapsed)}};
}
