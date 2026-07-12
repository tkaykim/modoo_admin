import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { createHubClient } from '@/lib/hub-supabase';
import { createImageAdCreative, createPausedAd, updateAdStatus } from '@/lib/meta-ads';

// 오늘의 결정 — 승인 대기 소재를 근거(시즌·경쟁사 트렌드)와 함께 보여주고,
// 승인 = 즉시 실행(테스트 세트에 ACTIVE 등록)까지 한 여정으로 처리한다.
// (feedback_admin_ux_journey 2026-07-12: "편하게 보고 → 편하게 결정", 승인 후 실행 버튼을 또 찾게 하지 않는다)

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TEST_ADSET_ID = process.env.META_TEST_ADSET_ID || '52511754858250'; // [AI테스트] 신규소재 검증
const DEFAULT_LINK = process.env.META_AD_DEFAULT_LINK || 'https://www.modoouniform.com/home';

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;
    const hub = createHubClient();

    const [draftsRes, actionsRes, competitorsRes] = await Promise.all([
      hub
        .from('modoo_ad_creative_drafts')
        .select('id,title,primary_text,cta,overlay_headline,overlay_sub,rationale,based_on,image_url,image_hash,status,created_at')
        .eq('status', 'pending_review')
        .eq('kind', 'new_creative')
        .order('created_at', { ascending: false })
        .limit(20),
      hub
        .from('marketing_actions')
        .select('id,kind,target_name,reason,status,proposed_by,created_at,executed_at')
        .order('created_at', { ascending: false })
        .limit(20),
      hub
        .from('meta_ad_snapshots')
        .select('headline,body_text,days_running,page_name')
        .eq('bu_code', 'modoo')
        .eq('status', 'ACTIVE')
        .gte('days_running', 14)
        .order('days_running', { ascending: false })
        .limit(12),
    ]);

    // 경쟁사 장수 소재 — 헤드라인 중복 제거 top 6
    const seen = new Set<string>();
    const competitorWinners: Array<{ headline: string; body: string; daysRunning: number }> = [];
    for (const row of competitorsRes.data ?? []) {
      const key = String(row.headline || row.body_text || '').slice(0, 30);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      competitorWinners.push({
        headline: row.headline ?? '',
        body: String(row.body_text ?? '').replace(/\n/g, ' ').slice(0, 120),
        daysRunning: row.days_running ?? 0,
      });
      if (competitorWinners.length >= 6) break;
    }

    return NextResponse.json({
      data: {
        pending: draftsRes.data ?? [],
        timeline: actionsRes.data ?? [],
        competitorWinners,
        testAdSetId: TEST_ADSET_ID,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    console.error('[marketing-console/decisions] GET error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type DecisionBody = {
  draftId?: string;
  action?: 'approve' | 'reject';
};

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const body = (await req.json().catch(() => null)) as DecisionBody | null;
    if (!body?.draftId || !/^[0-9a-f-]{36}$/i.test(body.draftId)) return bad('유효한 draftId가 필요합니다.');
    if (body.action !== 'approve' && body.action !== 'reject') return bad('action은 approve|reject 입니다.');

    const hub = createHubClient();
    const { data: draft, error: draftErr } = await hub
      .from('modoo_ad_creative_drafts')
      .select('*')
      .eq('id', body.draftId)
      .single();
    if (draftErr || !draft) return bad('초안을 찾을 수 없습니다.', 404);
    if (draft.status !== 'pending_review') return bad(`이미 처리된 초안입니다 (status=${draft.status}).`, 409);

    const reviewer = `marketing-console:${auth.role ?? 'admin'}`;

    if (body.action === 'reject') {
      await hub
        .from('modoo_ad_creative_drafts')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: reviewer })
        .eq('id', body.draftId);
      return NextResponse.json({ data: { ok: true, status: 'rejected' } });
    }

    // ── approve = 즉시 실행 ──
    if (!draft.image_hash) return bad('이미지가 아직 없는 초안입니다 — 이미지 생성 후 승인해 주세요.', 422);
    const message = String(draft.primary_text ?? '').trim();
    if (!message) return bad('primary_text가 비어 있습니다.', 422);

    const adName = `[신규]${String(draft.title ?? '무제').replace(/\s+/g, '')}_${new Date().toISOString().slice(5, 10).replace('-', '')}`;
    const creative = await createImageAdCreative({
      name: adName,
      imageHash: draft.image_hash,
      message,
      linkUrl: DEFAULT_LINK,
    });
    const ad = await createPausedAd({ name: adName, adSetId: TEST_ADSET_ID, creativeId: creative.id });
    await updateAdStatus(ad.id, 'ACTIVE'); // 승인 = 즉시 집행 (테스트 세트, 가드레일이 감시)

    await hub
      .from('modoo_ad_creative_drafts')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewer,
        packaged_at: new Date().toISOString(),
      })
      .eq('id', body.draftId);

    await hub.from('marketing_actions').insert({
      bu_code: 'modoo',
      kind: 'create_ad',
      target_id: ad.id,
      target_name: adName,
      payload: { adset_id: TEST_ADSET_ID, image_hash: draft.image_hash, creative_id: creative.id, activated: true },
      reason: `결정 콘솔 승인 → 즉시 집행 (초안 "${draft.title}", 승인자 ${reviewer})`,
      status: 'executed',
      result: { success: true, ad_id: ad.id, creative_id: creative.id },
      proposed_by: reviewer,
      executed_at: new Date().toISOString(),
    });

    console.info('[marketing-console/decisions] approved & launched', { draftId: body.draftId, adId: ad.id, role: auth.role });
    return NextResponse.json({ data: { ok: true, status: 'approved', adId: ad.id } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    console.error('[marketing-console/decisions] POST error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
