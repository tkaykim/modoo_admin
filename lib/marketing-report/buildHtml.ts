/** HTML 보고서 빌더 (일일 + 주간 공용) */

import { won, pct } from './time';
import type { InsightSummary, AdLeakDiagnosis } from './fetchMeta';
import type { GA4Overall, GA4ChannelRow, GA4FunnelStep, GA4LandingRow, GA4DeviceRow, GA4NewReturningRow } from './fetchGA4';
import type { OrderSummary, DailyOrderRow, TopProductRow, AdAttributedRow } from './fetchSupabase';
import type { ClarityReport } from './fetchClarity';
import type { Narrative } from './narrative';

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Apple SD Gothic Neo','Malgun Gothic','Pretendard',sans-serif;background:#f7f8fb;color:#1a1a2e;line-height:1.55;font-size:14px}
.wrap{max-width:780px;margin:0 auto;padding:24px}
header{background:linear-gradient(135deg,#0052cc 0%,#003a8c 100%);color:#fff;padding:24px;border-radius:14px;margin-bottom:16px}
header h1{font-size:20px;font-weight:700;margin-bottom:4px}
header .sub{opacity:.9;font-size:12px}
section{background:#fff;border-radius:12px;padding:18px;margin-bottom:14px;box-shadow:0 2px 6px rgba(0,0,0,.04)}
h2{font-size:15px;font-weight:700;margin-bottom:12px;color:#0052cc;border-bottom:2px solid #e6ecf5;padding-bottom:8px}
.kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:8px}
.kpi{background:#f7f8fb;border-left:3px solid #0052cc;padding:10px 12px;border-radius:6px}
.kpi .l{font-size:10px;color:#888;font-weight:500;text-transform:uppercase;letter-spacing:.4px}
.kpi .v{font-size:18px;font-weight:700;color:#1a1a2e}
.kpi .s{font-size:10px;color:#888;margin-top:2px}
.kpi.ok{border-left-color:#27ae60}
.kpi.ok .v{color:#27ae60}
.kpi.warn{border-left-color:#f39c12}
.kpi.warn .v{color:#f39c12}
table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}
thead{background:#f0f4fa}
th{padding:7px 8px;text-align:left;font-weight:600;color:#2a2a4a;font-size:11px;border-bottom:1px solid #d6dfeb}
th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}
td{padding:6px 8px;border-bottom:1px solid #eef1f6}
tbody tr.total{background:#f0f4fa;font-weight:700}
.pos{color:#27ae60;font-weight:600}
.neg{color:#e74c3c;font-weight:600}
.bar-row{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px}
.bar-row .lbl{width:80px;font-weight:500;flex-shrink:0;font-size:10px}
.bar-row .bg{flex:1;background:#e6ecf5;border-radius:3px;height:18px;overflow:hidden}
.bar-row .bar{height:100%;background:linear-gradient(90deg,#27ae60,#52c97f);border-radius:3px;display:flex;align-items:center;padding-left:6px;color:#fff;font-weight:600;font-size:10px;min-width:35px}
.bar-row .v{width:70px;text-align:right;font-weight:600;font-size:11px}
.note{padding:10px 12px;border-radius:8px;font-size:12px;margin:6px 0}
.note.ok{background:#f0fdf4;border-left:3px solid #27ae60}
.note.warn{background:#fffbeb;border-left:3px solid #f39c12}
.note.info{background:#eff6ff;border-left:3px solid #0052cc}
.footer{text-align:center;color:#888;font-size:11px;margin-top:20px;padding:14px}
`;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface DailyData {
  date: string;            // 어제 (YYYY-MM-DD)
  prevDate: string;        // 그저께
  meta: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    atc: number;
    ic: number;
    icValue: number;
    purchase: number;
    purchaseValue: number;
    metaRoas: number;
    ads: InsightSummary[];
    leak: { perAd: AdLeakDiagnosis[]; siteAvg: { ctr: number; atcRate: number; icRate: number; purchaseRate: number } };
  };
  ga4: {
    overall: GA4Overall;
    channels: GA4ChannelRow[];
    funnel: GA4FunnelStep[];
    landing: GA4LandingRow[];
    devices: GA4DeviceRow[];
    cohort: GA4NewReturningRow[];
  };
  supa: { summary: OrderSummary; topProducts: TopProductRow[]; adAttributed: AdAttributedRow[] };
  prevSupa: OrderSummary;  // 그저께 비교용
  clarity: ClarityReport | null;
  narrative: Narrative;
}

export interface WeeklyData {
  from: string;            // 지난 주 월요일
  to: string;              // 지난 주 일요일
  prevFrom: string;        // 직전 주 월요일
  prevTo: string;          // 직전 주 일요일
  meta: {
    spend: number;
    purchase: number;
    purchaseValue: number;
    metaRoas: number;
    ads: InsightSummary[];
    leak: { perAd: AdLeakDiagnosis[]; siteAvg: { ctr: number; atcRate: number; icRate: number; purchaseRate: number } };
  };
  ga4: {
    overall: GA4Overall;
    channels: GA4ChannelRow[];
    funnel: GA4FunnelStep[];
    landing: GA4LandingRow[];
    devices: GA4DeviceRow[];
    cohort: GA4NewReturningRow[];
  };
  supa: { summary: OrderSummary; daily: DailyOrderRow[]; topProducts: TopProductRow[]; adAttributed: AdAttributedRow[] };
  prevSupa: OrderSummary;
  clarity: ClarityReport | null;
  narrative: Narrative;
}

function diffArrow(now: number, prev: number): string {
  if (prev === 0 && now === 0) return '<span class="neut">–</span>';
  if (prev === 0) return '<span class="pos">신규</span>';
  const pctV = ((now - prev) / prev) * 100;
  if (pctV > 0) return `<span class="pos">+${pctV.toFixed(0)}%</span>`;
  if (pctV < 0) return `<span class="neg">${pctV.toFixed(0)}%</span>`;
  return '<span class="neut">0%</span>';
}

export function buildDailyHtml(d: DailyData): string {
  const realRoas = d.meta.spend > 0 ? d.supa.summary.revenue / d.meta.spend : 0;
  const activeAds = d.meta.ads.filter((a) => a.spend > 0).sort((a, b) => b.spend - a.spend);
  const maxAdSpend = Math.max(...activeAds.map((a) => a.spend), 1);
  const maxFunnelUsers = Math.max(...d.ga4.funnel.map((s) => s.users), 1);

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>모두의유니폼 일일 리포트 ${d.date}</title><style>${CSS}</style></head>
<body><div class="wrap">

<header>
  <h1>📊 모두의유니폼 일일 마케팅 리포트</h1>
  <div class="sub">${d.date} (KST) · 데이터 Meta + GA4 + Supabase + Clarity</div>
</header>

<section>
  <h2>🧭 진단 한눈에</h2>
  <div class="note ok"><strong>좋은점</strong><br>• ${d.narrative.good.map(esc).join('<br>• ')}</div>
  <div class="note warn"><strong>위험</strong><br>• ${d.narrative.risk.map(esc).join('<br>• ')}</div>
  <div class="note info"><strong>액션</strong><br>• ${d.narrative.action.map(esc).join('<br>• ')}</div>
</section>

<section>
  <h2>① 어제의 핵심</h2>
  <div class="kpi-grid">
    <div class="kpi ok"><div class="l">실제 매출</div><div class="v">${won(d.supa.summary.revenue)}</div><div class="s">${d.supa.summary.orders}건 · ${diffArrow(d.supa.summary.revenue, d.prevSupa.revenue)} vs ${d.prevDate}</div></div>
    <div class="kpi"><div class="l">광고 지출</div><div class="v">${won(d.meta.spend)}</div><div class="s">CTR ${pct(d.meta.ctr)} · CPC ${won(d.meta.cpc)}</div></div>
    <div class="kpi ${realRoas >= 3 ? 'ok' : realRoas >= 1 ? '' : 'warn'}"><div class="l">실제 ROAS</div><div class="v">${realRoas.toFixed(2)}×</div><div class="s">광고비 1원당 매출 ${realRoas.toFixed(2)}원</div></div>
    <div class="kpi"><div class="l">진짜 마진</div><div class="v">${pct(d.supa.summary.marginPct)}</div><div class="s">${won(d.supa.summary.grossProfit)} (gross)</div></div>
  </div>
</section>

<section>
  <h2>② 광고 활동 요약</h2>
  <table>
    <tr><th>지표</th><th class="num">값</th></tr>
    <tr><td>노출</td><td class="num">${d.meta.impressions.toLocaleString()}</td></tr>
    <tr><td>클릭</td><td class="num">${d.meta.clicks.toLocaleString()}</td></tr>
    <tr><td>장바구니(ATC)</td><td class="num">${d.meta.atc}건</td></tr>
    <tr><td>결제시작(IC) <span style="color:#888;font-size:10px">파이프라인</span></td><td class="num">${d.meta.ic}건 / ${won(d.meta.icValue)}</td></tr>
    <tr><td>Meta 픽셀 구매</td><td class="num">${d.meta.purchase}건 / ${won(d.meta.purchaseValue)}</td></tr>
  </table>
</section>

${activeAds.length > 0 ? `<section>
  <h2>③ 광고 소재별 + leak 진단</h2>
  <table>
    <thead><tr><th>광고</th><th class="num">지출</th><th class="num">CTR</th><th class="num">ATC율</th><th class="num">IC율</th><th class="num">구매율</th><th class="num">ROAS</th><th>진단</th></tr></thead>
    <tbody>
      ${d.meta.leak.perAd.map((a) => `<tr>
        <td>${esc(a.name)}</td>
        <td class="num">${won(a.spend)}</td>
        <td class="num">${pct(a.ctr)}</td>
        <td class="num">${pct(a.atcRate)}</td>
        <td class="num">${pct(a.icRate)}</td>
        <td class="num">${pct(a.purchaseRate)}</td>
        <td class="num ${a.roas >= 2 ? 'pos' : a.roas < 1 ? 'neg' : ''}">${a.roas.toFixed(2)}×</td>
        <td style="font-size:11px">${esc(a.primaryIssue)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="font-size:10px;color:#888;margin-top:6px">계정 평균: CTR ${pct(d.meta.leak.siteAvg.ctr)} / ATC율 ${pct(d.meta.leak.siteAvg.atcRate)} / IC율 ${pct(d.meta.leak.siteAvg.icRate)} / 구매율 ${pct(d.meta.leak.siteAvg.purchaseRate)} — 절반 미만 단계가 leak으로 표시됨</div>
</section>` : ''}

${d.ga4.funnel.length > 0 && d.ga4.funnel[0].users > 0 ? `<section>
  <h2>🔻 GA4 funnel — 어디서 막히나</h2>
  ${d.ga4.funnel.map((s, i) => `<div class="bar-row">
    <span class="lbl">${esc(s.step)}</span>
    <div class="bg"><div class="bar" style="width:${Math.max(3, (s.users / maxFunnelUsers) * 100)}%">${s.users}명</div></div>
    <span class="v">${i === 0 ? 'base' : `${s.conversionFromPrevPct.toFixed(0)}%${s.conversionFromPrevPct < 30 ? ' ⚠' : ''}`}</span>
  </div>`).join('')}
  <div style="font-size:10px;color:#888;margin-top:6px">우측 % = 직전 단계 대비 통과율. 30% 미만 ⚠</div>
</section>` : ''}

${d.ga4.devices.length > 0 ? `<section>
  <h2>📱 디바이스 / 신규 vs 재방문</h2>
  <table>
    <thead><tr><th>디바이스</th><th class="num">세션</th><th class="num">거래</th><th class="num">전환율</th><th class="num">매출</th></tr></thead>
    <tbody>
      ${d.ga4.devices.map((dv) => `<tr><td>${esc(dv.device)}</td><td class="num">${dv.sessions}</td><td class="num">${dv.transactions}</td><td class="num">${pct(dv.conversionRate)}</td><td class="num">${won(dv.purchaseRevenue)}</td></tr>`).join('')}
    </tbody>
  </table>
  ${d.ga4.cohort.length > 0 ? `<table style="margin-top:8px">
    <thead><tr><th>코호트</th><th class="num">세션</th><th class="num">거래</th><th class="num">전환율</th><th class="num">매출</th></tr></thead>
    <tbody>
      ${d.ga4.cohort.map((c) => `<tr><td>${esc(c.cohort)}</td><td class="num">${c.sessions}</td><td class="num">${c.transactions}</td><td class="num">${pct(c.conversionRate)}</td><td class="num">${won(c.purchaseRevenue)}</td></tr>`).join('')}
    </tbody>
  </table>` : ''}
</section>` : ''}

${d.ga4.landing.length > 0 ? `<section>
  <h2>🛬 랜딩 페이지 TOP</h2>
  <table>
    <thead><tr><th>페이지</th><th class="num">세션</th><th class="num">참여율</th><th class="num">전환</th></tr></thead>
    <tbody>
      ${d.ga4.landing.slice(0, 8).map((l) => `<tr><td style="font-family:monospace;font-size:11px">${esc(l.pagePath.slice(0, 60))}</td><td class="num">${l.sessions}</td><td class="num ${l.engagementRate < 0.4 ? 'neg' : ''}">${pct(l.engagementRate * 100)}</td><td class="num">${l.conversions}</td></tr>`).join('')}
    </tbody>
  </table>
</section>` : ''}

${d.clarity && d.clarity.summary.totalSessions > 0 ? `<section>
  <h2>🎬 Clarity UX 신호</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="l">세션</div><div class="v">${d.clarity.summary.totalSessions}</div><div class="s">봇 ${d.clarity.summary.totalBotSessions}</div></div>
    <div class="kpi"><div class="l">평균 체류</div><div class="v">${d.clarity.summary.avgEngagementSec.toFixed(0)}s</div><div class="s">스크롤 ${(d.clarity.summary.avgScrollDepth * 100).toFixed(0)}%</div></div>
    <div class="kpi ${d.clarity.summary.rageClickSessions > d.clarity.summary.totalSessions * 0.03 ? 'warn' : ''}"><div class="l">rage click</div><div class="v">${d.clarity.summary.rageClickSessions}</div><div class="s">dead ${d.clarity.summary.deadClickSessions} · err ${d.clarity.summary.errorClickSessions}</div></div>
    <div class="kpi ${d.clarity.summary.scriptErrorSessions > d.clarity.summary.totalSessions * 0.02 ? 'warn' : ''}"><div class="l">JS 에러 세션</div><div class="v">${d.clarity.summary.scriptErrorSessions}</div><div class="s">quickback ${d.clarity.summary.quickbackSessions}</div></div>
  </div>
  ${d.clarity.topProblemPages.length > 0 ? `<table style="margin-top:10px">
    <thead><tr><th>문제 페이지</th><th class="num">세션</th><th class="num">dead%</th><th class="num">rage%</th><th class="num">err%</th></tr></thead>
    <tbody>
      ${d.clarity.topProblemPages.map((p) => { let label = p.url; try { label = new URL(p.url).pathname; } catch {} return `<tr><td style="font-family:monospace;font-size:11px">${esc(label.slice(0, 60))}</td><td class="num">${p.baseSessions}</td><td class="num ${p.deadClickPct > 10 ? 'neg' : ''}">${p.deadClickPct.toFixed(1)}</td><td class="num ${p.rageClickPct > 5 ? 'neg' : ''}">${p.rageClickPct.toFixed(1)}</td><td class="num ${p.scriptErrorPct > 0 ? 'neg' : ''}">${p.scriptErrorPct.toFixed(1)}</td></tr>`; }).join('')}
    </tbody>
  </table>` : ''}
</section>` : d.clarity === null ? `<section>
  <h2>🎬 Clarity</h2>
  <div class="note warn">Clarity API 호출 실패 — 토큰 또는 API 응답 점검 필요</div>
</section>` : ''}

${d.supa.adAttributed.length > 0 ? `<section>
  <h2>④ UTM 기반 광고 매출 (source/medium/campaign/content/term)</h2>
  <table>
    <thead><tr><th>source</th><th>medium</th><th>campaign</th><th>content</th><th>term</th><th class="num">건</th><th class="num">매출</th></tr></thead>
    <tbody>${d.supa.adAttributed.slice(0, 10).map((r) => `<tr><td>${esc(r.utm_source)}</td><td>${esc(r.utm_medium ?? '-')}</td><td>${esc(r.utm_campaign ?? '-')}</td><td style="font-family:monospace;font-size:10px">${esc(r.utm_content ?? '-')}</td><td style="font-family:monospace;font-size:10px">${esc(r.utm_term ?? '-')}</td><td class="num">${r.orders}</td><td class="num">${won(r.revenue)}</td></tr>`).join('')}</tbody>
  </table>
</section>` : ''}

<section>
  <h2>⑤ GA4 채널 (어제)</h2>
  <table>
    <thead><tr><th>채널</th><th class="num">세션</th><th class="num">거래</th><th class="num">매출</th></tr></thead>
    <tbody>
      ${d.ga4.channels.slice(0, 6).map((c) => `<tr><td>${esc(c.channel)}</td><td class="num">${c.sessions}</td><td class="num">${c.transactions}</td><td class="num">${won(c.purchaseRevenue)}</td></tr>`).join('')}
    </tbody>
  </table>
</section>

${d.supa.topProducts.length > 0 ? `<section>
  <h2>⑥ 매출 상위 상품</h2>
  <table>
    <thead><tr><th>브랜드</th><th>상품</th><th class="num">수량</th><th class="num">매출</th></tr></thead>
    <tbody>${d.supa.topProducts.slice(0, 5).map((p) => `<tr><td>${esc(p.brand ?? '-')}</td><td>${esc(p.product_title)}</td><td class="num">${p.quantity}</td><td class="num">${won(p.revenue)}</td></tr>`).join('')}</tbody>
  </table>
</section>` : ''}

<div class="footer">자동 생성 · ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST<br>"마케팅 성과 어때?" 라고 말씀하시면 더 깊은 분석 가능합니다.</div>

</div></body></html>`;
}

export function buildWeeklyHtml(d: WeeklyData): string {
  const realRoas = d.meta.spend > 0 ? d.supa.summary.revenue / d.meta.spend : 0;
  const prevRealRoas = 1; // baseline 알 수 없을 때 단순화
  const profit50 = d.supa.summary.revenue * 0.5 - d.meta.spend;
  const profit35 = d.supa.summary.revenue * 0.35 - d.meta.spend;
  const activeAds = d.meta.ads.filter((a) => a.spend > 0).sort((a, b) => b.spend - a.spend);
  const maxRev = Math.max(...d.supa.daily.map((x) => x.revenue), 1);

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>모두의유니폼 주간 리포트 ${d.from}~${d.to}</title><style>${CSS}</style></head>
<body><div class="wrap">

<header>
  <h1>📊 모두의유니폼 주간 마케팅 리포트</h1>
  <div class="sub">${d.from} ~ ${d.to} (지난 주, KST) · 데이터 Meta + GA4 + Supabase + Clarity</div>
</header>

<section>
  <h2>🧭 진단 한눈에</h2>
  <div class="note ok"><strong>좋은점</strong><br>• ${d.narrative.good.map(esc).join('<br>• ')}</div>
  <div class="note warn"><strong>위험</strong><br>• ${d.narrative.risk.map(esc).join('<br>• ')}</div>
  <div class="note info"><strong>액션</strong><br>• ${d.narrative.action.map(esc).join('<br>• ')}</div>
</section>

<section>
  <h2>① 지난 주 핵심</h2>
  <div class="kpi-grid">
    <div class="kpi ok"><div class="l">7일 매출</div><div class="v">${won(d.supa.summary.revenue)}</div><div class="s">${d.supa.summary.orders}건 · ${diffArrow(d.supa.summary.revenue, d.prevSupa.revenue)} vs 직전 주</div></div>
    <div class="kpi"><div class="l">광고 지출</div><div class="v">${won(d.meta.spend)}</div></div>
    <div class="kpi ${realRoas >= 3 ? 'ok' : realRoas >= 1 ? '' : 'warn'}"><div class="l">실제 ROAS</div><div class="v">${realRoas.toFixed(2)}×</div></div>
    <div class="kpi"><div class="l">진짜 마진</div><div class="v">${pct(d.supa.summary.marginPct)}</div><div class="s">${won(d.supa.summary.grossProfit)}</div></div>
  </div>
</section>

<section>
  <h2>② 일별 매출 추세</h2>
  ${d.supa.daily.map((row) => {
    const dt = new Date(row.day);
    const dow = ['일', '월', '화', '수', '목', '금', '토'][dt.getUTCDay()];
    return `<div class="bar-row"><span class="lbl">${row.day.slice(5)} ${dow}</span><div class="bg"><div class="bar" style="width:${Math.max(3, (row.revenue / maxRev) * 100)}%">${row.orders}건</div></div><span class="v">${won(row.revenue)}</span></div>`;
  }).join('')}
</section>

<section>
  <h2>③ 영업이익 시나리오</h2>
  <table>
    <thead><tr><th>마진 가정</th><th class="num">gross profit</th><th class="num">광고비 차감 후</th><th class="num">ROI</th></tr></thead>
    <tbody>
      <tr><td>50% (단체복 평균)</td><td class="num">${won(d.supa.summary.revenue * 0.5)}</td><td class="num ${profit50 > 0 ? 'pos' : 'neg'}">${won(profit50)}</td><td class="num">${d.meta.spend > 0 ? ((profit50 / d.meta.spend) * 100).toFixed(0) : '–'}%</td></tr>
      <tr><td>35% (보수)</td><td class="num">${won(d.supa.summary.revenue * 0.35)}</td><td class="num ${profit35 > 0 ? 'pos' : 'neg'}">${won(profit35)}</td><td class="num">${d.meta.spend > 0 ? ((profit35 / d.meta.spend) * 100).toFixed(0) : '–'}%</td></tr>
      <tr><td>DB 보고 마진 ${pct(d.supa.summary.marginPct)}</td><td class="num">${won(d.supa.summary.grossProfit)}</td><td class="num ${(d.supa.summary.grossProfit - d.meta.spend) > 0 ? 'pos' : 'neg'}">${won(d.supa.summary.grossProfit - d.meta.spend)}</td><td class="num">${d.meta.spend > 0 ? (((d.supa.summary.grossProfit - d.meta.spend) / d.meta.spend) * 100).toFixed(0) : '–'}%</td></tr>
    </tbody>
  </table>
</section>

${activeAds.length > 0 ? `<section>
  <h2>④ 광고 소재별 + leak 진단</h2>
  <table>
    <thead><tr><th>광고</th><th class="num">지출</th><th class="num">CTR</th><th class="num">ATC율</th><th class="num">IC율</th><th class="num">구매율</th><th class="num">ROAS</th><th>진단</th></tr></thead>
    <tbody>
      ${d.meta.leak.perAd.slice(0, 10).map((a) => `<tr>
        <td>${esc(a.name)}</td>
        <td class="num">${won(a.spend)}</td>
        <td class="num">${pct(a.ctr)}</td>
        <td class="num">${pct(a.atcRate)}</td>
        <td class="num">${pct(a.icRate)}</td>
        <td class="num">${pct(a.purchaseRate)}</td>
        <td class="num ${a.roas >= 2 ? 'pos' : a.roas < 1 ? 'neg' : ''}">${a.roas.toFixed(2)}×</td>
        <td style="font-size:11px">${esc(a.primaryIssue)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="font-size:10px;color:#888;margin-top:6px">계정 평균: CTR ${pct(d.meta.leak.siteAvg.ctr)} / ATC율 ${pct(d.meta.leak.siteAvg.atcRate)} / IC율 ${pct(d.meta.leak.siteAvg.icRate)} / 구매율 ${pct(d.meta.leak.siteAvg.purchaseRate)}</div>
</section>` : ''}

${d.supa.adAttributed.length > 0 ? `<section>
  <h2>⑤ UTM 기반 광고 매출 (source/medium/campaign/content/term)</h2>
  <table>
    <thead><tr><th>source</th><th>medium</th><th>campaign</th><th>content</th><th>term</th><th class="num">건</th><th class="num">매출</th></tr></thead>
    <tbody>${d.supa.adAttributed.slice(0, 12).map((r) => `<tr><td>${esc(r.utm_source)}</td><td>${esc(r.utm_medium ?? '-')}</td><td>${esc(r.utm_campaign ?? '-')}</td><td style="font-family:monospace;font-size:10px">${esc(r.utm_content ?? '-')}</td><td style="font-family:monospace;font-size:10px">${esc(r.utm_term ?? '-')}</td><td class="num">${r.orders}</td><td class="num">${won(r.revenue)}</td></tr>`).join('')}</tbody>
  </table>
</section>` : ''}

<section>
  <h2>⑥ GA4 채널</h2>
  <table>
    <thead><tr><th>채널</th><th class="num">세션</th><th class="num">거래</th><th class="num">매출</th></tr></thead>
    <tbody>${d.ga4.channels.slice(0, 8).map((c) => `<tr><td>${esc(c.channel)}</td><td class="num">${c.sessions}</td><td class="num">${c.transactions}</td><td class="num">${won(c.purchaseRevenue)}</td></tr>`).join('')}</tbody>
  </table>
</section>

${d.supa.topProducts.length > 0 ? `<section>
  <h2>⑦ 매출 상위 상품</h2>
  <table>
    <thead><tr><th>브랜드</th><th>상품</th><th class="num">건</th><th class="num">수량</th><th class="num">매출</th></tr></thead>
    <tbody>${d.supa.topProducts.slice(0, 8).map((p) => `<tr><td>${esc(p.brand ?? '-')}</td><td>${esc(p.product_title)}</td><td class="num">${p.orders}</td><td class="num">${p.quantity}</td><td class="num">${won(p.revenue)}</td></tr>`).join('')}</tbody>
  </table>
</section>` : ''}

${d.ga4.funnel.length > 0 && d.ga4.funnel[0].users > 0 ? (() => {
  const maxU = Math.max(...d.ga4.funnel.map((s) => s.users), 1);
  return `<section>
  <h2>🔻 GA4 funnel — 어디서 막히나</h2>
  ${d.ga4.funnel.map((s, i) => `<div class="bar-row">
    <span class="lbl">${esc(s.step)}</span>
    <div class="bg"><div class="bar" style="width:${Math.max(3, (s.users / maxU) * 100)}%">${s.users}명</div></div>
    <span class="v">${i === 0 ? 'base' : `${s.conversionFromPrevPct.toFixed(0)}%${s.conversionFromPrevPct < 30 ? ' ⚠' : ''}`}</span>
  </div>`).join('')}
  <div style="font-size:10px;color:#888;margin-top:6px">우측 % = 직전 단계 대비 통과율. 30% 미만 ⚠</div>
</section>`;
})() : ''}

${d.ga4.devices.length > 0 ? `<section>
  <h2>📱 디바이스 / 신규 vs 재방문</h2>
  <table>
    <thead><tr><th>디바이스</th><th class="num">세션</th><th class="num">거래</th><th class="num">전환율</th><th class="num">매출</th></tr></thead>
    <tbody>${d.ga4.devices.map((dv) => `<tr><td>${esc(dv.device)}</td><td class="num">${dv.sessions}</td><td class="num">${dv.transactions}</td><td class="num">${pct(dv.conversionRate)}</td><td class="num">${won(dv.purchaseRevenue)}</td></tr>`).join('')}</tbody>
  </table>
  ${d.ga4.cohort.length > 0 ? `<table style="margin-top:8px">
    <thead><tr><th>코호트</th><th class="num">세션</th><th class="num">거래</th><th class="num">전환율</th><th class="num">매출</th></tr></thead>
    <tbody>${d.ga4.cohort.map((c) => `<tr><td>${esc(c.cohort)}</td><td class="num">${c.sessions}</td><td class="num">${c.transactions}</td><td class="num">${pct(c.conversionRate)}</td><td class="num">${won(c.purchaseRevenue)}</td></tr>`).join('')}</tbody>
  </table>` : ''}
</section>` : ''}

${d.ga4.landing.length > 0 ? `<section>
  <h2>🛬 랜딩 페이지 TOP</h2>
  <table>
    <thead><tr><th>페이지</th><th class="num">세션</th><th class="num">참여율</th><th class="num">전환</th></tr></thead>
    <tbody>${d.ga4.landing.slice(0, 10).map((l) => `<tr><td style="font-family:monospace;font-size:11px">${esc(l.pagePath.slice(0, 60))}</td><td class="num">${l.sessions}</td><td class="num ${l.engagementRate < 0.4 ? 'neg' : ''}">${pct(l.engagementRate * 100)}</td><td class="num">${l.conversions}</td></tr>`).join('')}</tbody>
  </table>
</section>` : ''}

${d.clarity && d.clarity.summary.totalSessions > 0 ? `<section>
  <h2>🎬 Clarity UX 신호 (최근 3일)</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="l">세션</div><div class="v">${d.clarity.summary.totalSessions}</div><div class="s">봇 ${d.clarity.summary.totalBotSessions}</div></div>
    <div class="kpi"><div class="l">평균 체류</div><div class="v">${d.clarity.summary.avgEngagementSec.toFixed(0)}s</div><div class="s">스크롤 ${(d.clarity.summary.avgScrollDepth * 100).toFixed(0)}%</div></div>
    <div class="kpi ${d.clarity.summary.rageClickSessions > d.clarity.summary.totalSessions * 0.03 ? 'warn' : ''}"><div class="l">rage click</div><div class="v">${d.clarity.summary.rageClickSessions}</div><div class="s">dead ${d.clarity.summary.deadClickSessions}</div></div>
    <div class="kpi ${d.clarity.summary.scriptErrorSessions > d.clarity.summary.totalSessions * 0.02 ? 'warn' : ''}"><div class="l">JS 에러 세션</div><div class="v">${d.clarity.summary.scriptErrorSessions}</div><div class="s">quickback ${d.clarity.summary.quickbackSessions}</div></div>
  </div>
  ${d.clarity.topProblemPages.length > 0 ? `<table style="margin-top:10px">
    <thead><tr><th>문제 페이지</th><th class="num">세션</th><th class="num">dead%</th><th class="num">rage%</th><th class="num">err%</th></tr></thead>
    <tbody>${d.clarity.topProblemPages.map((p) => { let label = p.url; try { label = new URL(p.url).pathname; } catch {} return `<tr><td style="font-family:monospace;font-size:11px">${esc(label.slice(0, 60))}</td><td class="num">${p.baseSessions}</td><td class="num ${p.deadClickPct > 10 ? 'neg' : ''}">${p.deadClickPct.toFixed(1)}</td><td class="num ${p.rageClickPct > 5 ? 'neg' : ''}">${p.rageClickPct.toFixed(1)}</td><td class="num ${p.scriptErrorPct > 0 ? 'neg' : ''}">${p.scriptErrorPct.toFixed(1)}</td></tr>`; }).join('')}</tbody>
  </table>` : ''}
</section>` : ''}

<div class="footer">자동 생성 · ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST<br>다음 주 월요일에 또 만나요 📊</div>

</div></body></html>`;
}
