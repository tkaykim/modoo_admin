/**
 * 진단 내러티브 — 좋은점 3 / 위험 3 / 액션 3
 *
 * LLM 없이 deterministic 규칙. 임계치·문구 모두 코드에 박혀 있어 수치 hallucination 0.
 * 새로운 진단 규칙은 picker 함수에 추가.
 */

import type { OrderSummary } from './fetchSupabase';
import type { GA4Overall, GA4FunnelStep, GA4DeviceRow, GA4NewReturningRow } from './fetchGA4';
import type { AdLeakDiagnosis } from './fetchMeta';
import type { ClaritySummary, ClarityPageRow } from './fetchClarity';

export interface NarrativeInput {
  supa: OrderSummary;
  prevSupa: OrderSummary;
  metaSpend: number;
  realRoas: number;
  ads: AdLeakDiagnosis[];
  ga4Overall: GA4Overall;
  ga4Funnel: GA4FunnelStep[];
  ga4Devices: GA4DeviceRow[];
  ga4Cohort: GA4NewReturningRow[];
  clarity?: { summary: ClaritySummary; topProblemPages: ClarityPageRow[] };
}

export interface Narrative {
  good: string[];
  risk: string[];
  action: string[];
}

const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;
const pp = (n: number) => `${n.toFixed(1)}%`;

function pct(now: number, prev: number): number {
  if (prev === 0) return now > 0 ? 100 : 0;
  return ((now - prev) / prev) * 100;
}

