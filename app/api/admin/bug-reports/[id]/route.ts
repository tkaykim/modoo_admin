import { NextRequest, NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendBugReportResolvedMail, type BugReportStatus } from '@/lib/notifications/bug-report-mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUS: BugReportStatus[] = [
  'open',
  'in_progress',
  'resolved',
  'improvement',
  'not_a_bug',
  'wont_fix',
];

// "종료" 상태(처리 완료 시각을 찍는 상태)
const TERMINAL: BugReportStatus[] = ['resolved', 'not_a_bug', 'wont_fix'];

// 관리자 고장신고 처리(상태 변경 + 선택적 신고자 알림)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !isAdminLike(profile.role)) {
    return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { status?: string; resolutionNote?: string; notify?: boolean }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const status = body.status as BugReportStatus | undefined;
  if (!status || !VALID_STATUS.includes(status)) {
    return NextResponse.json({ ok: false, error: '유효하지 않은 상태입니다.' }, { status: 400 });
  }
  const resolutionNote =
    typeof body.resolutionNote === 'string' ? body.resolutionNote.slice(0, 5000).trim() : '';

  const admin = createAdminClient();

  // 현재 신고 조회(알림 대상·제목 확보)
  const { data: report, error: fetchErr } = await admin
    .from('admin_bug_reports')
    .select('id, title, reporter_email, reporter_name')
    .eq('id', id)
    .single();

  if (fetchErr || !report) {
    return NextResponse.json({ ok: false, error: '신고를 찾을 수 없습니다.' }, { status: 404 });
  }

  const patch: Record<string, unknown> = {
    status,
    resolution_note: resolutionNote || null,
    updated_at: new Date().toISOString(),
  };
  if (TERMINAL.includes(status)) {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = user.id;
  } else {
    patch.resolved_at = null;
    patch.resolved_by = null;
  }

  // 신고자 알림(선택) — 처리메모가 있고, notify=true이며, 이메일이 있을 때만
  let notified = false;
  let notifyError: string | undefined;
  if (body.notify && resolutionNote && report.reporter_email) {
    const mail = await sendBugReportResolvedMail({
      title: report.title,
      status,
      resolutionNote,
      reporterName: report.reporter_name ?? undefined,
      reporterEmail: report.reporter_email,
    });
    notified = mail.ok;
    if (!mail.ok) notifyError = mail.error;
    if (mail.ok) patch.notified_at = new Date().toISOString();
  }

  const { error: updErr } = await admin.from('admin_bug_reports').update(patch).eq('id', id);
  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, notified, notifyError });
}
