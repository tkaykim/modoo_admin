import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase-admin';

const FIELDS =
  'id, inquiry_id, source_type, intent, customer_summary, draft_reply, proposed_actions, confidence, flags, status, reviewer_edited_reply, approved_actions, executed_actions, run_id, knowledge_snapshot, reviewed_by, reviewed_at, executed_at, created_at, updated_at';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'pending_review';

  const db = createAdminClient();
  let q = db.from('cs_draft_replies').select(FIELDS).order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data: drafts, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 원문 문의 메타 결합 (게시판 문의만; 챗봇은 inquiry_id가 chatbot_inquiries일 수 있음)
  const ids = (drafts || []).map((d) => d.inquiry_id).filter(Boolean);
  let inquiryMap: Record<string, any> = {};
  if (ids.length > 0) {
    const { data: inqs } = await db
      .from('inquiries')
      .select('id, title, group_name, manager_name, phone, email, kakao_id, expected_qty, desired_date, status')
      .in('id', ids);
    inquiryMap = Object.fromEntries((inqs || []).map((i) => [i.id, i]));
  }

  const enriched = (drafts || []).map((d) => ({ ...d, inquiry: inquiryMap[d.inquiry_id] ?? null }));
  return NextResponse.json({ data: enriched });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const action = body?.action; // 'edit' | 'reject'
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  const db = createAdminClient();

  if (action === 'edit') {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.reviewer_edited_reply === 'string') update.reviewer_edited_reply = body.reviewer_edited_reply;
    if (Array.isArray(body.approved_actions)) update.approved_actions = body.approved_actions;
    const { data, error } = await db.from('cs_draft_replies').update(update).eq('id', id).select(FIELDS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (action === 'reject') {
    const { data: draft } = await db
      .from('cs_draft_replies')
      .select('id, inquiry_id, intent, draft_reply, proposed_actions')
      .eq('id', id)
      .single();

    const { data, error } = await db
      .from('cs_draft_replies')
      .update({
        status: 'rejected',
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(FIELDS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 학습 피드백 적재 (반려)
    if (draft) {
      const reviewerNote = typeof body.reviewer_note === 'string' ? body.reviewer_note.trim() : '';
      await db.from('cs_feedback').insert({
        draft_id: id,
        inquiry_id: draft.inquiry_id,
        intent: draft.intent,
        original_draft: draft.draft_reply,
        final_sent: null,
        verdict: 'rejected',
        reviewer_note: reviewerNote || null,
        is_pinned: true,
        learning_rule: reviewerNote || null,
        learned_at: reviewerNote ? new Date().toISOString() : null,
        learning_version: 1,
        proposed_actions_before: draft.proposed_actions ?? null,
      });
    }
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: '알 수 없는 action입니다.' }, { status: 400 });
}
