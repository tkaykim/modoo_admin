import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
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
  // 영문 대문자+숫자 5자리. 혼동 문자(I, O, 0, 1) 제외해 수기 입력 오류 방지.
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32자
  const bytes = randomBytes(5);
  let code = '';
  for (let i = 0; i < 5; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// 이메일 추적(Track A): 링크는 click 추적으로 래핑하고, 본문 끝에 open 추적 픽셀을 심는다.
const TRACK_BASE = `${SITE_URL}/api/email`;
function trackClick(messageId: string, url: string): string {
  return `${TRACK_BASE}/click?m=${messageId}&u=${encodeURIComponent(url)}`;
}

interface EmailOrderCard { payUrl: string; productTitle: string | null; thumbnailUrl: string | null; unitPrice: number; }

// 연결된 (결제 가능한) 주문을 이메일 본문에 카드로 렌더. 버튼 클릭 시 주문 결제 페이지로 이동.
function buildOrderCardsHtml(orders: EmailOrderCard[], messageId: string): string {
  if (!orders.length) return '';
  const cards = orders.map((o) => {
    const payHref = trackClick(messageId, o.payUrl);
    const img = o.thumbnailUrl
      ? `<tr><td style="padding:10px 10px 0;"><img src="${o.thumbnailUrl}" width="100%" style="display:block;width:100%;border-radius:8px;" alt="시안" /></td></tr>`
      : '';
    const title = escapeHtml(o.productTitle || '주문');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:12px;overflow:hidden;margin-bottom:12px;background:#fff;">
${img}
<tr><td style="padding:10px 14px 2px;font-size:14px;font-weight:600;color:#333;">${title}</td></tr>
<tr><td style="padding:0 14px 8px;font-size:13px;color:#666;">장당 ${o.unitPrice.toLocaleString('ko-KR')}원 · 사이즈별 수량 선택 후 결제</td></tr>
<tr><td style="padding:0 14px 14px;"><a href="${payHref}" style="display:block;background:${BRAND};color:#fff;text-align:center;padding:13px 0;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">바로 결제하기</a></td></tr>
</table>`;
  }).join('');
  return `<tr><td style="padding:4px 32px 4px;"><p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#333;">시안 · 결제</p>${cards}</td></tr>`;
}

// 첨부된 이미지 파일을 메일 본문에 인라인으로 렌더 (이미지 확장자만; 비이미지 첨부는 게시판에서 확인).
function buildAttachmentsHtml(fileUrls: string[]): string {
  const imgs = (fileUrls || []).filter(
    (u) => typeof u === 'string' && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(u),
  );
  if (!imgs.length) return '';
  const rows = imgs
    .map(
      (u) =>
        `<tr><td style="padding:6px 32px 0;"><img src="${u}" alt="첨부 이미지" style="display:block;width:100%;max-width:536px;border-radius:8px;border:1px solid #eee;" /></td></tr>`,
    )
    .join('');
  return rows;
}

function buildEmailHtml(replyText: string, inquiryUrl: string, messageId: string, orderCardsHtml = '', fileUrls: string[] = []): string {
  const body = escapeHtml(replyText).replace(/\n/g, '<br>');
  const attachmentsHtml = buildAttachmentsHtml(fileUrls);
  const inquiryHref = trackClick(messageId, inquiryUrl);
  const kakaoHref = trackClick(messageId, KAKAO_URL);
  const pixel = `<img src="${TRACK_BASE}/open?m=${messageId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;overflow:hidden;" />`;
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<tr><td style="background:${BRAND};padding:24px 32px;text-align:center;"><img src="${LOGO_URL}" alt="모두의 유니폼" width="132" style="display:inline-block;max-width:132px;height:auto;"></td></tr>
<tr><td style="padding:32px 32px 8px;font-size:15px;line-height:1.75;color:#333;">${body}</td></tr>
${attachmentsHtml}
${orderCardsHtml}
<tr><td style="padding:8px 32px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding-bottom:12px;"><a href="${inquiryHref}" style="display:inline-block;background:${BRAND};color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:15px 0;width:100%;max-width:480px;border-radius:10px;text-align:center;">문의 게시판에서 답변하기</a></td></tr>
<tr><td align="center"><a href="${kakaoHref}" style="display:inline-block;background:#FEE500;color:#191600;font-size:15px;font-weight:700;text-decoration:none;padding:15px 0;width:100%;max-width:480px;border-radius:10px;text-align:center;">카카오톡으로 상담하기</a></td></tr>
</table></td></tr>
<tr><td style="padding:24px 32px 28px;border-top:1px solid #eee;text-align:center;">
<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${BRAND};">모두의 유니폼</p>
<p style="margin:0;font-size:12px;color:#aaa;">단체 유니폼·굿즈 제작 · <a href="${SITE_URL}" style="color:#aaa;">modoouniform.com</a></p>
</td></tr></table></td></tr></table>${pixel}</body></html>`;
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
  // 코드 치환 (플레이스홀더 또는 발급된 코드 반영). 대소문자 무시로 변형 토큰도 흡수.
  if (issuedCouponCode) {
    finalReply = finalReply.replace(/\{\{\s*COUPON_CODE\s*\}\}/gi, issuedCouponCode);
  }

  // 안전 가드: 쿠폰 자리표시자가 남아있으면(=쿠폰 미발급인데 본문엔 쿠폰 문구가 남음) 게시/발송 전면 차단.
  // 검수자가 issue_coupon을 끄고 쿠폰 문구는 지우지 않은 경우 {{COUPON_CODE}}가 고객에게 그대로 나가는 사고 방지.
  // 이 시점에 토큰이 남아있다는 건 issuedCouponCode가 비었다는 뜻 → 발급된 쿠폰도 없으므로 안전하게 검수 대기로 되돌린다.
  if (/\{\{\s*COUPON_CODE\s*\}\}/i.test(finalReply)) {
    await db
      .from('cs_draft_replies')
      .update({ status: 'pending_review', updated_at: now() })
      .eq('id', id);
    return NextResponse.json(
      {
        error:
          '답변 본문에 미발급 쿠폰 자리표시자 {{COUPON_CODE}}가 남아 있습니다. 쿠폰 발급을 함께 실행하거나, 본문에서 쿠폰 문구를 제거한 뒤 다시 시도하세요.',
      },
      { status: 400 },
    );
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
        // 추적(Track A): 메일 1통당 고유 messageId. 픽셀/링크에 심어 열람·클릭을 기록.
        const messageId = randomUUID();
        // 연결된 (결제 가능한) 주문을 이메일에 카드로 첨부 — 버튼 클릭 시 결제 페이지로 이동.
        let orderCardsHtml = '';
        try {
          const { data: linkedOrders } = await db
            .from('orders')
            .select('payment_status, payment_link_token, created_at, order_items(product_title, thumbnail_url, price_per_item)')
            .eq('inquiry_id', draft.inquiry_id)
            .not('payment_link_token', 'is', null)
            .neq('payment_status', 'completed')
            .order('created_at', { ascending: true });
          const cards = (linkedOrders ?? []).map((o) => {
            const its = o.order_items as unknown as Array<{ product_title: string | null; thumbnail_url: string | null; price_per_item: number | null }> | null;
            const it = Array.isArray(its) ? its[0] : null;
            return {
              payUrl: `${SITE_URL}/order/custom/${o.payment_link_token}`,
              productTitle: it?.product_title ?? null,
              thumbnailUrl: it?.thumbnail_url ?? null,
              unitPrice: Number(it?.price_per_item) || 0,
            };
          });
          orderCardsHtml = buildOrderCardsHtml(cards, messageId);
        } catch { /* 카드 생성 실패해도 메일 발송은 진행 */ }
        // 야간(KST 09~21시 외)이면 즉시 발송하지 않고 큐에 적재 → 다음 09:00 KST에 발송.
        const outcome = await sendOrQueueCsEmail({
          draftId: id,
          to: inquiry.email,
          subject: '[모두의 유니폼] 문의 답변드립니다',
          text: finalReply,
          html: buildEmailHtml(finalReply, inquiryUrl, messageId, orderCardsHtml, fileUrls),
          customerActiveAt,
        });
        if (outcome === 'failed') throw new Error('gmail_send_failed');
        // 추적 앵커 행: messageId ↔ 문의/수신자 매핑 (open/click 이벤트가 이 행으로 연결됨)
        await db.from('email_events').insert({
          message_id: messageId,
          inquiry_id: draft.inquiry_id,
          draft_id: id,
          to_email: inquiry.email,
          event_type: outcome === 'queued' ? 'queued' : 'sent',
        });
        await finishLog(db, claim.logId, outcome === 'queued' ? 'skipped' : 'done', { to: inquiry.email, outcome, messageId });
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
  const reviewerNote = typeof body.reviewer_note === 'string' ? body.reviewer_note.trim() : '';
  await db.from('cs_feedback').insert({
    draft_id: id,
    inquiry_id: draft.inquiry_id,
    intent: draft.intent,
    original_draft: draft.draft_reply,
    final_sent: finalReply,
    verdict: wasEdited ? 'edited' : 'approved_clean',
    reviewer_note: reviewerNote || null,
    is_pinned: wasEdited,
    learning_rule: wasEdited && reviewerNote ? reviewerNote : null,
    learned_at: wasEdited && reviewerNote ? now() : null,
    learning_version: 1,
    proposed_actions_before: draft.proposed_actions ?? null,
    approved_actions_after: actions,
  });

  return NextResponse.json({ data: { status: finalStatus, results, coupon_code: issuedCouponCode } });
}
