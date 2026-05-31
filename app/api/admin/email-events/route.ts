import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EmailRow {
  message_id: string;
  inquiry_id: string | null;
  to_email: string | null;
  event_type: string;
  url: string | null;
  created_at: string;
}

interface Summary {
  inquiry_id: string;
  to_email: string | null;
  sent_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  click_count: number;
  status: 'sent' | 'queued' | 'opened' | 'clicked' | 'none';
}

// GET /api/admin/email-events?inquiry_id=<uuid>            → 단일 문의 요약 + 이벤트
// GET /api/admin/email-events?inquiry_ids=<uuid,uuid,...>  → 다건 요약 맵
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const single = url.searchParams.get('inquiry_id');
  const many = url.searchParams.get('inquiry_ids');
  const ids = single
    ? [single]
    : (many ? many.split(',').map((s) => s.trim()).filter(Boolean) : []);
  if (ids.length === 0) return NextResponse.json({ data: {} });

  const db = createAdminClient();

  // 1) 앵커(sent/queued) 행 → message_id ↔ inquiry 매핑. open/click 은 inquiry_id가 없고
  //    message_id 로만 적재되므로, 먼저 앵커로 매핑표를 만든다.
  const { data: anchors, error: aErr } = await db
    .from('email_events')
    .select('message_id, inquiry_id, to_email, event_type, created_at')
    .in('inquiry_id', ids)
    .in('event_type', ['sent', 'queued']);
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const byInquiry: Record<string, Summary> = {};
  for (const id of ids) {
    byInquiry[id] = {
      inquiry_id: id, to_email: null, sent_at: null,
      first_opened_at: null, last_opened_at: null, open_count: 0,
      first_clicked_at: null, click_count: 0, status: 'none',
    };
  }
  const msgToInquiry: Record<string, string> = {};
  for (const a of (anchors ?? []) as EmailRow[]) {
    if (!a.inquiry_id) continue;
    msgToInquiry[a.message_id] = a.inquiry_id;
    const s = byInquiry[a.inquiry_id];
    if (!s) continue;
    if (a.to_email && !s.to_email) s.to_email = a.to_email;
    if (!s.sent_at) s.sent_at = a.created_at;
    if (s.status === 'none') s.status = a.event_type === 'queued' ? 'queued' : 'sent';
  }

  // 2) 그 message_id 들의 모든 이벤트(open/click 포함) 조회
  const messageIds = Object.keys(msgToInquiry);
  let rows: EmailRow[] = [];
  if (messageIds.length > 0) {
    const { data: evts, error: eErr } = await db
      .from('email_events')
      .select('message_id, inquiry_id, to_email, event_type, url, created_at')
      .in('message_id', messageIds)
      .order('created_at', { ascending: true });
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
    rows = (evts ?? []) as EmailRow[];
  }

  // 3) message_id → inquiry 로 매핑해 open/click 집계
  for (const r of rows) {
    const inqId = msgToInquiry[r.message_id];
    const s = inqId ? byInquiry[inqId] : null;
    if (!s) continue;
    if (r.event_type === 'open') {
      s.open_count += 1;
      if (!s.first_opened_at) s.first_opened_at = r.created_at;
      s.last_opened_at = r.created_at;
      if (s.status !== 'clicked') s.status = 'opened';
    } else if (r.event_type === 'click') {
      s.click_count += 1;
      if (!s.first_clicked_at) s.first_clicked_at = r.created_at;
      s.status = 'clicked';
    }
  }

  if (single) {
    return NextResponse.json({ data: byInquiry[single], events: rows });
  }
  return NextResponse.json({ data: byInquiry });
}
