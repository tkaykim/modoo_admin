import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { updateAdSetBudget, updateAdStatus } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type MarketingActionBody = {
  confirm?: boolean;
  action?: 'pause_ad' | 'activate_ad' | 'adset_budget';
  targetId?: string;
  dailyBudget?: number;
};

const META_ID = /^\d{8,32}$/;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMarketingAccess();
    if ('error' in auth && auth.error) return auth.error;

    const body = (await req.json().catch(() => null)) as MarketingActionBody | null;
    if (!body?.confirm) return bad('실행 확인이 필요합니다.');
    if (!body.action) return bad('action이 필요합니다.');
    if (!body.targetId || !META_ID.test(body.targetId)) return bad('유효한 Meta 대상 ID가 필요합니다.');

    if (body.action === 'pause_ad') {
      const result = await updateAdStatus(body.targetId, 'PAUSED');
      console.info('[marketing-console/action]', { action: body.action, targetId: body.targetId, role: auth.role });
      return NextResponse.json({ data: { ok: true, result } });
    }

    if (body.action === 'activate_ad') {
      const result = await updateAdStatus(body.targetId, 'ACTIVE');
      console.info('[marketing-console/action]', { action: body.action, targetId: body.targetId, role: auth.role });
      return NextResponse.json({ data: { ok: true, result } });
    }

    if (body.action === 'adset_budget') {
      const dailyBudget = Number(body.dailyBudget);
      if (!Number.isFinite(dailyBudget)) return bad('dailyBudget이 필요합니다.');
      if (dailyBudget < 10000 || dailyBudget > 500000) return bad('일예산은 ₩10,000~₩500,000 범위만 허용됩니다.');
      const result = await updateAdSetBudget(body.targetId, Math.round(dailyBudget));
      console.info('[marketing-console/action]', {
        action: body.action,
        targetId: body.targetId,
        dailyBudget: Math.round(dailyBudget),
        role: auth.role,
      });
      return NextResponse.json({ data: { ok: true, result } });
    }

    return bad('지원하지 않는 action입니다.');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    console.error('[marketing-console/action] error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
