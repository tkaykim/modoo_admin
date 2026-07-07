import { sendGmailEmail, type GmailAttachment } from '@/lib/gmail';

const RECIPIENT = process.env.BUG_REPORT_TO || 'modoo.contact@gmail.com';

export interface BugReportInput {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pageUrl?: string;
  reporterName?: string;
  reporterEmail?: string;
  reporterRole?: string;
  userAgent?: string;
  screenshotDataUrl?: string; // data:image/png;base64,...
  context?: Record<string, unknown>;
}

const SEVERITY_LABEL: Record<BugReportInput['severity'], { label: string; color: string }> = {
  low: { label: '낮음 (불편)', color: '#6c757d' },
  medium: { label: '보통 (기능 일부 동작 안 함)', color: '#f39c12' },
  high: { label: '높음 (업무 진행 불가)', color: '#e67e22' },
  critical: { label: '심각 (서비스 장애)', color: '#c0392b' },
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; filename: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = contentType.split('/')[1]?.replace('+xml', '') || 'png';
  return { buffer, contentType, filename: `screenshot-${Date.now()}.${ext}` };
}

function buildHtml(report: BugReportInput): string {
  const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const sev = SEVERITY_LABEL[report.severity];
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 12px;color:#666;width:120px;vertical-align:top;background:#f8f9fa;font-weight:600;">${label}</td><td style="padding:8px 12px;font-size:13px;word-break:break-all;">${escapeHtml(value)}</td></tr>`;

  return `
    <div style="max-width:680px;margin:0 auto;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#222;">
      <div style="background:${sev.color};padding:20px 24px;">
        <h1 style="color:#fff;margin:0;font-size:20px;">🛠 관리자 버그 리포트</h1>
        <p style="color:#fff;margin:6px 0 0;font-size:13px;opacity:0.92;">
          <span style="background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:4px;font-size:12px;font-weight:600;">${sev.label}</span>
          &nbsp;&nbsp;${ts} KST
        </p>
      </div>
      <div style="padding:20px 24px;">
        <div style="background:#fff8e1;border-left:4px solid ${sev.color};padding:14px 16px;margin-bottom:18px;">
          <div style="font-weight:600;font-size:15px;margin-bottom:6px;">${escapeHtml(report.title)}</div>
          <div style="font-size:13px;white-space:pre-wrap;line-height:1.6;">${escapeHtml(report.description)}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #eee;border-radius:6px;overflow:hidden;">
          ${row('신고자', `${report.reporterName ?? '익명'} ${report.reporterEmail ? `<${report.reporterEmail}>` : ''} ${report.reporterRole ? `[${report.reporterRole}]` : ''}`)}
          ${row('페이지 URL', report.pageUrl ?? '-')}
          ${row('브라우저', report.userAgent ?? '-')}
        </table>
        ${
          report.screenshotDataUrl
            ? `<div style="margin-top:18px;"><div style="font-weight:600;font-size:13px;color:#555;margin-bottom:8px;">첨부 스크린샷</div><img src="cid:bug-screenshot" alt="screenshot" style="max-width:100%;border:1px solid #ddd;border-radius:6px;"/></div>`
            : ''
        }
        ${
          report.context && Object.keys(report.context).length > 0
            ? `<details style="margin-top:14px;"><summary style="cursor:pointer;font-weight:600;color:#555;">추가 컨텍스트</summary><pre style="background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto;font-size:11px;">${escapeHtml(JSON.stringify(report.context, null, 2).slice(0, 4000))}</pre></details>`
            : ''
        }
      </div>
      <div style="background:#f8f9fa;padding:14px 24px;text-align:center;font-size:11px;color:#999;">
        모두의 유니폼 관리자 패널에서 신고된 버그 리포트입니다.
      </div>
    </div>
  `;
}

function buildText(report: BugReportInput): string {
  const ts = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  return [
    `[모두의유니폼 관리자] 🛠 버그 리포트 — ${report.title}`,
    `심각도: ${SEVERITY_LABEL[report.severity].label}`,
    `발생시각: ${ts} KST`,
    `신고자: ${report.reporterName ?? '익명'} ${report.reporterEmail ?? ''} ${report.reporterRole ? `[${report.reporterRole}]` : ''}`,
    `페이지: ${report.pageUrl ?? '-'}`,
    `User Agent: ${report.userAgent ?? '-'}`,
    '',
    '--- 내용 ---',
    report.description,
  ]
    .filter(Boolean)
    .join('\n');
}

