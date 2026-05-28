/**
 * Microsoft Clarity Data Export API
 *
 * 토큰·project ID: modoo_admin/.env.local 의 CLARITY_API_TOKEN + CLARITY_PROJECT_ID
 * Docs: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
 *
 * 호출 단위: numOfDays = 1|2|3 (rolling window, 정확한 KST 일자 정렬 X)
 *   → 일일 리포트는 numOfDays=1, 주간은 numOfDays=3 (API 최대치)
 *
 * 응답 구조 (2026-05-26 raw 검증):
 *   [{ metricName: 'Traffic'|'DeadClickCount'|'RageClickCount'|'ScriptErrorCount'|...,
 *      information: [{ sessionsCount: '303', sessionsWithMetricPercentage: 14.52,
 *                      pagesViews: '67', subTotal: '158',
 *                      Url?: 'https://...' // dimension1=URL 호출 시
 *                    }, ...] }, ...]
 *
 *   주의: `sessionsCount`는 metric 발생 세션이 아니라 **base 세션 수**(분모).
 *         실제 발생 세션 = sessionsWithMetricPercentage × sessionsCount / 100.
 *         또는 subTotal = metric 총 발생 횟수.
 *         URL 필드는 `Url`(대문자 U만).
 */

const API = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

export interface ClarityRawMetric {
  metricName: string;
  information: Array<Record<string, string | number>>;
}

export interface ClaritySummary {
  totalSessions: number;
  totalBotSessions: number;
  avgEngagementSec: number;
  avgScrollDepth: number;        // 0~100 (Clarity는 %로 반환)
  rageClickSessions: number;
  deadClickSessions: number;
  excessiveScrollSessions: number;
  quickbackSessions: number;
  scriptErrorSessions: number;
  errorClickSessions: number;
  topBrowser: string | null;
  topDevice: string | null;       // Mobile / PC / Tablet
}

export interface ClarityPageRow {
  url: string;
  baseSessions: number;          // dimension row 자체의 base
  deadClickPct: number;          // % of base
  rageClickPct: number;
  scriptErrorPct: number;
  problemScore: number;          // 정렬용: deadPct + rageClickPct + scriptErrorPct
}

export interface ClarityReport {
  summary: ClaritySummary;
  topProblemPages: ClarityPageRow[];
  rawAvailable: boolean;
  notes: string[];
}

function authHeader(): Record<string, string> {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) throw new Error('CLARITY_API_TOKEN missing');
  return { Authorization: `Bearer ${token}` };
}

