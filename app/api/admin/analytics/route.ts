import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { createAdminClient } from '@/lib/supabase-admin';
import { RangePreset, Bucket, buildAnalyticsPayload, resolveRange } from '@/lib/analytics/aggregations';

const VALID_PRESETS: RangePreset[] = ['this_week', 'this_month', 'q1', 'q2', 'q3', 'q4', 'custom'];
const VALID_BUCKETS: Bucket[] = ['hour', 'day', 'month'];

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const presetParam = (searchParams.get('preset') || 'this_month') as RangePreset;
    const preset: RangePreset = VALID_PRESETS.includes(presetParam) ? presetParam : 'this_month';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const bucketParam = (searchParams.get('bucket') || 'day') as Bucket;
    const bucket: Bucket = VALID_BUCKETS.includes(bucketParam) ? bucketParam : 'day';

    const range = resolveRange(preset, from, to);
    const admin = createAdminClient();
    const payload = await buildAnalyticsPayload(admin, preset, range, bucket);

    return NextResponse.json({ data: payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
