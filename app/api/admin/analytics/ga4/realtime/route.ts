import { NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { realtime } from '@/lib/ga4/reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const data = await realtime();
    return NextResponse.json({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
