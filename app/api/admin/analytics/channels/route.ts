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
import { fetchAccountSummary, rangeFromDays as metaRange } from '@/lib/meta-ads';
import { getCreds as getNaverCreds, getDailyStats, listCampaigns, rangeFromDays } from '@/lib/naver-ads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TEST_CAMPAIGN_PREFIX = 'grp-E2E';

/**
 * utm_source(+medium) → 채널 그룹.
 * ig/fb/an/msg 는 Meta 광고 시스템의 지면들이라 "Meta 광고" 하나로 묶는다 —
 * 지면별 분해는 Meta 상세 탭의 몫이고, 이 화면은 채널 간 비교가 목적이다.
 */
function channelOf(source: string | null, medium: string | null): string {
  const s = (source ?? '').toLowerCase();
  const m = (medium ?? '').toLowerCase();
  if (!s) return '직접·자연';
  if (['ig', 'fb', 'an', 'msg', 'th'].includes(s)) return m === 'paid' ? 'Meta 광고' : 'SNS 자연';
  if (s === 'naver') return '네이버 검색광고';
  if (s === 'kakao') return '카카오 채널';
  if (s === 'threads' || s === 'instagram' || s === 'facebook') return 'SNS 자연';
  if (s === 'print' || s === 'kprint') return '오프라인·박람회';
  return '기타';
}

/** 광고비가 실리는 채널 — 혼합 ROAS 분모·광고 귀속 매출 분자의 기준 */
const PAID_CHANNELS = new Set(['Meta 광고', '네이버 검색광고']);

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
    const days = Math.max(1, Math.min(180, Number(searchParams.get('days') ?? 14)));
    const { since, until } = rangeFromDays(days);
    const sinceTs = `${since}T00:00:00+09:00`;

    const supabase = createAdminClient();

    // ── DB: 세션·문의·주문 (광고 API가 죽어도 여기는 항상 나온다)
    // ⚠ analytics_events 는 행이 많아(14일 1.7만+) 앱에서 읽으면 기본 1,000행에 잘린다.
    //   세션·문의 집계는 반드시 RPC(admin_channel_stats)로 DB 에서 한다.
    const [statsRes, ordersRes] = await Promise.all([
      supabase.rpc('admin_channel_stats', { p_since: sinceTs }),
      supabase
        .from('orders')
        .select('created_at, total_amount, utm_source, utm_medium, utm_campaign')
        .gte('created_at', sinceTs)
        .limit(20000),
    ]);
    if (statsRes.error) throw new Error(`admin_channel_stats: ${statsRes.error.message}`);
    if (ordersRes.error) throw new Error(`orders: ${ordersRes.error.message}`);

    const isTest = (v: unknown) => String(v ?? '').startsWith(TEST_CAMPAIGN_PREFIX);

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

    for (const o of ordersRes.data ?? []) {
      if (isTest(o.utm_campaign)) continue;
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

    // ── 광고비: 채널별로 독립 수집. 한쪽이 실패해도 다른 쪽은 산다.
    const spendByChannel = new Map<string, number>();
    const adsErrors: string[] = [];

    // Meta — until 이 미래면 API 가 거부할 수 있어 meta 쪽 range 헬퍼로 맞춘다
    try {
      const mr = metaRange(days);
      const meta = await fetchAccountSummary(mr.since, mr.until);
      spendByChannel.set('Meta 광고', Math.round(Number(meta.spend ?? 0)));
    } catch (e) {
      adsErrors.push(`Meta 광고비: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 네이버
    const naverCreds = getNaverCreds();
    if (!naverCreds) {
      adsErrors.push('네이버 광고비: NAVER_AD_* 미설정');
    } else {
      try {
        const camps = await listCampaigns(naverCreds);
        let spend = 0;
        for (const c of camps) {
          const daily = await getDailyStats(naverCreds, c.nccCampaignId, since, until);
          spend += daily.reduce((s, r) => s + Number(r.salesAmt ?? 0), 0);
        }
        spendByChannel.set('네이버 검색광고', Math.round(spend));
      } catch (e) {
        adsErrors.push(`네이버 광고비: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ── 채널 테이블 (매출 → 세션 순 정렬, 직접·자연은 맨 아래로)
    const channels = [...agg.entries()]
      .map(([channel, a]) => {
        const spend = spendByChannel.get(channel) ?? 0;
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
          aov: a.orders ? a.revenue / a.orders : 0,
          roas: spend ? a.revenue / spend : null,
          cpa: spend && a.orders ? spend / a.orders : null,
          // 세션 → 주문 전환율. 채널 간 트래픽 품질 비교의 핵심 지표.
          cvr: a.sessions ? (a.orders / a.sessions) * 100 : 0,
        };
      })
      .sort((a, b) => {
        if (a.channel === '직접·자연') return 1;
        if (b.channel === '직접·자연') return -1;
        return b.revenue - a.revenue || b.sessions - a.sessions;
      });

    const totalSpend = [...spendByChannel.values()].reduce((a, b) => a + b, 0);
    const paidRevenue = channels.filter((c) => c.paid).reduce((a, c) => a + c.revenue, 0);
    const totalRevenue = channels.reduce((a, c) => a + c.revenue, 0);
    const totalOrders = channels.reduce((a, c) => a + c.orders, 0);
    const totalInquiries = channels.reduce((a, c) => a + c.inquiries, 0);

    const daily = [...revenueDaily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        total: Math.round(v['전체'] ?? 0),
        meta: Math.round(v['Meta 광고'] ?? 0),
        naver: Math.round(v['네이버 검색광고'] ?? 0),
      }));

    return NextResponse.json({
      range: { since, until, days },
      summary: {
        totalSpend,
        paidRevenue,
        totalRevenue,
        blendedRoas: totalSpend ? paidRevenue / totalSpend : 0,
        paidRevenueShare: totalRevenue ? (paidRevenue / totalRevenue) * 100 : 0,
        totalOrders,
        totalInquiries,
      },
      channels,
      daily,
      adsErrors,
      notes: [
        '문의는 프록시 지표입니다 — 폼 문의(/inquiries/new/success 도달) + 챗봇 상담 시작 세션.',
        '매출·주문은 자사 주문 DB 기준입니다. 매체 픽셀 전환수를 쓰지 않습니다.',
        '직접·자연에는 UTM 없는 재방문·북마크·매체 기여창 밖 전환이 섞입니다.',
      ],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
