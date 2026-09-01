/**
 * 네이버 키워드 1개의 일별 성과 (드릴다운용).
 *
 * `/stats` 단수 `id` 호출은 실적 0인 날도 행을 돌려준다 —
 * "집행이 없었는지 / 성과만 나쁜지"를 이걸로 구분한다 (복수 ids 는 0인 대상을 통째로 생략).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { getCreds, getDailyStats, rangeFromDays } from '@/lib/naver-ads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') ?? '';
    if (!/^nkw-[a-z0-9-]+$/i.test(id)) {
      return NextResponse.json({ error: 'invalid keyword id' }, { status: 400 });
    }
    const days = Math.max(1, Math.min(90, Number(searchParams.get('days') ?? 14)));
    const { since, until } = rangeFromDays(days);

    const creds = getCreds();
    if (!creds) return NextResponse.json({ error: 'NAVER_AD_* 미설정' }, { status: 503 });

    const rows = await getDailyStats(creds, id, since, until);
    return NextResponse.json({
      range: { since, until },
      daily: rows.map((r) => ({
        date: String(r.dateStart ?? ''),
        impressions: Number(r.impCnt ?? 0),
        clicks: Number(r.clkCnt ?? 0),
        ctr: Number(r.ctr ?? 0),
        cpc: Math.round(Number(r.cpc ?? 0)),
        spend: Math.round(Number(r.salesAmt ?? 0)),
        avgRank: Number(r.avgRnk ?? 0),
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
