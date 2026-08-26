import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { createAdminClient } from '@/lib/supabase-admin';

const CAMPAIGN_START = new Date('2026-08-24T00:00:00+09:00');
const EVENT_TYPES = [
  'page_view',
  'partner_mall_product_view',
  'partner_mall_inquiry_click',
  'partner_mall_order_start',
  'partner_mall_checkout_start',
  'partner_mall_action_click',
  'partner_mall_engagement',
] as const;

type ExpoMall = {
  id: string;
  name: string;
  slug: string | null;
  share_token: string;
  source_key: string;
};

type AnalyticsEvent = {
  id: string;
  event_type: string;
  path: string | null;
  session_id: string | null;
  occurred_at: string;
  device: string | null;
  referrer: string | null;
  meta: Record<string, unknown> | null;
};

type PartnerOrder = {
  id: string;
  partner_mall_id: string | null;
  total_amount: number | null;
  payment_status: string | null;
  order_status: string | null;
  created_at: string;
};

type MutableMallStats = {
  id: string;
  name: string;
  slug: string | null;
  source_key: string;
  visitors: Set<string>;
  pageviews: number;
  product_views: number;
  inquiry_clicks: number;
  inquiry_sessions: Set<string>;
  order_starts: number;
  checkout_starts: number;
  action_clicks: number;
  active_seconds_by_session: Map<string, number>;
  duration_seconds_by_session: Map<string, number>;
  scroll_percent_by_session: Map<string, number>;
  orders: number;
  paid_orders: number;
  revenue: number;
  last_visit_at: string | null;
};

type MutableDailyStats = {
  visitors: Set<string>;
  pageviews: number;
  product_views: number;
  inquiry_clicks: number;
  order_starts: number;
  checkout_starts: number;
  orders: number;
  revenue: number;
};

type MutableJourney = {
  session_id: string;
  mall_id: string;
  mall_name: string;
  started_at: string | null;
  last_event_at: string;
  active_seconds: number;
  duration_seconds: number;
  max_scroll_percent: number;
  click_count: number;
  last_action: string | null;
  actions: Array<{ action: string; elapsed_seconds: number | null; occurred_at: string }>;
};

function kstDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function resolveRange(range: string | null) {
  const now = new Date();
  const normalized = range === '7d' || range === '30d' || range === '90d' ? range : 'all';
  const from = normalized === 'all'
    ? CAMPAIGN_START
    : new Date(now.getTime() - Number(normalized.slice(0, -1)) * 24 * 60 * 60 * 1000);
  return { from, to: now, key: normalized };
}

function buildDateKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const startKey = kstDateKey(from);
  const endKey = kstDateKey(to);
  const cursor = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function readMetaString(meta: Record<string, unknown> | null, key: string): string | null {
  const value = meta?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readMetaNumber(meta: Record<string, unknown> | null, key: string): number | null {
  const value = meta?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeAction(action: string): string {
  if (action.startsWith('product_preview:')) return 'product_preview';
  if (action.startsWith('order_start:')) return 'order_start';
  return action;
}

function average(values: Iterable<number>): number {
  const list = [...values];
  return list.length > 0 ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
}

function readMallKey(path: string | null): string | null {
  if (!path) return null;
  const match = path.split('?')[0]?.match(/^\/mall\/([^/]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function fetchEvents(
  admin: ReturnType<typeof createAdminClient>,
  from: Date,
  to: Date,
): Promise<AnalyticsEvent[]> {
  const rows: AnalyticsEvent[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from('analytics_events')
      .select('id,event_type,path,session_id,occurred_at,device,referrer,meta')
      .in('event_type', [...EVENT_TYPES])
      .like('path', '/mall/%')
      .gte('occurred_at', from.toISOString())
      .lte('occurred_at', to.toISOString())
      .order('occurred_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as AnalyticsEvent[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function fetchOrders(
  admin: ReturnType<typeof createAdminClient>,
  mallIds: string[],
  from: Date,
  to: Date,
): Promise<PartnerOrder[]> {
  if (mallIds.length === 0) return [];
  const rows: PartnerOrder[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from('orders')
      .select('id,partner_mall_id,total_amount,payment_status,order_status,created_at')
      .in('partner_mall_id', mallIds)
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as PartnerOrder[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const { from, to, key } = resolveRange(new URL(req.url).searchParams.get('range'));
    const admin = createAdminClient();
    const { data: mallRows, error: mallError } = await admin
      .from('partner_malls')
      .select('id,name,slug,share_token,source_key')
      .like('source_key', 'franchise-coex:84:%')
      .order('name', { ascending: true });
    if (mallError) throw new Error(mallError.message);

    const malls = (mallRows ?? []) as ExpoMall[];
    const mallIds = malls.map((mall) => mall.id);
    const [events, orders] = await Promise.all([
      fetchEvents(admin, from, to),
      fetchOrders(admin, mallIds, from, to),
    ]);

    const byId = new Map<string, MutableMallStats>();
    const keyToId = new Map<string, string>();
    for (const mall of malls) {
      byId.set(mall.id, {
        id: mall.id,
        name: mall.name,
        slug: mall.slug,
        source_key: mall.source_key,
        visitors: new Set(),
        pageviews: 0,
        product_views: 0,
        inquiry_clicks: 0,
        inquiry_sessions: new Set(),
        order_starts: 0,
        checkout_starts: 0,
        action_clicks: 0,
        active_seconds_by_session: new Map(),
        duration_seconds_by_session: new Map(),
        scroll_percent_by_session: new Map(),
        orders: 0,
        paid_orders: 0,
        revenue: 0,
        last_visit_at: null,
      });
      keyToId.set(mall.share_token, mall.id);
      if (mall.slug) keyToId.set(mall.slug, mall.id);
    }

    const dateKeys = buildDateKeys(from, to);
    const daily = new Map<string, MutableDailyStats>(dateKeys.map((date) => [date, {
      visitors: new Set(),
      pageviews: 0,
      product_views: 0,
      inquiry_clicks: 0,
      order_starts: 0,
      checkout_starts: 0,
      orders: 0,
      revenue: 0,
    }]));
    const allVisitors = new Set<string>();
    const inquirySessions = new Set<string>();
    const productViewSessions = new Set<string>();
    const orderStartSessions = new Set<string>();
    const checkoutSessions = new Set<string>();
    const sessionDevices = new Map<string, string>();
    const sessionChannels = new Map<string, 'direct' | 'external'>();
    const journeys = new Map<string, MutableJourney>();
    const actionBreakdown = new Map<string, number>();
    const inquiryBreakdown: Record<string, number> = {
      header_kakao: 0,
      header_phone: 0,
      other_apparel: 0,
      design_revision: 0,
      price_negotiation: 0,
    };

    for (const event of events) {
      const metaMallId = readMetaString(event.meta, 'partner_mall_id');
      const mallId = metaMallId && byId.has(metaMallId)
        ? metaMallId
        : keyToId.get(readMallKey(event.path) ?? '') ?? null;
      if (!mallId) continue;
      const stats = byId.get(mallId)!;
      const day = daily.get(kstDateKey(event.occurred_at));
      const sessionId = event.session_id || `event:${event.id}`;
      const journeyKey = `${mallId}:${sessionId}`;
      let journey = journeys.get(journeyKey);
      if (!journey) {
        journey = {
          session_id: sessionId,
          mall_id: mallId,
          mall_name: stats.name,
          started_at: null,
          last_event_at: event.occurred_at,
          active_seconds: 0,
          duration_seconds: 0,
          max_scroll_percent: 0,
          click_count: 0,
          last_action: null,
          actions: [],
        };
        journeys.set(journeyKey, journey);
      }
      journey.last_event_at = event.occurred_at;

      if (event.event_type === 'page_view') {
        if (!journey.started_at) journey.started_at = event.occurred_at;
        stats.pageviews += 1;
        stats.visitors.add(sessionId);
        stats.last_visit_at = event.occurred_at;
        allVisitors.add(sessionId);
        if (!sessionDevices.has(sessionId)) sessionDevices.set(sessionId, event.device || 'unknown');
        if (!sessionChannels.has(sessionId)) {
          const referrer = event.referrer?.toLowerCase() || '';
          sessionChannels.set(sessionId, !referrer || referrer.includes('modoouniform.com') ? 'direct' : 'external');
        }
        if (day) {
          day.pageviews += 1;
          day.visitors.add(sessionId);
        }
      } else if (event.event_type === 'partner_mall_product_view') {
        stats.product_views += 1;
        productViewSessions.add(sessionId);
        if (day) day.product_views += 1;
      } else if (event.event_type === 'partner_mall_inquiry_click') {
        stats.inquiry_clicks += 1;
        stats.inquiry_sessions.add(sessionId);
        inquirySessions.add(sessionId);
        const inquiryType = readMetaString(event.meta, 'inquiry_type');
        if (inquiryType && inquiryType in inquiryBreakdown) inquiryBreakdown[inquiryType] += 1;
        if (day) day.inquiry_clicks += 1;
      } else if (event.event_type === 'partner_mall_order_start') {
        stats.order_starts += 1;
        orderStartSessions.add(sessionId);
        if (day) day.order_starts += 1;
      } else if (event.event_type === 'partner_mall_checkout_start') {
        stats.checkout_starts += 1;
        checkoutSessions.add(sessionId);
        if (day) day.checkout_starts += 1;
      } else if (event.event_type === 'partner_mall_action_click') {
        const action = readMetaString(event.meta, 'action');
        if (!action) continue;
        const normalizedAction = normalizeAction(action);
        stats.action_clicks += 1;
        actionBreakdown.set(normalizedAction, (actionBreakdown.get(normalizedAction) ?? 0) + 1);
        journey.click_count = Math.max(journey.click_count, readMetaNumber(event.meta, 'click_index') ?? journey.click_count + 1);
        journey.last_action = action;
        if (journey.actions.length < 50) {
          journey.actions.push({
            action,
            elapsed_seconds: readMetaNumber(event.meta, 'elapsed_seconds'),
            occurred_at: event.occurred_at,
          });
        }
      } else if (event.event_type === 'partner_mall_engagement') {
        const activeSeconds = Math.max(0, readMetaNumber(event.meta, 'active_seconds') ?? 0);
        const durationSeconds = Math.max(0, readMetaNumber(event.meta, 'duration_seconds') ?? 0);
        const scrollPercent = Math.min(100, Math.max(0, readMetaNumber(event.meta, 'max_scroll_percent') ?? 0));
        const clickCount = Math.max(0, readMetaNumber(event.meta, 'click_count') ?? 0);
        const lastAction = readMetaString(event.meta, 'last_action');
        stats.active_seconds_by_session.set(sessionId, Math.max(stats.active_seconds_by_session.get(sessionId) ?? 0, activeSeconds));
        stats.duration_seconds_by_session.set(sessionId, Math.max(stats.duration_seconds_by_session.get(sessionId) ?? 0, durationSeconds));
        stats.scroll_percent_by_session.set(sessionId, Math.max(stats.scroll_percent_by_session.get(sessionId) ?? 0, scrollPercent));
        journey.active_seconds = Math.max(journey.active_seconds, activeSeconds);
        journey.duration_seconds = Math.max(journey.duration_seconds, durationSeconds);
        journey.max_scroll_percent = Math.max(journey.max_scroll_percent, scrollPercent);
        journey.click_count = Math.max(journey.click_count, clickCount);
        if (lastAction) journey.last_action = lastAction;
      }
    }

    let paidOrders = 0;
    let revenue = 0;
    for (const order of orders) {
      if (!order.partner_mall_id) continue;
      const stats = byId.get(order.partner_mall_id);
      if (!stats) continue;
      stats.orders += 1;
      const isPaid = order.payment_status === 'completed' && order.order_status !== 'cancelled';
      if (isPaid) {
        stats.paid_orders += 1;
        stats.revenue += Number(order.total_amount ?? 0);
        paidOrders += 1;
        revenue += Number(order.total_amount ?? 0);
      }
      const day = daily.get(kstDateKey(order.created_at));
      if (day) {
        day.orders += 1;
        if (isPaid) day.revenue += Number(order.total_amount ?? 0);
      }
    }

    const mallStats = [...byId.values()]
      .map((stats) => ({
        id: stats.id,
        name: stats.name,
        slug: stats.slug,
        source_key: stats.source_key,
        unique_visitors: stats.visitors.size,
        pageviews: stats.pageviews,
        product_views: stats.product_views,
        inquiry_clicks: stats.inquiry_clicks,
        inquiry_sessions: stats.inquiry_sessions.size,
        order_starts: stats.order_starts,
        checkout_starts: stats.checkout_starts,
        action_clicks: stats.action_clicks,
        measured_sessions: stats.active_seconds_by_session.size,
        avg_active_seconds: average(stats.active_seconds_by_session.values()),
        avg_duration_seconds: average(stats.duration_seconds_by_session.values()),
        avg_scroll_percent: average(stats.scroll_percent_by_session.values()),
        orders: stats.orders,
        paid_orders: stats.paid_orders,
        revenue: stats.revenue,
        inquiry_rate: stats.visitors.size > 0 ? stats.inquiry_sessions.size / stats.visitors.size : 0,
        order_rate: stats.visitors.size > 0 ? stats.orders / stats.visitors.size : 0,
        last_visit_at: stats.last_visit_at,
      }))
      .sort((a, b) => b.unique_visitors - a.unique_visitors || b.inquiry_clicks - a.inquiry_clicks || a.name.localeCompare(b.name, 'ko'));

    const measuredJourneys = [...journeys.values()].filter((journey) => journey.active_seconds > 0 || journey.duration_seconds > 0);
    const recentJourneys = [...journeys.values()]
      .filter((journey) => journey.started_at)
      .sort((a, b) => new Date(b.last_event_at).getTime() - new Date(a.last_event_at).getTime())
      .slice(0, 50)
      .map((journey) => ({
        session_id: journey.session_id,
        mall_id: journey.mall_id,
        mall_name: journey.mall_name,
        started_at: journey.started_at,
        last_event_at: journey.last_event_at,
        active_seconds: journey.active_seconds,
        duration_seconds: journey.duration_seconds,
        max_scroll_percent: journey.max_scroll_percent,
        click_count: journey.click_count,
        last_action: journey.last_action,
        actions: journey.actions,
      }));

    const deviceBreakdown = { mobile: 0, desktop: 0, tablet: 0, unknown: 0 };
    for (const device of sessionDevices.values()) {
      if (device === 'mobile') deviceBreakdown.mobile += 1;
      else if (device === 'desktop') deviceBreakdown.desktop += 1;
      else if (device === 'tablet') deviceBreakdown.tablet += 1;
      else deviceBreakdown.unknown += 1;
    }
    const channelBreakdown = { direct: 0, external: 0 };
    for (const channel of sessionChannels.values()) channelBreakdown[channel] += 1;

    return NextResponse.json({
      data: {
        range: { key, from: from.toISOString(), to: to.toISOString() },
        tracking: {
          campaign_started_at: CAMPAIGN_START.toISOString(),
          interaction_tracking_note: '문의·상품 상세·주문 시작 클릭은 추적 기능 배포 이후부터 집계됩니다.',
        },
        overview: {
          total_malls: malls.length,
          visited_malls: mallStats.filter((mall) => mall.pageviews > 0).length,
          unique_visitors: allVisitors.size,
          pageviews: mallStats.reduce((sum, mall) => sum + mall.pageviews, 0),
          product_views: mallStats.reduce((sum, mall) => sum + mall.product_views, 0),
          product_view_sessions: productViewSessions.size,
          inquiry_clicks: mallStats.reduce((sum, mall) => sum + mall.inquiry_clicks, 0),
          inquiry_sessions: inquirySessions.size,
          order_starts: mallStats.reduce((sum, mall) => sum + mall.order_starts, 0),
          order_start_sessions: orderStartSessions.size,
          checkout_starts: mallStats.reduce((sum, mall) => sum + mall.checkout_starts, 0),
          checkout_sessions: checkoutSessions.size,
          action_clicks: mallStats.reduce((sum, mall) => sum + mall.action_clicks, 0),
          engagement_sessions: measuredJourneys.length,
          avg_active_seconds: average(measuredJourneys.map((journey) => journey.active_seconds)),
          avg_duration_seconds: average(measuredJourneys.map((journey) => journey.duration_seconds)),
          avg_clicks_per_session: average(measuredJourneys.map((journey) => journey.click_count)),
          no_action_sessions: measuredJourneys.filter((journey) => journey.click_count === 0).length,
          orders: orders.length,
          paid_orders: paidOrders,
          revenue,
          inquiry_rate: allVisitors.size > 0 ? inquirySessions.size / allVisitors.size : 0,
          order_rate: allVisitors.size > 0 ? orders.length / allVisitors.size : 0,
        },
        inquiry_breakdown: inquiryBreakdown,
        device_breakdown: deviceBreakdown,
        channel_breakdown: channelBreakdown,
        action_breakdown: [...actionBreakdown.entries()]
          .map(([action, count]) => ({ action, count }))
          .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action, 'ko'))
          .slice(0, 30),
        recent_journeys: recentJourneys,
        daily: dateKeys.map((date) => {
          const stats = daily.get(date)!;
          return {
            date,
            unique_visitors: stats.visitors.size,
            pageviews: stats.pageviews,
            product_views: stats.product_views,
            inquiry_clicks: stats.inquiry_clicks,
            order_starts: stats.order_starts,
            checkout_starts: stats.checkout_starts,
            orders: stats.orders,
            revenue: stats.revenue,
          };
        }),
        malls: mallStats,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '성과 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
