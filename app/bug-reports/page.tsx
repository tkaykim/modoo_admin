'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, ExternalLink, Mail, CheckCircle2, X } from 'lucide-react';

type Status = 'open' | 'in_progress' | 'resolved' | 'improvement' | 'not_a_bug' | 'wont_fix';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface BugReport {
  id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_role: string | null;
  title: string;
  description: string;
  severity: Severity;
  page_url: string | null;
  status: Status;
  resolution_note: string | null;
  resolved_at: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  open: { label: '미처리', cls: 'bg-red-100 text-red-700 border-red-200' },
  in_progress: { label: '처리중', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  resolved: { label: '완료', cls: 'bg-green-100 text-green-700 border-green-200' },
  improvement: { label: '개선요청', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  not_a_bug: { label: '오인·정상', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  wont_fix: { label: '보류', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const SEVERITY_META: Record<Severity, { label: string; cls: string }> = {
  low: { label: '낮음', cls: 'bg-gray-100 text-gray-600' },
  medium: { label: '보통', cls: 'bg-amber-100 text-amber-700' },
  high: { label: '높음', cls: 'bg-orange-100 text-orange-700' },
  critical: { label: '심각', cls: 'bg-red-100 text-red-700' },
};

const TABS: { key: 'all' | Status; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'open', label: '미처리' },
  { key: 'in_progress', label: '처리중' },
  { key: 'resolved', label: '완료' },
  { key: 'improvement', label: '개선요청' },
  { key: 'not_a_bug', label: '오인·정상' },
  { key: 'wont_fix', label: '보류' },
];

function fmt(dt: string): string {
  try {
    return new Date(dt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return dt;
  }
}

export default function BugReportsPage() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | Status>('all');
  const [selected, setSelected] = useState<BugReport | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/bug-reports', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || '목록을 불러오지 못했습니다.');
        return;
      }
      setReports(body.reports as BugReport[]);
    } catch (err) {
      setError(`네트워크 오류: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reports.length };
    for (const r of reports) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [reports]);

  const filtered = useMemo(
    () => (tab === 'all' ? reports : reports.filter((r) => r.status === tab)),
    [reports, tab]
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-5 h-5 text-red-600" />
        <h2 className="text-lg font-bold text-gray-900">고장신고 내역</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        관리자가 접수한 고장신고를 확인하고 처리 상태를 관리합니다. 처리 결과는 신고자에게 이메일로 알릴 수 있습니다.
      </p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              tab === t.key
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 ${tab === t.key ? 'text-gray-300' : 'text-gray-400'}`}>
              {counts[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-500 text-center py-16 border border-dashed border-gray-200 rounded-lg">
          해당 상태의 신고가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${STATUS_META[r.status].cls}`}>
                      {STATUS_META[r.status].label}
                    </span>
                    <span className={`px-2 py-0.5 text-[11px] font-medium rounded ${SEVERITY_META[r.severity].cls}`}>
                      {SEVERITY_META[r.severity].label}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 truncate">{r.title}</span>
                  </div>
                  <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed mb-2">{r.description}</p>
                  <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-400">
                    <span>신고자: {r.reporter_name ?? '-'} {r.reporter_email ? `<${r.reporter_email}>` : ''}</span>
                    <span>· {fmt(r.created_at)}</span>
                    {r.page_url && (
                      <a
                        href={r.page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-blue-500 hover:text-blue-700"
                      >
                        <ExternalLink className="w-3 h-3" />
                        페이지
                      </a>
                    )}
                    {r.notified_at && (
                      <span className="inline-flex items-center gap-0.5 text-green-600">
                        <Mail className="w-3 h-3" />
                        신고자 통지됨
                      </span>
                    )}
                  </div>
                  {r.resolution_note && (
                    <div className="mt-2 text-[12px] bg-gray-50 border-l-2 border-gray-300 px-3 py-2 rounded-r">
                      <span className="font-semibold text-gray-500">처리 내용: </span>
                      <span className="text-gray-700 whitespace-pre-wrap">{r.resolution_note}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelected(r)}
                  className="shrink-0 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                >
                  처리
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <ResolveModal
          report={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ResolveModal({
  report,
  onClose,
  onSaved,
}: {
  report: BugReport;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<Status>(report.status);
  const [note, setNote] = useState(report.resolution_note ?? '');
  const [notify, setNotify] = useState(!!report.reporter_email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/bug-reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolutionNote: note.trim(), notify }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || '저장에 실패했습니다.');
        return;
      }
      if (notify && !body.notified) {
        // 저장은 됐지만 알림 메일만 실패
        setResult(`저장되었습니다. (알림 메일 실패: ${body.notifyError || '알 수 없음'})`);
        setTimeout(onSaved, 1400);
        return;
      }
      onSaved();
    } catch (err) {
      setError(`네트워크 오류: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">신고 처리</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="text-sm font-semibold text-gray-800">{report.title}</div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">처리 상태</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(STATUS_META) as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-2 py-1.5 text-xs font-medium rounded-md border transition-all ${
                    status === s ? `${STATUS_META[s].cls} ring-2 ring-offset-1 ring-current` : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              처리 내용 <span className="text-gray-400 font-normal">(신고자에게 그대로 전달됩니다)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="어떻게 처리했는지 신고자가 이해할 수 있게 적어주세요."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none"
            />
          </div>

          <label className={`flex items-center gap-2 text-sm ${report.reporter_email ? 'text-gray-700' : 'text-gray-400'}`}>
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              disabled={!report.reporter_email}
              className="w-4 h-4"
            />
            신고자에게 이메일로 처리 결과 알림
            {report.reporter_email ? (
              <span className="text-xs text-gray-400">({report.reporter_email})</span>
            ) : (
              <span className="text-xs text-gray-400">(이메일 없음)</span>
            )}
          </label>

          {notify && !note.trim() && (
            <p className="text-[11px] text-amber-600">처리 내용을 입력해야 알림 메일이 발송됩니다.</p>
          )}

          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          {result && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {result}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 inline-flex items-center gap-2 min-w-[90px] justify-center"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
