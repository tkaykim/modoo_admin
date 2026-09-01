/**
 * 네이버 키워드별 노출 순위 진단 API.
 *
 * "현재 노출 순위"는 두 겹으로 답해야 한다:
 *  - 실측 평균순위(avgRnk)는 노출이 있었던 키워드에만 존재한다.
 *  - 노출이 0인 키워드는 **입찰가 곡선(1~5위 필요 입찰가)에 현재 입찰가를 대입**해
 *    "지금 입찰로는 몇 위권인가 / 왜 안 나가는가"를 역산한다.
 *
 * 순위별 추정 5회 × 청크 호출이라 메인 성과 API 와 분리했다 — 패널에서 지연 로드한다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { estimateBidForPosition, getCreds, listAdGroups, listKeywords } from '@/lib/naver-ads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POSITIONS = [1, 2, 3, 4, 5] as const;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const device = searchParams.get('device') === 'PC' ? 'PC' : 'MOBILE';

    const creds = getCreds();
    if (!creds) {
      return NextResponse.json({ error: 'NAVER_AD_* 미설정' }, { status: 503 });
    }

    const groups = await listAdGroups(creds);
    const rows: Array<{ keywordId: string; keyword: string; group: string; bid: number; locked: boolean }> = [];
    for (const g of groups.filter((x) => !x.userLock)) {
      for (const k of await listKeywords(creds, g.nccAdgroupId)) {
        rows.push({
          keywordId: k.nccKeywordId,
          keyword: k.keyword,
          group: g.name.trim(),
          bid: (k.useGroupBidAmt ? g.bidAmt : k.bidAmt) ?? 0,
          locked: Boolean(k.userLock),
        });
      }
    }

    // 같은 키워드가 여러 그룹에 있어도 추정은 키워드 문자열 기준 1회면 된다.
    const uniqueKeywords = [...new Set(rows.map((r) => r.keyword))];
    const byPos = new Map<number, Record<string, number>>();
    await Promise.all(
      POSITIONS.map(async (p) => byPos.set(p, await estimateBidForPosition(creds, uniqueKeywords, p, device))),
    );

    const result = rows.map((r) => {
      const need: Record<string, number | null> = {};
      for (const p of POSITIONS) need[`p${p}`] = byPos.get(p)?.[r.keyword] ?? null;

      // 현재 입찰가로 도달 가능한 가장 높은 순위 (곡선은 1위가 가장 비싸다)
      let estimated: number | null = null;
      for (const p of POSITIONS) {
        const b = byPos.get(p)?.[r.keyword];
        if (b !== undefined && r.bid >= b) {
          estimated = p;
          break;
        }
      }
      const p5 = byPos.get(5)?.[r.keyword];
      return {
        ...r,
        need,
        estimatedPosition: estimated, // null = 5위 밖 (사실상 노출 안 됨)
        gapToP5: p5 !== undefined && r.bid < p5 ? p5 - r.bid : 0, // 5위 진입까지 부족액
      };
    });

    return NextResponse.json({ device, keywords: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