// ── 신고자 회신(처리 결과 알림) ──────────────────────────────────────────
export type BugReportStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'improvement'
  | 'not_a_bug'
  | 'wont_fix';

const STATUS_REPLY: Record<BugReportStatus, { label: string; color: string }> = {
  open: { label: '접수됨', color: '#6c757d' },
  in_progress: { label: '처리 중', color: '#f39c12' },
  resolved: { label: '개선 완료', color: '#27ae60' },
  improvement: { label: '개선 예정으로 접수', color: '#2980b9' },
  not_a_bug: { label: '정상 동작 안내', color: '#8e44ad' },
  wont_fix: { label: '보류', color: '#7f8c8d' },
};

export interface BugReportResolvedInput {
  title: string;
  status: BugReportStatus;
  resolutionNote: string;
  reporterName?: string;
  reporterEmail: string;
}

export async function sendBugReportResolvedMail(
  input: BugReportResolvedInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const st = STATUS_REPLY[input.status] ?? STATUS_REPLY.resolved;
    const greetingName = input.reporterName ? `${input.reporterName}님,` : '안녕하세요,';

    const text = [
      `${greetingName}`,
      '',
      `신고해주신 "${input.title}" 건의 처리 결과를 알려드립니다.`,
      `처리 상태: ${st.label}`,
      '',
      '[처리 내용]',
      input.resolutionNote,
      '',
      '신고해주셔서 감사합니다.',
      '추가로 이상이 있으시면 언제든 다시 신고해주세요.',
      '',
      '모두의 유니폼 개발팀 드림',
    ].join('\n');

    const noteHtml = escapeHtml(input.resolutionNote).replace(/\n/g, '<br>');
    const html = `
      <div style="max-width:600px;margin:0 auto;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#222;">
        <div style="background:${st.color};padding:18px 24px;">
          <h1 style="color:#fff;margin:0;font-size:18px;">고장신고 처리 결과 안내</h1>
          <p style="color:#fff;margin:6px 0 0;font-size:13px;opacity:0.92;">
            <span style="background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:4px;font-size:12px;font-weight:600;">${st.label}</span>
          </p>
        </div>
        <div style="padding:20px 24px;font-size:14px;line-height:1.7;">
          <p style="margin:0 0 12px;">${escapeHtml(greetingName)}</p>
          <p style="margin:0 0 12px;">신고해주신 <strong>"${escapeHtml(input.title)}"</strong> 건의 처리 결과를 알려드립니다.</p>
          <div style="background:#f8f9fa;border-left:4px solid ${st.color};padding:14px 16px;margin:14px 0;">
            <div style="font-weight:600;font-size:13px;color:#555;margin-bottom:6px;">처리 내용</div>
            <div style="font-size:13px;">${noteHtml}</div>
          </div>
          <p style="margin:12px 0 0;">신고해주셔서 감사합니다.<br>추가로 이상이 있으시면 언제든 다시 신고해주세요.</p>
        </div>
        <div style="background:#f8f9fa;padding:14px 24px;font-size:12px;color:#999;">모두의 유니폼 개발팀 드림</div>
      </div>
    `;

    const ok = await sendGmailEmail({
      to: [{ email: input.reporterEmail }],
      subject: `[모두의유니폼] 신고하신 "${input.title.slice(0, 60)}" 처리 결과 (${st.label})`,
      text,
      html,
    });
    return { ok };
  } catch (err) {
    console.error('[bug-report-resolved-mail] failed:', err);
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendBugReport(report: BugReportInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const attachments: GmailAttachment[] = [];
    if (report.screenshotDataUrl) {
      const parsed = parseDataUrl(report.screenshotDataUrl);
      if (parsed) {
        attachments.push({
          filename: parsed.filename,
          content: parsed.buffer,
          contentType: parsed.contentType,
          cid: 'bug-screenshot',
          contentDisposition: 'inline',
        });
      }
    }

    const sev = SEVERITY_LABEL[report.severity];
    const ok = await sendGmailEmail({
      to: [{ email: RECIPIENT }],
      subject: `[모두의유니폼 관리자] [${sev.label}] ${report.title.slice(0, 80)}`,
      text: buildText(report),
      html: buildHtml(report),
      attachments,
    });
    return { ok };
  } catch (err) {
    console.error('[bug-report-mail] failed:', err);
    return { ok: false, error: (err as Error).message };
  }
}