async function callClarity(numOfDays: 1 | 2 | 3, dimensions: string[] = []): Promise<ClarityRawMetric[]> {
  const params = new URLSearchParams();
  params.set('numOfDays', String(numOfDays));
  dimensions.slice(0, 3).forEach((d, i) => params.set(`dimension${i + 1}`, d));
  const url = `${API}?${params.toString()}`;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Clarity API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

/** metric에서 실제 발생 세션 수 산출 (sessionsCount는 base 전체) */
function actualSessionsFromMetric(metric: ClarityRawMetric | undefined): number {
  if (!metric || metric.information.length === 0) return 0;
  const row = metric.information[0];
  const base = Number(row['sessionsCount'] ?? 0);
  const pct = Number(row['sessionsWithMetricPercentage'] ?? 0);
  return Math.round((base * pct) / 100);
}

function firstNum(metric: ClarityRawMetric | undefined, field: string): number {
  if (!metric || metric.information.length === 0) return 0;
  return Number(metric.information[0][field] ?? 0);
}

function topName(metric: ClarityRawMetric | undefined): string | null {
  if (!metric || metric.information.length === 0) return null;
  // information은 sessionsCount 내림차순으로 보통 정렬되어 있음
  const sorted = [...metric.information].sort((a, b) => Number(b['sessionsCount'] ?? 0) - Number(a['sessionsCount'] ?? 0));
  const top = sorted[0];
  return top ? String(top['name'] ?? '') || null : null;
}

/** dimension1=URL 호출의 metric별 row 합산 — URL 단위 metric % 추출 */
function buildPageMap(metric: ClarityRawMetric | undefined): Map<string, { base: number; pct: number }> {
  const map = new Map<string, { base: number; pct: number }>();
  if (!metric) return map;
  for (const row of metric.information) {
    const url = String(row['Url'] ?? row['URL'] ?? row['url'] ?? '');
    if (!url) continue;
    const base = Number(row['sessionsCount'] ?? 0);
    const pct = Number(row['sessionsWithMetricPercentage'] ?? 0);
    if (base <= 0) continue;
    // 같은 URL이 여러 row로 쪼개진 경우 (드물지만) 더 큰 pct 우선
    const cur = map.get(url);
    if (!cur || cur.pct < pct) map.set(url, { base, pct });
  }
  return map;
}

/** 어제 (rolling 24h) 요약 + URL별 문제 페이지 TOP */
export async function fetchClarityReport(numOfDays: 1 | 2 | 3 = 1): Promise<ClarityReport> {
  // 1차: 전체 요약 (dimension 없음)
  const overall = await callClarity(numOfDays);
  const byName = new Map<string, ClarityRawMetric>();
  for (const m of overall) byName.set(m.metricName, m);

  const traffic = byName.get('Traffic');
  const engagement = byName.get('EngagementTime');
  const scroll = byName.get('ScrollDepth');

  const summary: ClaritySummary = {
    totalSessions: firstNum(traffic, 'totalSessionCount'),
    totalBotSessions: firstNum(traffic, 'totalBotSessionCount'),
    avgEngagementSec: firstNum(engagement, 'activeTime'),
    avgScrollDepth: firstNum(scroll, 'averageScrollDepth'),  // 0~100
    rageClickSessions: actualSessionsFromMetric(byName.get('RageClickCount')),
    deadClickSessions: actualSessionsFromMetric(byName.get('DeadClickCount')),
    excessiveScrollSessions: actualSessionsFromMetric(byName.get('ExcessiveScroll')),
    quickbackSessions: actualSessionsFromMetric(byName.get('QuickbackClick')),
    scriptErrorSessions: actualSessionsFromMetric(byName.get('ScriptErrorCount')),
    errorClickSessions: actualSessionsFromMetric(byName.get('ErrorClickCount')),
    topBrowser: topName(byName.get('Browser')),
    topDevice: topName(byName.get('Device')),
  };

  // 2차: URL 단위 — dimension=URL 한 번 호출로 모든 metric의 URL 분해가 같이 옴
  const notes: string[] = [];
  let topProblemPages: ClarityPageRow[] = [];
  try {
    const byUrl = await callClarity(numOfDays, ['URL']);
    const urlByName = new Map<string, ClarityRawMetric>();
    for (const m of byUrl) urlByName.set(m.metricName, m);

    const dead = buildPageMap(urlByName.get('DeadClickCount'));
    const rage = buildPageMap(urlByName.get('RageClickCount'));
    const err = buildPageMap(urlByName.get('ScriptErrorCount'));

    const urls = new Set<string>([...dead.keys(), ...rage.keys(), ...err.keys()]);
    const rows: ClarityPageRow[] = [];
    for (const url of urls) {
      const d = dead.get(url);
      const r = rage.get(url);
      const e = err.get(url);
      const base = Math.max(d?.base ?? 0, r?.base ?? 0, e?.base ?? 0);
      if (base < 5) continue;  // 너무 작은 표본 제외
      const deadPct = d?.pct ?? 0;
      const ragePct = r?.pct ?? 0;
      const errPct = e?.pct ?? 0;
      const score = deadPct * 1.0 + ragePct * 2.0 + errPct * 1.5;
      if (score <= 0) continue;
      rows.push({
        url,
        baseSessions: base,
        deadClickPct: deadPct,
        rageClickPct: ragePct,
        scriptErrorPct: errPct,
        problemScore: score,
      });
    }
    topProblemPages = rows.sort((a, b) => b.problemScore - a.problemScore).slice(0, 8);
  } catch (e) {
    notes.push(`URL breakdown failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    summary,
    topProblemPages,
    rawAvailable: overall.length > 0,
    notes,
  };
}
