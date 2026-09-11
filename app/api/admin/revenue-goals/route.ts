import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess, requireMarketingWriteAccess } from '@/lib/admin/require-marketing-access';
import { createAdminClient } from '@/lib/supabase-admin';
import { fetchAccountSummary } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// 주간 매출 목표 (대표 지시 2026-09-10)
//   · 목표는 우상향(전주 ×1.05 복리), 매주 달성 여부를 이 화면에서 확인
//   · 적정 광고비 = 목표 × 최근 4주 광고비율 / 허용 상한 = 적정 × 1.15
//   · 페이스가 뒤처지면 상한까지 증액을 권고한다 (매출 상향 우선)
//
// 매출 정의 = orders.total_amount(gross), 취소·환불 제외 — reference_modoo_analytics_revenue 와 동일.
// 광고비 = Meta 계정 insights(KRW, 소수단위 없음).
// ─────────────────────────────────────────────────────────────────────────────

const KST_OFFSET_MS = 9 * 3600_000;
// 요일별 주문 비중 (DB 실측 2026-06~08: 월4.92 화5.00 수5.18 목3.55 금4.30 토2.20 일2.13)
const DOW_SHARE = [0.18, 0.18, 0.19, 0.13, 0.16, 0.08, 0.08]; // 월~일
const GROWTH = 1.10; // 공격 트랙 (대표 승인 2026-09-10) — 이전 1.05
const MAX_RATIO = 1.15;