export function buildNarrative(d: NarrativeInput): Narrative {
  const good: string[] = [];
  const risk: string[] = [];
  const action: string[] = [];

  // ─── 매출 / ROAS ─────────────────────────────────
  const revDelta = pct(d.supa.revenue, d.prevSupa.revenue);
  if (revDelta >= 20) good.push(`매출 전일 대비 +${revDelta.toFixed(0)}% (${won(d.supa.revenue)})`);
  if (revDelta <= -20) risk.push(`매출 전일 대비 ${revDelta.toFixed(0)}% (${won(d.supa.revenue)})`);

  if (d.metaSpend > 0) {
    if (d.realRoas >= 3) good.push(`실제 ROAS ${d.realRoas.toFixed(2)}× — 광고비 1원당 ${won(d.realRoas)} 매출`);
    else if (d.realRoas < 1) risk.push(`실제 ROAS ${d.realRoas.toFixed(2)}× — 광고비 ${won(d.metaSpend)} 대비 매출 ${won(d.supa.revenue)} 회수 부진`);
  }

  if (d.supa.marginPct >= 40) good.push(`gross 마진 ${pp(d.supa.marginPct)} — 건당 평균 ${won(d.supa.grossProfit / Math.max(1, d.supa.orders))} 이익`);
  else if (d.supa.marginPct > 0 && d.supa.marginPct < 20) risk.push(`gross 마진 ${pp(d.supa.marginPct)} — 원가 ↑ 또는 할인 ↑ 확인`);

  // ─── GA4 funnel drop-off ────────────────────────
  // 최악의 drop-off 단계 식별
  let worstStep: GA4FunnelStep | null = null;
  let worstDrop = 0;
  for (let i = 1; i < d.ga4Funnel.length; i++) {
    const drop = 100 - d.ga4Funnel[i].conversionFromPrevPct;
    if (drop > worstDrop && d.ga4Funnel[i - 1].users >= 20) {
      worstDrop = drop;
      worstStep = d.ga4Funnel[i];
    }
  }
  if (worstStep && worstDrop >= 70) {
    risk.push(`funnel: ${worstStep.step} 단계에서 ${worstDrop.toFixed(0)}% 이탈 (직전 단계 대비)`);
    action.push(`${worstStep.step} 단계 UX 점검 — Clarity 세션 녹화로 어디서 막히는지 확인`);
  }

  // 전체 funnel 전환율 (view_item → purchase)
  const finalStep = d.ga4Funnel[d.ga4Funnel.length - 1];
  if (finalStep && d.ga4Funnel[0].users >= 50) {
    const e2e = finalStep.conversionFromTopPct;
    if (e2e >= 2) good.push(`상품조회→구매 전환율 ${pp(e2e)} (업계 평균 1~2%)`);
    else if (e2e < 0.5 && finalStep.users === 0) risk.push(`상품조회 ${d.ga4Funnel[0].users}명 중 구매 0건 — 어딘가 완전 차단`);
  }

  // ─── 디바이스 갭 ────────────────────────────────
  const mobile = d.ga4Devices.find((x) => x.device === 'mobile');
  const desktop = d.ga4Devices.find((x) => x.device === 'desktop');
  if (mobile && desktop && mobile.sessions >= 30 && desktop.sessions >= 10) {
    const gap = desktop.conversionRate - mobile.conversionRate;
    if (gap >= 1.0 && desktop.conversionRate > 0) {
      const ratio = mobile.conversionRate / desktop.conversionRate;
      risk.push(`모바일 전환율 ${pp(mobile.conversionRate)} vs 데스크탑 ${pp(desktop.conversionRate)} — 모바일이 ${(ratio * 100).toFixed(0)}% 수준`);
      action.push('모바일 결제·옵션 UX 점검 — Clarity 모바일 세션 녹화 우선');
    }
  }

  // ─── 신규 vs 재방문 ─────────────────────────────
  const newC = d.ga4Cohort.find((x) => x.cohort === 'new');
  const ret = d.ga4Cohort.find((x) => x.cohort === 'returning');
  if (newC && ret && newC.sessions >= 30 && ret.sessions >= 10) {
    // 신규 전환율이 0이면 ratio가 무한대 — 절대값으로 임계치 체크
    if (newC.conversionRate > 0 && ret.conversionRate >= newC.conversionRate * 2) {
      good.push(`재방문 전환율 ${pp(ret.conversionRate)} — 신규 ${pp(newC.conversionRate)} 대비 ${(ret.conversionRate / newC.conversionRate).toFixed(1)}× (재방문 가치 높음)`);
    } else if (newC.conversionRate === 0 && ret.conversionRate >= 1) {
      good.push(`재방문 전환율 ${pp(ret.conversionRate)} — 신규는 0%, 재방문에서만 매출 발생`);
    }
    if (newC.sessions / (newC.sessions + ret.sessions) >= 0.85 && newC.conversionRate < 1) {
      risk.push(`방문 ${((newC.sessions / (newC.sessions + ret.sessions)) * 100).toFixed(0)}%가 신규인데 신규 전환율 ${pp(newC.conversionRate)} — 트래픽 품질 의심`);
    }
  }

  // ─── 광고별 leak ───────────────────────────────
  const leakAds = d.ads.filter((a) => !a.tags.includes('healthy'));
  const bigSpenders = leakAds.filter((a) => a.spendShare >= 0.2);
  if (bigSpenders.length > 0) {
    const a = bigSpenders[0];
    risk.push(`광고 "${a.name}" 예산 ${(a.spendShare * 100).toFixed(0)}% 차지인데 ${a.primaryIssue}`);
    if (a.tags.includes('landing_page')) action.push(`"${a.name}" 랜딩 페이지 교체 또는 광고 카피·타겟 재조정`);
    else if (a.tags.includes('option_step')) action.push(`"${a.name}" 클릭하는 사람 옵션 선택 단계 점검 (가격·옵션 표기)`);
    else if (a.tags.includes('checkout_step')) action.push(`"${a.name}" 결제 단계 점검 (결제수단·필수입력 항목)`);
    else if (a.tags.includes('creative_weak')) action.push(`"${a.name}" 광고 소재 자체 교체 — CTR 평균 ½ 미만`);
    else if (a.tags.includes('high_spend_low_roas')) action.push(`"${a.name}" 예산 감액 또는 일시 정지 검토`);
  }
  const healthy = d.ads.filter((a) => a.tags.includes('healthy') && a.roas >= 2);
  if (healthy.length > 0) {
    const top = healthy.sort((x, y) => y.roas - x.roas)[0];
    good.push(`광고 "${top.name}" ROAS ${top.roas.toFixed(2)}× — 예산 확대 후보`);
  }

  // ─── Clarity UX 신호 ────────────────────────────
  if (d.clarity && d.clarity.summary.totalSessions > 0) {
    const s = d.clarity.summary;
    const rageRate = s.totalSessions > 0 ? (s.rageClickSessions / s.totalSessions) * 100 : 0;
    const errorRate = s.totalSessions > 0 ? (s.scriptErrorSessions / s.totalSessions) * 100 : 0;

    if (rageRate >= 3) {
      risk.push(`rage click ${s.rageClickSessions}세션 (${pp(rageRate)}) — 클릭 안 먹는 버튼 있음`);
    }
    if (errorRate >= 2) {
      risk.push(`JS 에러 ${s.scriptErrorSessions}세션 (${pp(errorRate)}) — 코드 버그 가능`);
    }
    if (d.clarity.topProblemPages.length > 0) {
      const p = d.clarity.topProblemPages[0];
      const issues: string[] = [];
      if (p.deadClickPct > 0) issues.push(`dead ${p.deadClickPct.toFixed(0)}%`);
      if (p.rageClickPct > 0) issues.push(`rage ${p.rageClickPct.toFixed(0)}%`);
      if (p.scriptErrorPct > 0) issues.push(`err ${p.scriptErrorPct.toFixed(0)}%`);
      if (issues.length > 0) {
        // URL 너무 길면 path만
        let label = p.url;
        try { label = new URL(p.url).pathname; } catch {}
        action.push(`Clarity 최악 페이지: ${label} (${issues.join(' / ')}, ${p.baseSessions}세션) — 세션 녹화 직접 확인`);
      }
    }
    if (s.avgEngagementSec >= 60 && rageRate < 1) {
      good.push(`평균 체류 ${s.avgEngagementSec.toFixed(0)}초, rage click 거의 없음 — UX 안정적`);
    }
  } else if (!d.clarity) {
    // silent — Clarity가 빠진 날은 메일 어딘가 별도 표시됨
  }

  // ─── 최대 3개씩 슬라이스, 비면 보완 ────────────────
  if (good.length === 0 && d.supa.revenue > 0) {
    good.push(`매출 ${won(d.supa.revenue)} 발생 (${d.supa.orders}건)`);
  }
  if (risk.length === 0) {
    risk.push('주요 위험 신호 없음 — 모든 지표 임계치 이내');
  }
  if (action.length === 0) {
    action.push('현재 액션 권장 없음 — 운영 유지');
  }

  return {
    good: good.slice(0, 3),
    risk: risk.slice(0, 3),
    action: action.slice(0, 3),
  };
}

