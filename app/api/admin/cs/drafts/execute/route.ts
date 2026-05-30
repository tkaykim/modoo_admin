import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireAdmin } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendOrQueueCsEmail } from '@/lib/cs/email-schedule';

const SITE_URL = 'https://modoouniform.com';
const LOGO_URL = 'https://modoouniform.com/icons/modoo_logo.png';
const KAKAO_URL = 'https://pf.kakao.com/_xjSdYG/chat';
const BRAND = '#3B55A5';

type Db = ReturnType<typeof createAdminClient>;
interface ActionResult {
  type: string;
  status: 'done' | 'failed' | 'skipped';
  detail?: string;
  at: string;
}

function genCouponCode(): string {
  return 'CS' + randomBytes(3).toString('hex').toUpperCase(); // CS + 6 hex
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function buildEmailHtml(replyText: string, inquiryUrl: string): string {
  const body = escapeHtml(replyText).replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<tr><td style="background:${BRAND};padding:24px 32px;text-align:center;"><img src="${LOGO_URL}" alt="모두의 유니폼" width="132" style="display:inline-block;max-width:132px;height:auto;"></td></tr>
<tr><td style="padding:32px;font-size:15px;line-height:1.75;color:#333;">${body}</td></tr>
<tr><td style="padding:0 32px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding-bottom:12px;"><a href="${inquiryUrl}" style="display:inline-block;background:${BRAND};color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:15px 0;width:100%;max-width:480px;border-radius:10px;text-align:center;">문의 게시판에서 답변하기</a></td></tr>
<tr><td align="center"><a href="${KAKAO_URL}" style="display:inline-block;background:#FEE500;color:#191600;font-size:15px;font-weight:700;text-decoration:none;padding:15px 0;width:100%;max-width:480px;border-radius:10px;text-align:center;">카카오톡으로 상담하기</a></td></tr>
</table></td></tr>
<tr><td style="padding:24px 32px 28px;border-top:1px solid #eee;text-align:center;">
<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${BRAND};">모두의 유니폼</p>
<p style="margin:0;font-size:12px;color:#aaa;">단체 유니폼·굿즈 제작 · <a href="${SITE_URL}" style="color:#aaa;">modoouniform.com</a></p>
</td></tr></table></td></tr></table></body></html>`;
}

/** 멱등성 클레임. 이미 done이면 alreadyDone=true. */
async function claimAction(db: Db, draftId: string, type: string, request: unknown) {
  const key = `${draftId}:${type}`;
  const ins = await db
    .from('cs_action_log')
    .insert({ idempotency_key: key, draft_id: draftId, action_type: type, status: 'pending', request })
    .select('id, status')
    .single();
  if (!ins.error) return { alreadyDone: false, logId: ins.data.id as string };
  // 중복 → 기존 행 조회
  const { data: existing } = await db.from('cs_action_log').select('id, status').eq('idempotency_key', key).single();
  if (existing?.status === 'done') return { alreadyDone: true, logId: existing.id as string };
  return { alreadyDone: false, logId: existing?.id as string | undefined };
}

async function finishLog(db: Db, logId: string | undefined, status: 'done' | 'failed' | 'skipped', result: unknown) {
  if (!logId) return;
  await db.from('cs_action_log').update({ status, result }).eq('id', logId);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const actions: Array<{ type: string; params?: any }> = Array.isArray(body?.actions) ? body.actions : [];
  const fileUrls: string[] = Array.isArray(body?.file_urls)
    ? body.file_urls.filter((u: unknown) => typeof u === 'string' && u.length > 0)
    : [];
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  if (actions.length === 0) return NextResponse.json({ error: '실행할 액션이 없습니다.' }, { status: 400 });

  const db = createAdminClient();
  const { data: draft, error: dErr } = await db
    .from('cs_draft_replies')
    .select('id, inquiry_id, intent, draft_reply, reviewer_edited_reply, status, proposed_actions')
    .eq('id', id)
    .single();
  if (dErr || !draft) return NextResponse.json({ error: dErr?.message || '초안을 찾을 수 없습니다.' }, { status: 404 });
  if (draft.status === 'done') return NextResponse.json({ error: '이미 실행 완료된 초안입니다.' }, { status: 409 });

  const { data: inquiry } = await db
    .from('inquiries')
    .select('id, email, status, created_at')
    .eq('id', draft.inquiry_id)
    .single();

  // 고객 최근 활동 시각(야간 즉시발송 예외용): 마지막 고객 답글 또는 문의 접수 시각.
  let customerActiveAt: string | null = inquiry?.created_at ?? null;
  {
    const { data: lastCust } = await db
      .from('inquiry_replies')
      .select('created_at')
      .eq('inquiry_id', draft.inquiry_id)
      .eq('is_admin', false)
      .order('created_at', { ascending: false })
      .limit(1);
    if (lastCust && lastCust[0]?.created_at) customerActiveAt = lastCust[0].created_at;
  }

  // 최종 답변 본문: 요청 본문 > 검수 수정본 > 초안
  let finalReply: string =
    (typeof body.final_reply === 'string' && body.final_reply.trim()) ||
    draft.reviewer_edited_reply ||
    draft.draft_reply ||
    '';
  const wasEdited = finalReply.trim() !== (draft.draft_reply || '').trim();

  await db.from('cs_draft_replies').update({ status: 'executing', updated_at: new Date().toISOString() }).eq('id', id);

  const results: ActionResult[] = [];
  const now = () => new Date().toISOString();
  let issuedCouponCode: string | null = null;

  // 1) 쿠폰 먼저 (코드 → 답변에 치환)
  const couponAction = actions.find((a) => a.type === 'issue_coupon');
  if (couponAction) {
    const claim = await claimAction(db, id, 'issue_coupon', couponAction.params ?? {});
    if (claim.alreadyDone) {
      results.push({ type: 'issue_coupon', status: 'skipped', detail: '이미 발급됨', at: now() });
    } else {
      try {
        const p = couponAction.params ?? {};
        const code = (typeof p.code === 'string' && p.code) || genCouponCode();
        const { error } = await db.from('coupons').insert({
          code,
          display_name: p.label ?? `CS 응대 할인 (${draft.intent ?? ''})`,
          description: 'CS 응대 자동화 발급',
          discount_type: p.discount_type === 'fixed_amount' ? 'fixed_amount' : 'percentage',
          discount_value: Number(p.discount_value ?? 15),
          max_uses: Number(p.max_uses ?? 1),
          current_uses: 0,
          is_active: true,
          expires_at: p.expires_at ?? null,
        });
        if (error) throw new Error(error.message);
        issuedCouponCode = code;
        await finishLog(db, claim.logId, 'done', { code });
        results.push({ type: 'issue_coupon', status: 'done', detail: code, at: now() });
      } catch (e) {
        await finishLog(db, claim.logId, 'failed', { error: String(e) });
        results.push({ type: 'issue_coupon', status: 'failed', detail: String(e), at: now() });
      }
    }
  }
  // 코드 치환 (플레이스홀더 또는 발급된 코드 반영)
  if (issuedCouponCode) {
    finalReply = finalReply.replace(/\{\{\s*COUPON_CODE\s*\}\}/g, issuedCouponCode);
  }

  // 2) 게시판 답변 등록
  if (actions.some((a) => a.type === 'post_reply')) {
    const claim = await claimAction(db, id, 'post_reply', { len: finalReply.length });
    if (claim.alreadyDone) {
      results.push({ type: 'post_reply', status: 'skipped', detail: '이미 등록됨', at: now() });
    } else {
      try {
        const { error } = await db.from('inquiry_replies').insert({
          inquiry_id: draft.inquiry_id,
          admin_id: auth.user.id,
          content: finalReply,
          file_urls: fileUrls,
        });
        if (error) throw new Error(error.message);
        await db.from('inquiries').update({ status: 'ongoing', updated_at: now() }).eq('id', draft.inquiry_id);
        await finishLog(db, claim.logId, 'done', { ok: true });
        results.push({ type: 'post_reply', status: 'done', at: now() });
      } catch (e) {
        await finishLog(db, claim.logId, 'failed', { error: String(e) });
        results.push({ type: 'post_reply', status: 'failed', detail: String(e), at: now() });
      }
    }
  }

  // 3) 이메일 발송 (이메일 보유 시)
  if (actions.some((a) => a.type === 'send_email')) {
    const claim = await claimAction(db, id, 'send_email', { to: inquiry?.email ?? null });
    if (claim.alreadyDone) {
      results.push({ type: 'send_email', status: 'skipped', detail: '이미 발송됨', at: now() });
    } else if (!inquiry?.email) {
      // 이메일이 없으면 실패가 아니라 건너뜀(게시판/카카오로 안내). 드래프트를 failed로 만들지 않음.
      await finishLog(db, claim.logId, 'skipped', { reason: 'no_email' });
      results.push({ type: 'send_email', status: 'skipped', detail: '고객 이메일 없음', at: now() });
    } else {
      try {
        const inquiryUrl = `${SITE_URL}/inquiries/${draft.inquiry_id}`;
        // 야간(KST 09~21시 외)이면 즉시 발송하지 않고 큐에 적재 → 다음 09:00 KST에 발송.
        const outcome = await sendOrQueueCsEmail({
          draftId: id,
          to: inquiry.email,
          subject: '[모두의 유니폼] 문의 답변드립니다',
          text: finalReply,
          html: buildEmailHtml(finalReply, inquiryUrl),
          customerActiveAt,
        });
        if (outcome === 'failed') throw new Error('gmail_send_failed');
        await finishLog(db, claim.logId, outcome === 'queued' ? 'skipped' : 'done', { to: inquiry.email, outcome });
        results.push({
          type: 'send_email',
          status: outcome === 'queued' ? 'skipped' : 'done',
          detail: outcome === 'queued' ? `${inquiry.email} (오전 9시 발송 예약)` : inquiry.email,
          at: now(),
        });
      } catch (e) {
        await finishLog(db, claim.logId, 'failed', { error: String(e) });
        results.push({ type: 'send_email', status: 'failed', detail: String(e), at: now() });
      }
    }
  }

  const anyFailed = results.some((r) => r.status === 'failed');
  const finalStatus = anyFailed ? 'failed' : 'done';
  await db
    .from('cs_draft_replies')
    .update({
      status: finalStatus,
      reviewer_edited_reply: wasEdited ? finalReply : null,
      approved_actions: actions,
      executed_actions: results,
      reviewed_by: auth.user.id,
      reviewed_at: now(),
      executed_at: now(),
      updated_at: now(),
    })
    .eq('id', id);

  // 학습 피드백 적재 (승인/수정)
  await db.from('cs_feedback').insert({
    draft_id: id,
    inquiry_id: draft.inquiry_id,
    intent: draft.intent,
    original_draft: draft.draft_reply,
    final_sent: finalReply,
    verdict: wasEdited ? 'edited' : 'approved_clean',
    reviewer_note: typeof body.reviewer_note === 'string' ? body.reviewer_note : null,
    proposed_actions_before: draft.proposed_actions ?? null,
    approved_actions_after: actions,
  });

  return NextResponse.json({ data: { status: finalStatus, results, coupon_code: issuedCouponCode } });
}
