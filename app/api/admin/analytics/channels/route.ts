/**
 * 채널 통합 성과 API — 다채널 운영의 단일 판정 화면용.
 *
 * 시니어 마케터가 묻는 순서대로 답한다:
 *  1) 어느 채널에 돈이 나가고 있나 (광고비: Meta API + 네이버 API)
 *  2) 그 돈이 사람을 데려왔나 (세션: analytics_events)
 *  3) 데려온 사람이 손을 들었나 (문의: 폼 완료 페이지뷰 + 챗봇 상담 세션)
 *  4) 돈이 됐나 (주문·매출: orders — 판정은 항상 자사 DB 기준)
 *
 * ⚠ 문의는 프록시다. inquiries 테이블에 utm 이 없어서
 *    `/inquiries/new/success` 페이지뷰(폼 문의 완료)와 `chatbot_step` 세션(챗봇 상담)을
 *    채널 귀속 문의로 센다. 절대 수치가 아니라 채널 간 비교용.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { createAdminClient } from '@/lib/supabase-admin';
import { fetchAccountSummary } from '@/lib/meta-ads';
import { naverSpend } from '@/lib/analytics/marketing-spend';

import { channelOf, PAID_CHANNELS, isConfirmedMarketingOrder, ratio, reportingRange, reportingDays, cachedMarketingRead } from '@/lib/analytics/marketing-metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

type ChannelAgg = {
  sessions: number;
  formInquiries: number;
  chatbotSessions: number;
  orders: number;
  revenue: number;
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    let range;
    try { range = reportingRange(searchParams); }
    catch (error) { return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 400 }); }
    const { since, until, days, fromIso: sinceTs, toExclusive } = range;
    const supabase = createAdminClient();
    const adsErrors: string[] = [];
    const spendByChannel = new Map<string, number>();
    const adsCollectedAt: Record<string, string> = {};
    type Order = { id: string; created_at: string; total_amount: number | null; payment_status: string | null; order_status: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null };
    const fetchOrders = async () => {
      const rows: Order[] = [];
      for (let offset = 0; offset < 200000; offset += 1000) {
        const { data, error } = await supabase.from('orders')
          .select('id,created_at,total_amount,payment_status,order_status,utm_source,utm_medium,utm_campaign')
          .gte('created_at', sinceTs).lt('created_at', toExclusive)
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 999);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []) as Order[]);
        if (!data || data.length < 1000) return rows;
      }
      throw new Error('주문 조회 상한을 초과했습니다. 기간을 줄여 주세요.');
    };
    const [statsRes, orders] = await Promise.all([
      supabase.rpc('admin_channel_stats_range', { p_since: sinceTs, p_until: toExclusive }),
      fetchOrders(),
      (async () => {
        try {
          const meta = await cachedMarketingRead(`channel:meta:${process.env.META_AD_ACCOUNT_ID}:${since}:${until}`, () => fetchAccountSummary(since, until), searchParams.has('refresh'));
          spendByChannel.set('Meta 광고', Math.round(meta.value.spend));
          adsCollectedAt['Meta 광고'] = meta.collectedAt;
        } catch { adsErrors.push('Meta 광고비 조회 실패'); }
      })(),
      (async () => {
        const naver = await naverSpend(since, until, searchParams.has('refresh'));
        if (naver.error) adsErrors.push(naver.error);
        if (naver.spend !== null) spendByChannel.set('네이버 검색광고', naver.spend);
        if (naver.collectedAt) adsCollectedAt['네이버 검색광고'] = naver.collectedAt;
      })(),
    ]);
    if (statsRes.error) throw new Error(`채널 세션 집계: ${statsRes.error.message}`);

    const agg = new Map<string, ChannelAgg>();
    const get = (ch: string): ChannelAgg => {
      if (!agg.has(ch)) agg.set(ch, { sessions: 0, formInquiries: 0, chatbotSessions: 0, orders: 0, revenue: 0 });
      return agg.get(ch)!;
    };

    // 일별 추이 (유료 채널 판정용): 날짜 × {메타·네이버 매출/주문, 전체}
    const revenueDaily = new Map<string, Record<string, number>>();

    // RPC 는 utm_source×medium 단위로 오므로 채널 그룹으로 재합산한다.
    // 세션 distinct 가 그룹 경계를 넘어 겹칠 수 있으나(같은 세션이 ig→fb 이동),
    // 채널 비교 목적에는 무시 가능한 오차다.
    for (const r of (statsRes.data ?? []) as Array<{ utm_source: string | null; utm_medium: string | null; sessions: number; form_inquiries: number; chatbot_sessions: number }>) {
      const ch = channelOf(r.utm_source, r.utm_medium);
      const a = get(ch);
      a.sessions += Number(r.sessions ?? 0);
      a.formInquiries += Number(r.form_inquiries ?? 0);
      a.chatbotSessions += Number(r.chatbot_sessions ?? 0);
    }

    for (const o of orders) {
      if (!isConfirmedMarketingOrder(o)) continue;
      const ch = channelOf(o.utm_source as string | null, o.utm_medium as string | null);
      const a = get(ch);
      const amount = Number(o.total_amount ?? 0);
      a.orders += 1;
      a.revenue += amount;
      const day = kstDay(o.created_at as string);
      const d = revenueDaily.get(day) ?? {};
      d[ch] = (d[ch] ?? 0) + amount;
      d['전체'] = (d['전체'] ?? 0) + amount;
      revenueDaily.set(day, d);
    }

    // Include channels that spent money but produced no sessions or orders.
    for (const channel of PAID_CHANNELS) get(channel);

    // ── 채널 테이블 (매출 → 세션 순 정렬, 직접·자연은 맨 아래로)
    const channels = [...agg.entries()]
      .map(([channel, a]) => {
        const spend = PAID_CHANNELS.has(channel) ? spendByChannel.get(channel) ?? null : null;
        const inquiries = a.formInquiries + a.chatbotSessions;
        return {
          channel,
          paid: PAID_CHANNELS.has(channel),
          spend,
          sessions: a.sessions,
          formInquiries: a.formInquiries,
          chatbotSessions: a.chatbotSessions,
          inquiries,
          orders: a.orders,
          revenue: a.revenue,
          aov: ratio(a.revenue, a.orders),
          roas: ratio(a.revenue, spend),
          cpa: ratio(spend, a.orders),
          // 세션 → 주문 전환율. 채널 간 트래픽 품질 비교의 핵심 지표.
          cvr: a.sessions ? (a.orders / a.sessions) * 100 : null,
        };
      })
      .sort((a, b) => {
        if (a.channel === '직접·자연') return 1;
        if (b.channel === '직접·자연') return -1;
        return b.revenue - a.revenue || b.sessions - a.sessions;
      });

    const totalSpend = adsErrors.length ? null : [...spendByChannel.values()].reduce((a, b) => a + b, 0);
    const paidRevenue = channels.filter((c) => c.paid).reduce((a, c) => a + c.revenue, 0);
    const totalRevenue = channels.reduce((a, c) => a + c.revenue, 0);
    const totalOrders = channels.reduce((a, c) => a + c.orders, 0);
    const totalInquiries = channels.reduce((a, c) => a + c.inquiries, 0);

    const daily = reportingDays(since, until).map((date) => {
      const v = revenueDaily.get(date) ?? {};
      return ({
        date,
        total: Math.round(v['전체'] ?? 0),
        meta: Math.round(v['Meta 광고'] ?? 0),
        naver: Math.round(v['네이버 검색광고'] ?? 0),
      });
    });

    return NextResponse.json({
      range: { since, until, days, incomplete: range.incomplete },
      generatedAt: new Date().toISOString(),
      adsCollectedAt,
      summary: {
        totalSpend,
        paidRevenue,
        totalRevenue,
        blendedRoas: ratio(paidRevenue, totalSpend),
        mer: ratio(totalRevenue, totalSpend),
        spendShare: totalRevenue > 0 && totalSpend !== null ? totalSpend / totalRevenue * 100 : null,
        paidRevenueShare: totalRevenue ? (paidRevenue / totalRevenue) * 100 : null,
        totalOrders,
        totalInquiries,
      },
      channels,
      daily,
      adsErrors,
      notes: [
        '문의는 프록시 지표입니다 — 폼 문의(/inquiries/new/success 도달) + 챗봇 상담 시작 세션.',
        '확정매출은 주문 생성일 기준 유효 결제 주문금액입니다. 취소·환불·결제대기·테스트 주문은 제외합니다.',
        'MER = 전체 확정매출 ÷ Meta·네이버 총광고비. 광고 귀속 ROAS = 유료 UTM 확정매출 ÷ 같은 채널 광고비.',
        '이 지표는 이익률이 아닙니다. 원가·수수료 및 유입 후 14·28일 전환 지연을 별도로 확인하세요.',
        '세션은 source·medium별 고유 세션을 합산하므로 채널 간 이동은 중복될 수 있습니다.',
        '직접·자연에는 UTM 없는 재방문·북마크·매체 기여창 밖 전환이 섞입니다.',
      ],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
