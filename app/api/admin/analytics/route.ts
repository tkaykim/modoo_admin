import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { createAdminClient } from '@/lib/supabase-admin';
import { RangePreset, Bucket, buildAnalyticsPayload, resolveRange } from '@/lib/analytics/aggregations';
import { unstable_cache } from 'next/cache';

const load = unstable_cache(async (fromIso: string, toIso: string, preset: RangePreset, bucket: Bucket, basis: 'paid_at' | 'created_at') =>
  buildAnalyticsPayload(createAdminClient(), preset, {fromIso,toIso}, bucket, basis), ['analytics-v2'], {revalidate:60});

const VALID_PRESETS: RangePreset[] = ['this_week', 'this_month', 'q1', 'q2', 'q3', 'q4', 'custom'];
const VALID_BUCKETS: Bucket[] = ['hour', 'day', 'week', 'month'];

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const presetParam = (searchParams.get('preset') || 'this_month') as RangePreset;
    const preset: RangePreset = VALID_PRESETS.includes(presetParam) ? presetParam : 'this_month';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const bucketParam = (searchParams.get('bucket') || 'day') as Bucket;
    const bucket: Bucket = VALID_BUCKETS.includes(bucketParam) ? bucketParam : 'day';

    const range = resolveRange(preset, from, to);
    const basis = searchParams.get('basis') === 'paid_at' ? 'paid_at' : 'created_at';
    const payload = await load(range.fromIso, range.toIso, preset, bucket, basis);

    return NextResponse.json({ data: payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: e instanceof RangeError ? 400 : 500 });
  }
}
