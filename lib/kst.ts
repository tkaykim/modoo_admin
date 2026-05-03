/**
 * 앱 전역에서 날짜·시간은 한국 표준시(KST, Asia/Seoul)로 표시합니다.
 * Vercel/로컬 서버 타임존과 무관하게 동일하게 보입니다.
 */
export const KST_TIMEZONE = 'Asia/Seoul' as const;

function parseDate(input: string | Date | null | undefined): Date | null {
  if (input == null || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

const kst = { timeZone: KST_TIMEZONE } as const;

/** 예: 2026년 4월 16일 오후 6:30 */
export function formatKstDateLong(input: string | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '-';
  return d.toLocaleString('ko-KR', {
    ...kst,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 예: 2026. 04. 16. (연·월·일 숫자 2자리) */
export function formatKstDateNumeric(input: string | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '-';
  return d.toLocaleDateString('ko-KR', {
    ...kst,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 예: 2026년 4월 16일 (시각 없음) */
export function formatKstDateOnly(input: string | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '-';
  return d.toLocaleDateString('ko-KR', {
    ...kst,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** 예: 2026. 4. 16. */
export function formatKstDateShort(input: string | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '-';
  return d.toLocaleDateString('ko-KR', {
    ...kst,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** 예: 4월 16일 (연·짧은 월) */
export function formatKstMonthDay(input: string | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '-';
  return d.toLocaleDateString('ko-KR', {
    ...kst,
    month: 'short',
    day: 'numeric',
  });
}

/** 예: 2026. 4. 16. 오후 6:30 */
export function formatKstDateTimeMedium(input: string | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '-';
  return d.toLocaleString('ko-KR', {
    ...kst,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 예: 04. 16. 오후 6:30 */
export function formatKstDateTimeCompact(input: string | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '-';
  return d.toLocaleString('ko-KR', {
    ...kst,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 예: 2026. 4. 16. 오후 6:30:00 */
export function formatKstDateTimeFull(input: string | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '-';
  return d.toLocaleString('ko-KR', {
    ...kst,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/** 오늘 날짜만 (문구용) */
export function formatKstTodayLong(): string {
  return new Date().toLocaleDateString('ko-KR', {
    ...kst,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** `<input type="datetime-local" />` 값 (KST 달력·시각) */
export function formatDatetimeLocalKst(d: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPart['type']) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** KST 기준 오늘인지 */
/** 로젠 접수일 등 KST 달력 기준 YYYYMMDD */
export function getKstYYYYMMDD(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPart['type']) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

export function isTodayKst(input: string | Date | null | undefined): boolean {
  const d = parseDate(input);
  if (!d) return false;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d) === fmt.format(new Date());
}
