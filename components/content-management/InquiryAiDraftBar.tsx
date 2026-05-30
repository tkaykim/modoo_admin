'use client';

import { useState } from 'react';
import { Check, X, Sparkles, AlertTriangle } from 'lucide-react';
import ReplyAttacher from './ReplyAttacher';

interface ProposedAction {
  type: 'post_reply' | 'send_email' | 'issue_coupon';
  params?: { discount_type?: string; discount_value?: number; expires_at?: string; label?: string; max_uses?: number };
  rationale?: string;
  default_on?: boolean;
}
export interface CsDraft {
  id: string;
  intent: string | null;
  confidence: number | null;
  flags: { needs_human?: boolean; reasons?: string[] } | null;
  proposed_actions: ProposedAction[];
  inquiry?: { email?: string | null } | null;
}

interface Props {
  draft: CsDraft;
  /** 현재 답변창(textarea)에 들어있는 본문 — 발행 시 이 내용을 사용 */
  replyText: string;
  /** 발행/반려 완료 후 목록 갱신 콜백 */
  onDone: () => void;
}

const ACTION_LABEL: Record<string, string> = {
  post_reply: '게시판 답변 등록',
  send_email: '이메일 발송',
  issue_coupon: '쿠폰 발급',
};

export default function InquiryAiDraftBar({ draft, replyText, onDone }: Props) {
  const hasEmail = Boolean(draft.inquiry?.email);
  const actions = draft.proposed_actions || [];
  const couponAction = actions.find((a) => a.type === 'issue_coupon');

  const [checked, setChecked] = useState<Set<string>>(
    new Set(
      actions
        .filter((a) => a.default_on !== false)
        .filter((a) => !(a.type === 'send_email' && !hasEmail))
        .map((a) => a.type)
    )
  );
  const [couponValue, setCouponValue] = useState<number>(Number(couponAction?.params?.discount_value ?? 15));
  const [couponExpiry, setCouponExpiry] = useState<string>((couponAction?.params?.expires_at ?? '').slice(0, 10));
  const [note, setNote] = useState('');
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState<'' | 'publish' | 'reject'>('');
  const [err, setErr] = useState<string | null>(null);

  const toggle = (t: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  const publish = async () => {
    setErr(null);
    if (!replyText.trim()) {
      setErr('답변 내용이 비어 있습니다.');
      return;
    }
    const payloadActions: ProposedAction[] = [];
    for (const a of actions) {
      if (!checked.has(a.type)) continue;
      if (a.type === 'send_email' && !hasEmail) continue;
      if (a.type === 'issue_coupon') {
        payloadActions.push({
          type: 'issue_coupon',
          params: {
            discount_type: a.params?.discount_type ?? 'percentage',
            discount_value: couponValue,
            expires_at: couponExpiry ? `${couponExpiry}T14:59:00+00` : undefined,
            label: a.params?.label,
            max_uses: a.params?.max_uses ?? 1,
          },
        });
      } else {
        payloadActions.push({ type: a.type });
      }
    }
    if (payloadActions.length === 0) {
      setErr('실행할 액션을 1개 이상 선택하세요.');
      return;
    }
    setBusy('publish');
    try {
      const res = await fetch('/api/admin/cs/drafts/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, final_reply: replyText, actions: payloadActions, reviewer_note: note, file_urls: fileUrls }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '발행 실패');
      const failed = (json?.data?.results || []).filter((r: any) => r.status === 'failed');
      if (failed.length) setErr(`일부 실패: ${failed.map((f: any) => `${f.type}(${f.detail})`).join(', ')}`);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '발행 실패');
    } finally {
      setBusy('');
    }
  };

  const reject = async () => {
    setErr(null);
    setBusy('reject');
    try {
      const res = await fetch('/api/admin/cs/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, action: 'reject', reviewer_note: note }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || '반려 실패');
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '반려 실패');
    } finally {
      setBusy('');
    }
  };

  const conf = draft.confidence != null ? Math.round(draft.confidence * 100) : null;

  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700">
          <Sparkles className="w-3.5 h-3.5" /> AI 초안 · 검수 후 발행
        </span>
        {draft.intent && <span className="text-xs text-indigo-600">{draft.intent}</span>}
        {conf != null && (
          <span className={`text-xs font-medium ${conf >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>신뢰도 {conf}%</span>
        )}
        {draft.flags?.needs_human && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
            <AlertTriangle className="w-3 h-3" /> 검토 필요
          </span>
        )}
        <span className="text-xs text-gray-500">— 위 답변창 내용이 그대로 발행됩니다(수정 가능)</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {actions.map((a) => {
          const disabled = a.type === 'send_email' && !hasEmail;
          return (
            <label key={a.type} className={`flex items-center gap-2 text-sm ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
              <input
                type="checkbox"
                checked={checked.has(a.type) && !disabled}
                disabled={disabled}
                onChange={() => toggle(a.type)}
                className="rounded border-gray-300"
              />
              {ACTION_LABEL[a.type] ?? a.type}
              {disabled && <span className="text-xs">(이메일 없음 — 게시판/카카오로 안내)</span>}
            </label>
          );
        })}
        {couponAction && checked.has('issue_coupon') && (
          <div className="flex items-center gap-2 text-sm text-gray-600 pl-6 flex-wrap">
            할인율
            <input type="number" value={couponValue} onChange={(e) => setCouponValue(Number(e.target.value) || 0)} className="w-16 px-2 py-1 border border-gray-300 rounded" />
            % · 만료
            <input type="date" value={couponExpiry} onChange={(e) => setCouponExpiry(e.target.value)} className="px-2 py-1 border border-gray-300 rounded" />
            <span className="text-xs text-gray-400">코드 자동 생성 → 본문 {'{{COUPON_CODE}}'} 치환</span>
          </div>
        )}
      </div>

      <ReplyAttacher urls={fileUrls} onChange={setFileUrls} disabled={busy !== ''} />

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="검수 메모(수정/반려 사유) — 학습에 반영"
        className="w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm"
      />

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex items-center justify-end gap-2">
        <button onClick={reject} disabled={busy !== ''} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50">
          <X className="w-4 h-4" /> 초안 반려
        </button>
        <button onClick={publish} disabled={busy !== ''} className="inline-flex items-center gap-1 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
          <Check className="w-4 h-4" /> {busy === 'publish' ? '발행 중...' : 'AI 초안 발행'}
        </button>
      </div>
    </div>
  );
}
