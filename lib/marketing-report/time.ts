/** KST 날짜/시간 헬퍼 — 모든 보고서가 한국 시간 기준 */

/** YYYY-MM-DD 형식의 KST 날짜 */
export function kstDateString(d: Date): string {
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
  const kst = new Date(utc + 9 * 3600_000);
  return kst.toISOString().slice(0, 10);
}

/** 오늘 KST */
export function todayKst(): string {
  return kstDateString(new Date());
}

/** N일 전 KST */
export function daysAgoKst(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return kstDateString(d);
}

/** 이번 주 월요일 KST */
export function monThisWeekKst(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utc + 9 * 3600_000);
  const dow = kst.getUTCDay(); // 0=Sun, 1=Mon
  const offset = dow === 0 ? 6 : dow - 1;
  kst.setUTCDate(kst.getUTCDate() - offset);
  return kst.toISOString().slice(0, 10);
}

/** 지난 주 월요일~일요일 (지난 주 데이터 보고용) */
export function lastWeekRangeKst(): { from: string; to: string } {
  const monThis = new Date(monThisWeekKst() + 'T00:00:00Z');
  const monLast = new Date(monThis);
  monLast.setUTCDate(monLast.getUTCDate() - 7);
  const sunLast = new Date(monLast);
  sunLast.setUTCDate(sunLast.getUTCDate() + 6);
  return {
    from: monLast.toISOString().slice(0, 10),
    to: sunLast.toISOString().slice(0, 10),
  };
}

/** KST 요일 (0=Sun, 1=Mon, ...) */
export function dayOfWeekKst(): number {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utc + 9 * 3600_000);
  return kst.getUTCDay();
}

/** 통화 포매팅 ₩1,234 */
export function won(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '–';
  const num = typeof n === 'number' ? n : parseFloat(n);
  if (!isFinite(num)) return '–';
  return '₩' + Math.round(num).toLocaleString('ko-KR');
}

/** 퍼센트 1자리 */
export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return '–';
  return n.toFixed(digits) + '%';
}
