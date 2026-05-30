import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase-admin';

const FIELDS =
  'id, question, answer, category, intent, source, rationale, confidence, suggested_to_consult, suggested_show_in_chatbot, status, published_faq_id, reviewed_by, reviewed_at, created_at';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  const db = createAdminClient();
  let q = db.from('cs_faq_candidates').select(FIELDS).order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const action = body?.action; // 'approve' | 'reject' | 'edit'
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  const db = createAdminClient();

  // 편집: 질문/답변/카테고리/제안 플래그 수정
  if (action === 'edit') {
    const update: Record<string, unknown> = {};
    if (typeof body.question === 'string') update.question = body.question.trim();
    if (typeof body.answer === 'string') update.answer = body.answer.trim();
    if (body.category !== undefined) update.category = body.category || null;
    if (typeof body.suggested_to_consult === 'boolean') update.suggested_to_consult = body.suggested_to_consult;
    if (typeof body.suggested_show_in_chatbot === 'boolean')
      update.suggested_show_in_chatbot = body.suggested_show_in_chatbot;
    const { data, error } = await db.from('cs_faq_candidates').update(update).eq('id', id).select(FIELDS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (action === 'reject') {
    const { data, error } = await db
      .from('cs_faq_candidates')
      .update({ status: 'rejected', reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select(FIELDS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (action === 'approve') {
    // 후보를 faqs로 발행
    const { data: cand, error: candErr } = await db
      .from('cs_faq_candidates')
      .select('id, question, answer, category, suggested_to_consult, suggested_show_in_chatbot, status, published_faq_id')
      .eq('id', id)
      .single();
    if (candErr || !cand) return NextResponse.json({ error: candErr?.message || '후보를 찾을 수 없습니다.' }, { status: 404 });
    if (cand.status === 'approved' && cand.published_faq_id) {
      return NextResponse.json({ data: cand }); // 멱등: 이미 발행됨
    }

    const { data: faq, error: faqErr } = await db
      .from('faqs')
      .insert({
        question: cand.question,
        answer: cand.answer,
        category: cand.category || null,
        to_consult: Boolean(cand.suggested_to_consult),
        show_in_chatbot: Boolean(cand.suggested_show_in_chatbot),
        is_published: true,
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select('id')
      .single();
    if (faqErr) return NextResponse.json({ error: faqErr.message }, { status: 500 });

    const { data, error } = await db
      .from('cs_faq_candidates')
      .update({
        status: 'approved',
        published_faq_id: faq.id,
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(FIELDS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: '알 수 없는 action입니다.' }, { status: 400 });
}
