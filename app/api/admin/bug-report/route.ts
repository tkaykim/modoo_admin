import { NextRequest, NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { sendBugReport, type BugReportInput } from '@/lib/notifications/bug-report-mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5MB raw base64 payload limit

export async function POST(req: NextRequest) {
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
    .select('role, name, email')
    .eq('id', user.id)
    .single();

  if (!profile || !isAdminLike(profile.role)) {
    return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Partial<BugReportInput> | null;
  if (!body || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ ok: false, error: '제목을 입력해주세요.' }, { status: 400 });
  }
  if (typeof body.description !== 'string' || !body.description.trim()) {
    return NextResponse.json({ ok: false, error: '증상 설명을 입력해주세요.' }, { status: 400 });
  }

  const severity: BugReportInput['severity'] =
    body.severity === 'low' || body.severity === 'medium' || body.severity === 'high' || body.severity === 'critical'
      ? body.severity
      : 'medium';

  let screenshotDataUrl: string | undefined;
  if (typeof body.screenshotDataUrl === 'string' && body.screenshotDataUrl.startsWith('data:image/')) {
    if (body.screenshotDataUrl.length > MAX_SCREENSHOT_BYTES * 1.4) {
      return NextResponse.json(
        { ok: false, error: '스크린샷이 너무 큽니다 (최대 5MB).' },
        { status: 413 }
      );
    }
    screenshotDataUrl = body.screenshotDataUrl;
  }

  const result = await sendBugReport({
    title: body.title.slice(0, 200),
    description: body.description.slice(0, 5000),
    severity,
    pageUrl: typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 2000) : undefined,
    reporterName: profile.name ?? undefined,
    reporterEmail: profile.email ?? user.email ?? undefined,
    reporterRole: profile.role ?? undefined,
    userAgent:
      typeof body.userAgent === 'string'
        ? body.userAgent.slice(0, 500)
        : req.headers.get('user-agent') ?? undefined,
    screenshotDataUrl,
    context: typeof body.context === 'object' && body.context !== null ? body.context : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || '메일 발송에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