function kstNow() { return new Date(Date.now() + KST_OFFSET_MS); }
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function mondayOf(d: Date) {
  const x = new Date(d); const dow = (x.getUTCDay() + 6) % 7; // 월=0
  x.setUTCDate(x.getUTCDate() - dow); x.setUTCHours(0, 0, 0, 0); return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
const won = (n: number) => Math.round(n);

type Goal = { week_start: string; target_gross: number; target_orders: number | null; planned_ad_spend: number | null; max_ad_spend: number | null; rule: string | null; set_by: string | null };

export async function GET() {
  const auth = await requireMarketingAccess();
  if ('error' in auth) return auth.error;
  const sb = createAdminClient();

  const now = kstNow();
  const thisMon = mondayOf(now);
  const firstMon = addDays(thisMon, -7 * 11);            // 12주 창
  const lastMon = addDays(thisMon, 7 * 7);                // 향후 8주 목표까지

  // 주문 (KST 주 단위 집계는 서버에서)
  const { data: orders, error } = await sb
    .from('orders')
    .select('created_at,total_amount,order_status')
    .gte('created_at', addDays(firstMon, -1).toISOString())
    .not('order_status', 'in', '("cancelled","canceled","refunded")');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const weeks = new Map<string, { orders: number; gross: number }>();
  for (let i = 0; i < 12; i++) weeks.set(ymd(addDays(firstMon, 7 * i)), { orders: 0, gross: 0 });
  for (const o of orders ?? []) {
    const k = ymd(mondayOf(new Date(new Date(o.created_at).getTime() + KST_OFFSET_MS)));
    const w = weeks.get(k); if (!w) continue;
    w.orders += 1; w.gross += Number(o.total_amount ?? 0);
  }

  // 광고비 (주별 1회 호출 — 12주)
  const spendByWeek = new Map<string, number>();
  await Promise.all([...weeks.keys()].map(async (k) => {
    const s = new Date(k); const e = addDays(s, 6);
    const until = e > now ? now : e;
    try { const sum = await fetchAccountSummary(k, ymd(until)); spendByWeek.set(k, won(sum.spend)); }
    catch { spendByWeek.set(k, 0); }
  }));

  const { data: goalRows } = await sb.from('revenue_weekly_goals').select('*')
    .gte('week_start', ymd(firstMon)).lte('week_start', ymd(lastMon)).order('week_start');
  const goals = new Map<string, Goal>((goalRows ?? []).map((g: Goal) => [g.week_start, g]));

  // 최근 4개 완전주 광고비율 (목표 광고비 산출 근거)
  const complete = [...weeks.entries()].filter(([k]) => k < ymd(thisMon)).slice(-4);
  const base = complete.reduce((a, [k, w]) => ({ gross: a.gross + w.gross, spend: a.spend + (spendByWeek.get(k) ?? 0), orders: a.orders + w.orders }), { gross: 0, spend: 0, orders: 0 });
  const adRatio = base.gross ? base.spend / base.gross : 0.23;
  const aov = base.orders ? base.gross / base.orders : 125_000;

  // 이번 주 페이스
  const dowIdx = (now.getUTCDay() + 6) % 7;                 // 월=0
  const elapsedShare = DOW_SHARE.slice(0, dowIdx + 1).reduce((a, b) => a + b, 0);
  const thisKey = ymd(thisMon);
  const thisGoal = goals.get(thisKey);
  const thisWeek = weeks.get(thisKey) ?? { orders: 0, gross: 0 };
  const thisSpend = spendByWeek.get(thisKey) ?? 0;
  const target = thisGoal?.target_gross ?? won(base.gross / Math.max(1, complete.length));
  const expectedToDate = won(target * elapsedShare);
  const remainDays = 6 - dowIdx;
  const remainGross = Math.max(0, target - thisWeek.gross);
  const needPerDay = remainDays > 0 ? won(remainGross / remainDays) : remainGross;
  const paceRatio = expectedToDate ? thisWeek.gross / expectedToDate : 0;
  const planned = thisGoal?.planned_ad_spend ?? won(target * adRatio);
  const maxSpend = thisGoal?.max_ad_spend ?? won(planned * MAX_RATIO);
  const spendExpected = won(planned * ((dowIdx + 1) / 7));
  let recommendation: string;
  if (paceRatio >= 1) recommendation = '목표 페이스 이상입니다. 예산 유지.';
  else if (paceRatio >= 0.9) recommendation = '페이스 근접(90%+). 예산 유지하되 내일 재확인.';
  else if (thisSpend < maxSpend) recommendation = `페이스 미달(${Math.round(paceRatio * 100)}%). 허용 상한(${maxSpend.toLocaleString()}원)까지 증액 권고 — 남은 ${remainDays}일 일 ${won((maxSpend - thisSpend) / Math.max(1, remainDays)).toLocaleString()}원.`;
  else recommendation = '페이스 미달인데 광고비는 이미 상한. 예산이 아니라 소재·랜딩 문제 — 증액 금지.';

  const rows = [...weeks.entries()].map(([k, w]) => {
    const g = goals.get(k); const spend = spendByWeek.get(k) ?? 0;
    const isCurrent = k === thisKey; const isPast = k < thisKey;
    const achieved = g ? w.gross / g.target_gross : null;
    return {
      week_start: k, orders: w.orders, gross: w.gross, spend,
      ad_ratio: w.gross ? spend / w.gross : null,
      target_gross: g?.target_gross ?? null, target_orders: g?.target_orders ?? null,
      planned_ad_spend: g?.planned_ad_spend ?? null, max_ad_spend: g?.max_ad_spend ?? null,
      achieved,
      status: isCurrent ? 'current' : isPast ? (achieved === null ? 'no_goal' : achieved >= 1 ? 'hit' : achieved >= 0.9 ? 'near' : 'miss') : 'future',
    };
  });
  const future = (goalRows ?? []).filter((g: Goal) => g.week_start > thisKey).map((g: Goal) => ({
    week_start: g.week_start, target_gross: g.target_gross, target_orders: g.target_orders,
    planned_ad_spend: g.planned_ad_spend, max_ad_spend: g.max_ad_spend, rule: g.rule,
  }));

  const lastKey = ymd(addDays(thisMon, -7));
  const lastRow = rows.find((r) => r.week_start === lastKey) ?? null;
  const thisFreeze = (thisGoal as any)?.budget_frozen ? { frozen: true, reason: (thisGoal as any)?.freeze_reason ?? null } : { frozen: false, reason: (thisGoal as any)?.freeze_reason ?? null };

  return NextResponse.json({ data: {
    asOf: now.toISOString(),
    last_week: lastRow ? { week_start: lastRow.week_start, target: lastRow.target_gross, gross: lastRow.gross, orders: lastRow.orders, achieved: lastRow.achieved, spend: lastRow.spend, status: lastRow.status } : null,
    freeze: thisFreeze,
    baseline: { weeks: complete.length, gross: base.gross, spend: base.spend, orders: base.orders, ad_ratio: adRatio, aov: won(aov) },
    current: {
      week_start: thisKey, target, target_orders: thisGoal?.target_orders ?? null,
      gross: thisWeek.gross, orders: thisWeek.orders, achieved: target ? thisWeek.gross / target : 0,
      expected_to_date: expectedToDate, pace_ratio: paceRatio, remain_days: remainDays, need_per_day: needPerDay,
      spend: thisSpend, planned_ad_spend: planned, max_ad_spend: maxSpend, spend_expected_to_date: spendExpected,
      recommendation, rule: thisGoal?.rule ?? null,
    },
    weeks: rows, future,
    rules: { growth: GROWTH, max_ratio: MAX_RATIO, dow_share: DOW_SHARE },
  } });
}

export async function POST(req: NextRequest) {
  const auth = await requireMarketingWriteAccess();
  if ('error' in auth) return auth.error;
  const body = await req.json().catch(() => null) as { week_start?: string; target_gross?: number; target_orders?: number | null; planned_ad_spend?: number | null; max_ad_spend?: number | null; rule?: string } | null;
  if (!body?.week_start || !/^\d{4}-\d{2}-\d{2}$/.test(body.week_start)) return NextResponse.json({ error: 'week_start(YYYY-MM-DD, 월요일) 필요' }, { status: 400 });
  const target = Number(body.target_gross);
  if (!Number.isFinite(target) || target < 500_000 || target > 100_000_000) return NextResponse.json({ error: '목표 매출은 50만~1억 사이' }, { status: 400 });
  const planned = body.planned_ad_spend != null ? Number(body.planned_ad_spend) : null;
  const max = body.max_ad_spend != null ? Number(body.max_ad_spend) : planned != null ? won(planned * MAX_RATIO) : null;
  const sb = createAdminClient();
  const { error } = await sb.from('revenue_weekly_goals').upsert({
    week_start: body.week_start, target_gross: won(target),
    target_orders: body.target_orders ?? null, planned_ad_spend: planned, max_ad_spend: max,
    rule: body.rule ?? '수동 조정', set_by: auth.user.email ?? 'manual', updated_at: new Date().toISOString(),
  }, { onConflict: 'week_start' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
