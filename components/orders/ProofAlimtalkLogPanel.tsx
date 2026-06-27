'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, ChevronDown, Clock3, RefreshCw } from 'lucide-react';

type AlimtalkLog = {
  id: number;
  status: string;
  statusText: string;
  phone: string | null;
  templateKey: string | null;
  messageId: string | null;
  error: string | null;
  variables: Record<string, string>;
  messageText: string;
  buttonName: string;
  buttonUrlPreview: string;
  createdAt: string;
};

type ApiResponse = {
  configured?: boolean;
  logs?: AlimtalkLog[];
  error?: string;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClass(status: string): string {
  if (status === 'sent') return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'failed') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'sent') return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5" />;
  return <Clock3 className="w-3.5 h-3.5" />;
}

export default function ProofAlimtalkLogPanel({
  orderId,
  itemId,
}: {
  orderId: string;
  itemId: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [logs, setLogs] = useState<AlimtalkLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const latest = logs[0] ?? null;
  const summary = useMemo(() => {
    if (!loaded) return '내역 보기';
    if (!configured) return '로그 DB 미연결';
    if (logs.length === 0) return '발송 내역 없음';
    const sent = logs.filter((log) => log.status === 'sent').length;
    const failed = logs.filter((log) => log.status === 'failed').length;
    return `성공 ${sent} · 실패 ${failed}`;
  }, [configured, loaded, logs]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/items/${itemId}/alimtalk-logs`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as ApiResponse;
      if (!res.ok) throw new Error(payload?.error || '알림톡 내역을 불러오지 못했습니다.');
      setConfigured(payload.configured !== false);
      setLogs(Array.isArray(payload.logs) ? payload.logs : []);
      if (payload.error) setError(payload.error);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알림톡 내역을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [itemId, orderId]);

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) await loadLogs();
  };

  return (
    <div className="mt-2 rounded-md border border-purple-100 bg-purple-50/30">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void toggleOpen();
        }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-800">
          <Bell className="w-3.5 h-3.5" />
          알림톡 내역
          {latest && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] ${statusClass(latest.status)}`}>
              <StatusIcon status={latest.status} />
              {latest.statusText}
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-purple-700">
          {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : summary}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="border-t border-purple-100 px-3 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-500">시안확인요청 알림톡 발송 결과</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void loadLogs();
              }}
              disabled={loading}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 hover:text-purple-900 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>

          {error && (
            <div className="rounded border border-red-100 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
              {error}
            </div>
          )}

          {!error && !loading && logs.length === 0 && (
            <div className="rounded border border-gray-100 bg-white px-2 py-2 text-[11px] text-gray-500">
              아직 발송 내역이 없습니다.
            </div>
          )}

          {logs.map((log) => (
            <div key={log.id} className="rounded border border-gray-100 bg-white p-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusClass(log.status)}`}>
                  <StatusIcon status={log.status} />
                  {log.statusText}
                </span>
                <span className="text-[11px] text-gray-500">{formatDateTime(log.createdAt)}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-gray-600">
                <div>수신번호: <span className="font-medium text-gray-800">{log.phone || '-'}</span></div>
                <div>템플릿: <span className="font-medium text-gray-800">{log.templateKey || '-'}</span></div>
                {log.messageId && <div className="sm:col-span-2">메시지 ID: <span className="font-mono text-gray-700">{log.messageId}</span></div>}
              </div>

              <div className="rounded bg-gray-50 px-2 py-2">
                <p className="text-[11px] font-semibold text-gray-700 mb-1">발송 내용</p>
                <p className="text-[11px] text-gray-700 whitespace-pre-wrap leading-relaxed">{log.messageText}</p>
                <div className="mt-2 text-[11px] text-gray-600">
                  버튼: <span className="font-medium">{log.buttonName}</span>
                  <span className="mx-1 text-gray-300">·</span>
                  <span className="font-mono break-all">{log.buttonUrlPreview}</span>
                </div>
              </div>

              {Object.keys(log.variables).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(log.variables).map(([key, value]) => (
                    <span key={key} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                      <span className="font-semibold">{key}</span>
                      <span>{value || '-'}</span>
                    </span>
                  ))}
                </div>
              )}

              {log.error && (
                <div className="rounded border border-red-100 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 whitespace-pre-wrap">
                  {log.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
