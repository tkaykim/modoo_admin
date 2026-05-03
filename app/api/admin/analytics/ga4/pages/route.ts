import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { requireAdmin } from '@/lib/admin/require-admin';
import { topPages } from '@/lib/ga4/reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const fetchTopPages = (days: number) =>
  unstable_cache(
    async () => topPages(days),
    ['ga4-top-pages', String(days)],
    { revalidate: 1800, tags: ['ga4'] },
  )();

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(365, Number(searchParams.get('days') ?? 7)));

    const data = await fetchTopPages(days);
    return NextResponse.json({ data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
