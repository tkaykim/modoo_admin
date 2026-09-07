import { isTestOrder, revenueState } from './revenue';

/** Shared definitions for the channel report and marketing console. */
export const PAID_CHANNELS = new Set(['Meta 광고', '네이버 검색광고']);

export function channelOf(source?: string | null, medium?: string | null): string {
  const s = (source ?? '').trim().toLowerCase();
  const paid = /^(paid|paid_social|paid-social|cpc|ppc|paid_search|display|cpm)$/.test((medium ?? '').trim().toLowerCase());
  if (!s) return '직접·자연';
  if (['ig', 'fb', 'an', 'msg', 'th', 'meta', 'instagram', 'facebook', 'threads'].includes(s)) return paid ? 'Meta 광고' : 'SNS 자연';
  if (s === 'naver') return paid ? '네이버 검색광고' : '네이버 자연';
  if (s === 'kakao') return '카카오 채널';
  if (s === 'print' || s === 'kprint') return '오프라인·박람회';
  return '기타';
}

export function isConfirmedMarketingOrder(order: { id?: string; payment_status: string | null; order_status: string | null; utm_campaign?: string | null }): boolean {
  return revenueState(order) === 'paid' && !isTestOrder(order);
}

export function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null;
}

export function addReportingDays(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}

export function reportingRange(params: URLSearchParams, asOf = new Date(), maxDays = 180) {
  const rawDays = Number(params.get('days') ?? 14);
  if (!Number.isInteger(rawDays) || rawDays < 1 || rawDays > maxDays) throw new Error(`기간은 1~${maxDays}일이어야 합니다.`);
  const today = new Date(asOf.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  const requestedUntil = params.get('until') ?? (params.get('includeToday') === 'true' ? today : addReportingDays(today, -1));
  if (!valid(requestedUntil)) throw new Error('종료 날짜가 올바르지 않습니다.');
  const until = requestedUntil > today ? today : requestedUntil;
  const since = params.get('since') ?? addReportingDays(until, 1 - rawDays);
  if (!valid(since) || since > until) throw new Error('시작 날짜가 올바르지 않습니다.');
  const days = Math.round((Date.parse(until) - Date.parse(since)) / 86400000) + 1;
  if (days > maxDays) throw new Error(`최대 ${maxDays}일까지 조회할 수 있습니다.`);
  const toExclusive = new Date(Math.min(new Date(`${addReportingDays(until, 1)}T00:00:00+09:00`).getTime(), asOf.getTime())).toISOString();
  return { since, until, days, incomplete: until === today, fromIso: new Date(`${since}T00:00:00+09:00`).toISOString(), toExclusive };
}

export function reportingDays(since: string, until: string): string[] {
  const days: string[] = [];
  for (let day = since; day <= until; day = addReportingDays(day, 1)) days.push(day);
  return days;
}

type Action = { action_type?: string; value?: string | number };
type PurchaseInsight = { actions?: Action[]; action_values?: Action[]; spend?: string | number };
// A single website purchase definition, falling back to broader scopes only when absent.
const PURCHASE_TYPES = ['offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase', 'purchase', 'omni_purchase', 'onsite_conversion.purchase'];
export function metaPurchaseMetrics(insight?: PurchaseInsight, preferredType?: string | null) {
  const type = preferredType === undefined ? PURCHASE_TYPES.find((type) => insight?.actions?.some((a) => a.action_type === type) || insight?.action_values?.some((a) => a.action_type === type)) ?? null : preferredType;
  const read = (actions?: Action[]) => {
    const action = actions?.find((a) => a.action_type === type);
    if (!action || action.value === undefined) return null;
    const value = Number(action.value);
    return Number.isFinite(value) ? value : null;
  };
  const purchases = read(insight?.actions);
  const purchaseValue = read(insight?.action_values);
  const spend = insight?.spend === undefined ? null : Number(insight.spend);
  return { purchaseType: type, purchases, purchaseValue, roas: ratio(purchaseValue, spend) };
}

export function creativeVerdict(row: { spend: number; roas: number | null; purchases: number | null; effectiveStatus: string }, days: number) {
  if (row.roas === null || row.purchases === null) return { verdict: 'watch' as const, reason: '구매·매출 자료가 충분하지 않아 성과 판정을 보류합니다.' };
  if (days < 14) return { verdict: 'watch' as const, reason: '14일 미만의 조회 기간으로 성과 판정을 보류합니다.' };
  if (row.spend < 3000 && row.effectiveStatus !== 'ACTIVE') return { verdict: 'fresh' as const, reason: '아직 유의미한 지출이 없어 검수 후보입니다.' };
  if (row.spend >= 50000 && row.roas < 80) return { verdict: 'kill' as const, reason: 'Meta 보고 효율이 낮아 검토가 필요합니다. 최근 유입의 전환 지연과 원가를 함께 확인하세요.' };
  if (row.spend >= 10000 && row.purchases > 0 && row.roas >= 250) return { verdict: 'winner' as const, reason: 'Meta 보고 성과가 높은 검토 후보입니다. 최근 유입 고객의 14·28일 관찰이 완료된 것은 아닙니다.' };
  return { verdict: 'watch' as const, reason: '전환 지연과 주문 규모를 함께 확인한 뒤 판단하세요.' };
}

/** Bounds provider concurrency; callers must authenticate before invoking this helper. */
export async function mapConcurrent<T, U>(items: T[], concurrency: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const readCache = new Map<string, { expiresAt: number; promise: Promise<{ value: unknown; collectedAt: string }> }>();
/** Small process-local cache; failed reads are evicted, never cached as zero. Authenticate before calling. */
export async function cachedMarketingRead<T>(key: string, read: () => Promise<T>, bypass = false): Promise<{ value: T; collectedAt: string }> {
  const cached = readCache.get(key);
  if (!bypass && cached && cached.expiresAt > Date.now()) return cached.promise as Promise<{ value: T; collectedAt: string }>;
  if (readCache.size >= 32) readCache.delete(readCache.keys().next().value!);
  const promise = read().then((value) => ({ value, collectedAt: new Date().toISOString() }));
  readCache.set(key, { expiresAt: Date.now() + 60000, promise });
  try { return await promise; }
  catch (error) { if (readCache.get(key)?.promise === promise) readCache.delete(key); throw error; }
}