/**
 * Gemini로 narrative를 자연어 prose로 polish.
 *
 * 입력 rule 기반 항목들의 **수치는 그대로 유지**하고 표현만 자연스럽게 다듬음.
 * 새로운 수치를 만들거나 사실을 추가하면 안 됨 (system prompt에 강제).
 * 실패 시 원본 narrative 그대로 반환.
 */
export async function polishWithGemini(narrative: Narrative, contextHint: string): Promise<Narrative> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (!key) return narrative;

  const systemPrompt = `당신은 한국어 마케팅 리포트 편집자입니다. 다음 규칙을 절대 어기지 마세요:
1. 입력 항목의 모든 숫자(%, 원, 건수, 배수 등)는 그대로 보존. 새 숫자 생성 금지.
2. 입력에 없는 사실/지표/광고명/페이지명을 만들지 마세요.
3. 각 카테고리(good/risk/action)는 최대 3개. 입력보다 항목을 늘리지 마세요.
4. 문장 길이는 60자 이내로 간결하게. 끝에 "~합니다" 같은 어미 X. 간결한 명사구 또는 짧은 문장.
5. 마케팅 매니저가 30초 만에 의사결정 가능한 톤.
응답은 JSON 객체 한 개만. { "good": [..], "risk": [..], "action": [..] }`;

  const userContent = `컨텍스트: ${contextHint}

원본 항목:
${JSON.stringify(narrative, null, 2)}

위 항목을 같은 의미·같은 숫자로 보존하되 한국어 표현만 자연스럽게 다듬어 같은 JSON 구조로 반환하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) {
      console.warn('[narrative.polishWithGemini] HTTP', res.status, await res.text().catch(() => ''));
      return narrative;
    }
    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return narrative;
    const parsed = JSON.parse(text) as Partial<Narrative>;
    const sanitize = (arr: unknown, original: string[]): string[] => {
      if (!Array.isArray(arr)) return original;
      const cleaned = arr.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 160).slice(0, 3);
      return cleaned.length > 0 ? cleaned : original;
    };
    return {
      good: sanitize(parsed.good, narrative.good),
      risk: sanitize(parsed.risk, narrative.risk),
      action: sanitize(parsed.action, narrative.action),
    };
  } catch (e) {
    console.warn('[narrative.polishWithGemini] failed:', e instanceof Error ? e.message : e);
    return narrative;
  }
}
