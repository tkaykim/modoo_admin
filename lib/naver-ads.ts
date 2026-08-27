/**
 * 네이버 검색광고 API 클라이언트 (관리자 대시보드용, 조회 전용).
 *
 * 워커(`tkay_personal/worker/src/tools/naver-searchad.ts`)의 축소판이다.
 * 관리자 화면은 조회만 하므로 쓰기 함수는 의도적으로 옮기지 않았다 —
 * 집행 변경은 승인 게이트가 붙은 워커 CLI 경로로만 한다.
 */

import { createHmac } from 'node:crypto';

const BASE_URL = 'https://api.searchad.naver.com';

export type NaverAdCreds = { apiKey: string; secretKey: string; customerId: string };

export function getCreds(): NaverAdCreds | null {
  const apiKey = (process.env.NAVER_AD_API_KEY ?? '').trim();
  const secretKey = (process.env.NAVER_AD_SECRET_KEY ?? '').trim();
  const customerId = (process.env.NAVER_AD_CUSTOMER_ID ?? '').trim();
  if (!apiKey || !secretKey || !customerId) return null;
  return { apiKey, secretKey, customerId };
}

/** 서명 원문은 `{timestamp}.{METHOD}.{path}` — 쿼리스트링을 넣으면 401이다. */
function sign(timestamp: string, method: string, path: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(`${timestamp}.${method.toUpperCase()}.${path}`).digest('base64');
}

/**
 * 쿼리 직렬화 규칙 (실측 확정):
 *  - 배열 → 반복 파라미터 (`ids=A&ids=B`). JSON 배열이면 `11001 유효하지 않은 ID 형식`.
 *  - 객체 → JSON 문자열.
 *  - `fields`는 배열이지만 JSON 문자열이어야 한다 → 호출측에서 stringify 해서 넘긴다.
 */
function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const item of value) usp.append(key, String(item));
    else if (typeof value === 'object') usp.append(key, JSON.stringify(value));
    else usp.append(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(path: string, creds: NaverAdCreds, query?: Record<string, unknown>): Promise<T> {
  const timestamp = String(Date.now());
  const res = await fetch(`${BASE_URL}${path}${buildQuery(query)}`, {
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Timestamp': timestamp,
      'X-API-KEY': creds.apiKey,
      'X-Customer': creds.customerId,
      'X-Signature': sign(timestamp, 'GET', path, creds.secretKey),
    },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[naver-ads] GET ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export type NaverCampaign = { nccCampaignId: string; name: string; campaignTp: string; status?: string; dailyBudget?: number; userLock?: boolean };
export type NaverAdGroup = { nccAdgroupId: string; nccCampaignId: string; name: string; bidAmt?: number; dailyBudget?: number; status?: string; userLock?: boolean };
export type NaverKeyword = { nccKeywordId: string; nccAdgroupId: string; keyword: string; bidAmt?: number; useGroupBidAmt?: boolean; userLock?: boolean; nccQi?: { qiGrade?: number } };
export type NaverStatRow = { id?: string; dateStart?: string; impCnt?: number; clkCnt?: number; ctr?: number; cpc?: number; salesAmt?: number; avgRnk?: number };

const STAT_FIELDS = ['impCnt', 'clkCnt', 'ctr', 'cpc', 'avgRnk', 'salesAmt'];

export const listCampaigns = (c: NaverAdCreds) => request<NaverCampaign[]>('/ncc/campaigns', c);
export const listAdGroups = (c: NaverAdCreds) => request<NaverAdGroup[]>('/ncc/adgroups', c);
export const listKeywords = (c: NaverAdCreds, nccAdgroupId: string) =>
  request<NaverKeyword[]>('/ncc/keywords', c, { nccAdgroupId });
export const getBizMoney = (c: NaverAdCreds) =>
  request<{ bizmoney: number }>('/billing/bizmoney', c);

/**
 * 단일 대상의 일별 성과. `ids`(복수)와 달리 실적 0인 날도 행이 와서
 * "집행이 없었는지 / 성과만 나쁜지"를 구분할 수 있다.
 */
export async function getDailyStats(c: NaverAdCreds, id: string, since: string, until: string): Promise<NaverStatRow[]> {
  const res = await request<{ data?: NaverStatRow[] }>('/stats', c, {
    id,
    fields: JSON.stringify(STAT_FIELDS),
    timeRange: { since, until },
  });
  return res?.data ?? [];
}

/** 여러 대상의 기간 합계. ⚠ 실적 0인 대상은 응답에서 통째로 빠진다. */
export async function getStats(c: NaverAdCreds, ids: string[], since: string, until: string): Promise<NaverStatRow[]> {
  if (!ids.length) return [];
  const out: NaverStatRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const res = await request<{ data?: NaverStatRow[] } | NaverStatRow[]>('/stats', c, {
      ids: ids.slice(i, i + 100),
      fields: JSON.stringify(STAT_FIELDS),
      timeRange: { since, until },
    });
    out.push(...(Array.isArray(res) ? res : (res?.data ?? [])));
  }
  return out;
}

/** KST 기준 최근 N일 범위 (네이버 통계는 KST 달력일) */
export function rangeFromDays(days: number): { since: string; until: string } {
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const until = kstNow.toISOString().slice(0, 10);
  const since = new Date(kstNow.getTime() - (days - 1) * 86400_000).toISOString().slice(0, 10);
  return { since, until };
}
