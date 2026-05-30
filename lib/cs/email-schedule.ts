import { createAdminClient } from '@/lib/supabase-admin';
import { sendGmailEmail } from '@/lib/gmail';

// 발송 허용 시간대: KST 09:00 ~ 21:00. 그 외(새벽·밤)는 큐로 보류.
const SEND_START_HOUR = 9;
const SEND_END_HOUR = 21;
// 야간 예외: 고객이 최근 이 시간(분) 내에 문의/답글을 남겼다면 "깨어있는" 것으로 보고 즉시 발송.
const RECENT_ACTIVE_MINUTES = 60;

function kstHour(): number {
  return new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
}

export function isWithinSendHours(): boolean {
  const h = kstHour();
  return h >= SEND_START_HOUR && h < SEND_END_HOUR;
}

/** 고객이 최근(RECENT_ACTIVE_MINUTES) 활동했는지 — 야간 즉시발송 예외 판단. */
export function isCustomerRecentlyActive(customerActiveAt?: string | null): boolean {
  if (!customerActiveAt) return false;
  const t = Date.parse(customerActiveAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= RECENT_ACTIVE_MINUTES * 60 * 1000;
}

/** 다음 발송 가능 시각(09:00 KST)을 UTC ISO로 반환. 새벽이면 오늘 09시, 저녁/밤이면 내일 09시. */
export function nextSendAtIso(): string {
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  let ms9 = Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate(), SEND_START_HOUR, 0, 0);
  if (nowKst.getUTCHours() >= SEND_END_HOUR) ms9 += 24 * 3600 * 1000; // 저녁/밤 → 내일 09시
  return new Date(ms9 - 9 * 3600 * 1000).toISOString(); // KST 09:00을 UTC로 환산
}

interface CsEmail {
  draftId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** 고객 최근 활동 시각(문의 접수/답글). 야간이라도 최근이면 즉시 발송. */
  customerActiveAt?: string | null;
}

/**
 * CS 답변 메일 발송. 발송 허용 시간대(또는 고객이 방금 활동했으면)면 즉시 발송,
 * 아니면 큐에 적재(다음 09시 발송). 반환: 'sent' | 'queued' | 'failed'
 */
export async function sendOrQueueCsEmail(email: CsEmail): Promise<'sent' | 'queued' | 'failed'> {
  if (isWithinSendHours() || isCustomerRecentlyActive(email.customerActiveAt)) {
    const ok = await sendGmailEmail({
      to: [{ email: email.to }],
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return ok ? 'sent' : 'failed';
  }
  // 야간 → 큐 적재
  const db = createAdminClient();
  const { error } = await db.from('cs_email_queue').insert({
    draft_id: email.draftId,
    to_email: email.to,
    subject: email.subject,
    html: email.html,
    body_text: email.text,
    scheduled_for: nextSendAtIso(),
  });
  return error ? 'failed' : 'queued';
}

/** 큐에 적재된 발송 대기 메일을 일괄 발송. cron(09:00 KST)에서 호출. */
export async function flushCsEmailQueue(): Promise<{ picked: number; sent: number; failed: number }> {
  const db = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: rows } = await db
    .from('cs_email_queue')
    .select('id, to_email, subject, html, body_text, attempts')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .limit(100);

  let sent = 0;
  let failed = 0;
  for (const r of rows ?? []) {
    const ok = await sendGmailEmail({
      to: [{ email: r.to_email }],
      subject: r.subject,
      text: r.body_text,
      html: r.html,
    });
    if (ok) {
      await db.from('cs_email_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', r.id);
      sent += 1;
    } else {
      const attempts = (r.attempts ?? 0) + 1;
      await db
        .from('cs_email_queue')
        .update({ status: attempts >= 3 ? 'failed' : 'pending', attempts, last_error: 'gmail_send_failed' })
        .eq('id', r.id);
      failed += 1;
    }
  }
  return { picked: rows?.length ?? 0, sent, failed };
}
