/**
 * 네이버 검색광고 성과 API.
 *
 * 핵심: 네이버가 주는 건 **광고비**뿐이다 (`salesAmt`는 매출이 아니라 광고비다).
 * 매출·주문은 우리 DB(`orders.utm_source='naver'`)에서 가져와 결합한다.
 * 판정은 매체 지표가 아니라 이 DB 숫자로 한다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  getBizMoney,
  getCreds,
  getDailyStats,
  getStats,
  listAdGroups,
  listCampaigns,
  listKeywords,
  rangeFromDays,
  type NaverStatRow,
} from '@/lib/naver-ads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** E2E 테스트로 심은 행은 집계에서 뺀다 */
const TEST_CAMPAIGN_PREFIX = 'grp-E2E';

const kstDay = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(180, Number(searchParams.get('days') ?? 14)));
    const { since, until } = rangeFromDays(days);
    const sinceTs = `${since}T00:00:00+09:00`;

    const supabase = createAdminClient();

    // ── 우리 DB: 세션 · 주문 · 매출 (네이버 API가 죽어도 이 부분은 항상 나온다)
    const [eventsRes, ordersRes] = await Promise.all([
      supabase
        .from('analytics_events')
        .select('session_id, occurred_at, meta, utm_campaign')
        .eq('utm_source', 'naver')
        .gte('occurred_at', sinceTs)
        .limit(20000), // 기본 1,000행 제한 방어 — naver 유입이 늘면 조용히 잘린다
      supabase
        .from('orders')
        .select('id, created_at, total_amount, utm_term, utm_campaign')
        .eq('utm_source', 'naver')
        .gte('created_at', sinceTs),
    ]);

    const isTest = (v: unknown) => String(v ?? '').startsWith(TEST_CAMPAIGN_PREFIX);
    const events = (eventsRes.data ?? []).filter((e) => !isTest(e.utm_campaign));
    const orders = (ordersRes.data ?? []).filter((o) => !isTest(o.utm_campaign));

    // 세션은 중복 제거해서 센다 — 이벤트 수가 아니라 방문자 수가 의미 있다.
    const sessionsByDay = new Map<string, Set<string>>();
    const queryStats = new Map<string, { sessions: Set<string>; rank: string | null; lastSeen: string }>();
    for (const e of events) {
      const day = kstDay(e.occurred_at as string);
      if (!sessionsByDay.has(day)) sessionsByDay.set(day, new Set());
      sessionsByDay.get(day)!.add(String(e.session_id ?? ''));

      const meta = (e.meta ?? {}) as Record<string, unknown>;
      const q = meta.naver_query ? String(meta.naver_query) : null;
      if (!q) continue;
      if (!queryStats.has(q)) queryStats.set(q, { sessions: new Set(), rank: null, lastSeen: day });
      const qs = queryStats.get(q)!;
      qs.sessions.add(String(e.session_id ?? ''));
      if (meta.naver_rank && !qs.rank) qs.rank = String(meta.naver_rank);
      if (day > qs.lastSeen) qs.lastSeen = day;
    }

    const revenueByDay = new Map<string, { orders: number; revenue: number }>();
    const revenueByQuery = new Map<string, { orders: number; revenue: number }>();
    let totalRevenue = 0;
    for (const o of orders) {
      const day = kstDay(o.created_at as string);
      const amount = Number(o.total_amount ?? 0);
      totalRevenue += amount;
      const cur = revenueByDay.get(day) ?? { orders: 0, revenue: 0 };
      revenueByDay.set(day, { orders: cur.orders + 1, revenue: cur.revenue + amount });
      const term = o.utm_term ? String(o.utm_term) : '(검색어 없음)';
      const q = revenueByQuery.get(term) ?? { orders: 0, revenue: 0 };
      revenueByQuery.set(term, { orders: q.orders + 1, revenue: q.revenue + amount });
    }

    // ── 네이버 API: 광고비. 자격증명이 없거나 실패해도 위 DB 지표는 그대로 반환한다.
    const creds = getCreds();
    let spendDaily: NaverStatRow[] = [];
    let keywordRows: Array<Record<string, unknown>> = [];
    let bizmoney: number | null = null;
    let adsError: string | null = null;

    if (!creds) {
      adsError = 'NAVER_AD_API_KEY / NAVER_AD_SECRET_KEY / NAVER_AD_CUSTOMER_ID 미설정';
    } else {
      try {
        const campaigns = await listCampaigns(creds);
        const campaign = campaigns[0];
        const [daily, money, groups] = await Promise.all([
          campaign ? getDailyStats(creds, campaign.nccCampaignId, since, until) : Promise.resolve([]),
          getBizMoney(creds).catch(() => null),
          listAdGroups(creds),
        ]);
        spendDaily = daily;
        bizmoney = money?.bizmoney ?? null;

        const kwMeta = new Map<string, { keyword: string; group: string; bid: number; qi: number | null }>();
        for (const g of groups.filter((x) => !x.userLock)) {
          for (const k of await listKeywords(creds, g.nccAdgroupId)) {
            kwMeta.set(k.nccKeywordId, {
              keyword: k.keyword,
              group: g.name.trim(),
              bid: (k.useGroupBidAmt ? g.bidAmt : k.bidAmt) ?? 0,
              qi: k.nccQi?.qiGrade ?? null,
            });
          }
        }
        const kwStats = await getStats(creds, [...kwMeta.keys()], since, until);
        const statById = new Map(kwStats.map((s) => [String(s.id), s]));
        keywordRows = [...kwMeta.entries()]
          .map(([id, m]) => {
            const s = statById.get(id);
            return {
              keyword: m.keyword,
              group: m.group,
              bid: m.bid,
              qiGrade: m.qi,
              impressions: s?.impCnt ?? 0,
              clicks: s?.clkCnt ?? 0,
              ctr: s?.ctr ?? 0,
              cpc: Math.round(s?.cpc ?? 0),
              spend: Math.round(s?.salesAmt ?? 0),
              avgRank: s?.avgRnk ?? 0,
            };
          })
          .sort((a, b) => b.spend - a.spend || b.impressions - a.impressions);
      } catch (e) {
        adsError = e instanceof Error ? e.message : String(e);
      }
    }

    // ── 일별 결합
    const spendByDay = new Map(spendDaily.map((r) => [String(r.dateStart), r]));
    const allDays = new Set<string>([
      ...spendByDay.keys(),
      ...sessionsByDay.keys(),
      ...revenueByDay.keys(),
    ]);
    const daily = [...allDays]
      .filter(Boolean)
      .sort()
      .map((date) => {
        const s = spendByDay.get(date);
        const rev = revenueByDay.get(date);
        return {
          date,
          spend: Math.round(Number(s?.salesAmt ?? 0)),
          impressions: Number(s?.impCnt ?? 0),
          clicks: Number(s?.clkCnt ?? 0),
          ctr: Number(s?.ctr ?? 0),
          cpc: Math.round(Number(s?.cpc ?? 0)),
          sessions: sessionsByDay.get(date)?.size ?? 0,
          orders: rev?.orders ?? 0,
          revenue: rev?.revenue ?? 0,
        };
      });

    const totalSpend = daily.reduce((a, d) => a + d.spend, 0);
    const totalClicks = daily.reduce((a, d) => a + d.clicks, 0);
    const totalImpressions = daily.reduce((a, d) => a + d.impressions, 0);
    const totalSessions = new Set(events.map((e) => String(e.session_id ?? ''))).size;

    const queries = [...queryStats.entries()]
      .map(([query, v]) => {
        const rev = revenueByQuery.get(query);
        return {
          query,
          sessions: v.sessions.size,
          rank: v.rank,
          lastSeen: v.lastSeen,
          orders: rev?.orders ?? 0,
          revenue: rev?.revenue ?? 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);

    return NextResponse.json({
      range: { since, until, days },
      summary: {
        spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr: totalImpressions ? (totalClicks / totalImpressions) * 100 : 0,
        cpc: totalClicks ? totalSpend / totalClicks : 0,
        sessions: totalSessions,
        // 클릭 대비 세션. 크게 벌어지면 랜딩 도달 전 이탈이나 추적 누락을 의심한다.
        sessionRate: totalClicks ? (totalSessions / totalClicks) * 100 : 0,
        orders: orders.length,
        revenue: totalRevenue,
        roas: totalSpend ? totalRevenue / totalSpend : 0,
        cpa: orders.length ? totalSpend / orders.length : 0,
        aov: orders.length ? totalRevenue / orders.length : 0,
        bizmoney,
      },
      daily,
      queries,
      keywords: keywordRows,
      adsError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
