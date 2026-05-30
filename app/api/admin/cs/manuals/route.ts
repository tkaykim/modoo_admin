import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase-admin';

const FIELDS =
  'id, intent, title, answer_guide, action_sop, policy, source, status, version, approved_by, approved_at, created_at, updated_at';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const db = createAdminClient();
  const { data, error } = await db
    .from('cs_manuals')
    .select(FIELDS)
    .order('intent', { ascending: true })
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body?.intent || !body?.title) {
    return NextResponse.json({ error: 'intent와 title이 필요합니다.' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from('cs_manuals')
    .insert({
      intent: String(body.intent).trim(),
      title: String(body.title).trim(),
      answer_guide: typeof body.answer_guide === 'string' ? body.answer_guide : '',
      action_sop: typeof body.action_sop === 'string' ? body.action_sop : '',
      policy: body.policy && typeof body.policy === 'object' ? body.policy : {},
      source: typeof body.source === 'string' ? body.source : 'manual',
      status: 'draft',
      created_by: auth.user.id,
    })
    .select(FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === 'string') update.title = body.title.trim();
  if (typeof body.answer_guide === 'string') update.answer_guide = body.answer_guide;
  if (typeof body.action_sop === 'string') update.action_sop = body.action_sop;
  if (body.policy && typeof body.policy === 'object') update.policy = body.policy;
  if (typeof body.intent === 'string') update.intent = body.intent.trim();

  // 승인/보관 상태 변경
  if (body.status === 'approved') {
    update.status = 'approved';
    update.approved_by = auth.user.id;
    update.approved_at = new Date().toISOString();
  } else if (body.status === 'draft' || body.status === 'archived') {
    update.status = body.status;
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from('cs_manuals')
    .update(update)
    .eq('id', id)
    .select(FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
