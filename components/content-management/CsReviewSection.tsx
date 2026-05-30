'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { Check, X, Edit2, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';

// ---- types (local) ----
interface ProposedAction {
  type: 'post_reply' | 'send_email' | 'issue_coupon';
  params?: { discount_type?: string; discount_value?: number; expires_at?: string; label?: string; max_uses?: number };
  rationale?: string;
  default_on?: boolean;
}
interface InquiryMeta {
  id: string;
  title: string | null;
  group_name: string | null;
  manager_name: string | null;
  phone: string | null;
  email: string | null;
  kakao_id: string | null;
  expected_qty: number | null;
  desired_date: string | null;
  status: string | null;
}
interface Draft {
  id: string;
  inquiry_id: string;
  source_type: string;
  intent: string | null;
  customer_summary: string | null;
  draft_reply: string;
  reviewer_edited_reply: string | null;
  proposed_actions: ProposedAction[];
  confidence: number | null;
  flags: { needs_human?: boolean; reasons?: string[] } | null;
  status: string;
  inquiry: InquiryMeta | null;
}
interface FaqCandidate {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  intent: string | null;
  source: string;
  rationale: string | null;
  confidence: number | null;
  suggested_to_consult: boolean;
  suggested_show_in_chatbot: boolean;
  status: string;
}
interface Manual {
  id: string;
  intent: string;
  title: string;
  answer_guide: string;
  action_sop: string;
  policy: Record<string, unknown>;
  source: string;
  status: string;
  updated_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  post_reply: '게시판 답변 등록',
  send_email: '이메일 발송',
  issue_coupon: '쿠폰 발급',
};
const SITE_URL = 'https://modoouniform.com';

// ================= Draft card =================
function DraftCard({ draft, onChanged }: { draft: Draft; onChanged: () => void }) {
  const [reply, setReply] = useState(draft.reviewer_edited_reply ?? draft.draft_reply);
  const hasEmail = Boolean(draft.inquiry?.email);
  const initialChecked = new Set(
    (draft.proposed_actions || [])
      .filter((a) => a.default_on !== false)
      .filter((a) => !(a.type === 'send_email' && !hasEmail)) // 이메일 없으면 기본 해제
      .map((a) => a.type)
  );
  const [checked, setChecked] = useState<Set<string>>(initialChecked);
  const couponAction = (draft.proposed_actions || []).find((a) => a.type === 'issue_coupon');
  const [couponValue, setCouponValue] = useState<number>(Number(couponAction?.params?.discount_value ?? 15));
  const [couponExpiry, setCouponExpiry] = useState<string>(
    (couponAction?.params?.expires_at ?? '').slice(0, 10)
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'' | 'execute' | 'reject'>('');
  const [err, setErr] = useState<string | null>(null);

  const toggle = (t: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  const execute = async () => {
    setErr(null);
    setBusy('execute');
    const actions: ProposedAction[] = [];
    for (const a of draft.proposed_actions || []) {
      if (!checked.has(a.type)) continue;
      if (a.type === 'send_email' && !hasEmail) continue; // 비활성 메일은 실행 제외
      if (a.type === 'issue_coupon') {
        actions.push({
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
        actions.push({ type: a.type });
      }
    }
    if (actions.length === 0) {
      setErr('실행할 액션을 1개 이상 선택하세요.');
      setBusy('');
      return;
    }
    try {
      const res = await fetch('/api/admin/cs/drafts/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, final_reply: reply, actions, reviewer_note: note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '실행 실패');
      const failed = (json?.data?.results || []).filter((r: any) => r.status === 'failed');
      if (failed.length) setErr(`일부 실패: ${failed.map((f: any) => `${f.type}(${f.detail})`).join(', ')}`);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실행 실패');
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
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '반려 실패');
    } finally {
      setBusy('');
    }
  };

  const conf = draft.confidence != null ? Math.round(draft.confidence * 100) : null;
  const needsHuman = draft.flags?.needs_human;

  return (
    <div className="bg-white border border-gray-200/70 rounded-lg shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {draft.intent && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{draft.intent}</span>
          )}
          <span className="text-xs text-gray-500">{draft.source_type === 'chatbot' ? '챗봇' : '게시판'}</span>
          {conf != null && (
            <span className={`text-xs font-medium ${conf >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
              신뢰도 {conf}%
            </span>
          )}
          {needsHuman && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> 검토 필요
            </span>
          )}
        </div>
        <a
          href={`${SITE_URL}/inquiries/${draft.inquiry_id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
        >
          원문 보기 <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {draft.inquiry && (
        <div className="text-xs text-gray-500">
          {draft.inquiry.group_name || '단체명 미상'} · {draft.inquiry.manager_name || '담당자 미상'}
          {draft.inquiry.expected_qty ? ` · ${draft.inquiry.expected_qty}벌` : ''}
          {draft.inquiry.desired_date ? ` · 필요일 ${draft.inquiry.desired_date}` : ''}
          {' · '}
          {draft.inquiry.email ? `📧 ${draft.inquiry.email}` : '이메일 없음'}
        </div>
      )}

      {draft.customer_summary && <p className="text-sm text-gray-700">요지: {draft.customer_summary}</p>}

      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={8}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm leading-relaxed"
      />

      <div className="flex flex-col gap-2">
        {(draft.proposed_actions || []).map((a) => {
          const disabled = a.type === 'send_email' && !hasEmail;
          return (
            <label
              key={a.type}
              className={`flex items-center gap-2 text-sm ${disabled ? 'text-gray-400' : 'text-gray-700'}`}
            >
              <input
                type="checkbox"
                checked={checked.has(a.type) && !disabled}
                disabled={disabled}
                onChange={() => toggle(a.type)}
                className="rounded border-gray-300"
              />
              {ACTION_LABEL[a.type] ?? a.type}
              {disabled && <span className="text-xs">(이메일 없음 — 게시판/카카오로 안내)</span>}
              {a.rationale && !disabled && <span className="text-xs text-gray-400">· {a.rationale}</span>}
            </label>
          );
        })}

        {couponAction && checked.has('issue_coupon') && (
          <div className="flex items-center gap-2 text-sm text-gray-600 pl-6">
            할인율
            <input
              type="number"
              value={couponValue}
              onChange={(e) => setCouponValue(Number(e.target.value) || 0)}
              className="w-16 px-2 py-1 border border-gray-300 rounded"
            />
            % · 만료
            <input
              type="date"
              value={couponExpiry}
              onChange={(e) => setCouponExpiry(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded"
            />
            <span className="text-xs text-gray-400">코드는 발급 시 자동 생성 → 본문 {'{{COUPON_CODE}}'} 치환</span>
          </div>
        )}
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="검수 메모(수정/반려 사유) — 학습에 반영됩니다"
        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
      />

      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={reject}
          disabled={busy !== ''}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50"
        >
          <X className="w-4 h-4" /> 반려
        </button>
        <button
          onClick={execute}
          disabled={busy !== ''}
          className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          <Check className="w-4 h-4" /> {busy === 'execute' ? '실행 중...' : '승인 · 실행'}
        </button>
      </div>
    </div>
  );
}

// ================= FAQ candidate row =================
function FaqCandidateRow({ c, onChanged }: { c: FaqCandidate; onChanged: () => void }) {
  const [question, setQuestion] = useState(c.question);
  const [answer, setAnswer] = useState(c.answer);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/cs/faq-candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, action, ...extra }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || '실패');
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  const needsFill = answer.includes('(대표님 확인 필요)');

  return (
    <div className="bg-white border border-gray-200/70 rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{c.source}</span>
        {c.intent && <span className="text-xs text-blue-600">{c.intent}</span>}
        {needsFill && <span className="text-xs text-amber-600">답변 보완 필요</span>}
      </div>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-medium"
      />
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => call('edit', { question, answer })}
          disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
        >
          <Edit2 className="w-4 h-4" /> 저장
        </button>
        <button
          onClick={() => call('reject')}
          disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50"
        >
          <X className="w-4 h-4" /> 반려
        </button>
        <button
          onClick={async () => {
            await call('edit', { question, answer });
            await call('approve');
          }}
          disabled={busy || needsFill}
          title={needsFill ? '답변의 (대표님 확인 필요) 부분을 먼저 채워주세요' : ''}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="w-4 h-4" /> 승인 · 발행
        </button>
      </div>
    </div>
  );
}

// ================= Manual card =================
function ManualCard({ m, onChanged }: { m: Manual; onChanged: () => void }) {
  const [guide, setGuide] = useState(m.answer_guide);
  const [sop, setSop] = useState(m.action_sop);
  const [policy, setPolicy] = useState(JSON.stringify(m.policy ?? {}, null, 2));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (approve: boolean) => {
    setBusy(true);
    setErr(null);
    let policyObj: unknown;
    try {
      policyObj = JSON.parse(policy);
    } catch {
      setErr('policy JSON 형식이 올바르지 않습니다.');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/admin/cs/manuals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: m.id,
          answer_guide: guide,
          action_sop: sop,
          policy: policyObj,
          ...(approve ? { status: 'approved' } : {}),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || '저장 실패');
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200/70 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{m.intent}</span>
          <span className="text-sm font-semibold text-gray-900">{m.title}</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            m.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {m.status === 'approved' ? '승인됨' : '초안'}
        </span>
      </div>
      <label className="block text-xs text-gray-500">답변 가이드</label>
      <textarea value={guide} onChange={(e) => setGuide(e.target.value)} rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
      <label className="block text-xs text-gray-500">처리 절차(SOP)</label>
      <textarea value={sop} onChange={(e) => setSop(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
      <label className="block text-xs text-gray-500">정책(policy) — 사실값. ‘(대표님 확인 필요)’ 부분을 채워주세요</label>
      <textarea value={policy} onChange={(e) => setPolicy(e.target.value)} rows={5} className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono" />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => save(false)} disabled={busy} className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50">
          저장
        </button>
        <button onClick={() => save(true)} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50">
          <Check className="w-4 h-4" /> 저장 · 승인
        </button>
      </div>
    </div>
  );
}

// ================= main =================
type Tab = 'drafts' | 'faqs' | 'manuals';

export default function CsReviewSection() {
  const [tab, setTab] = useState<Tab>('drafts');
  const { data: drafts, mutate: mDrafts, isLoading: lD } = useSWR<Draft[]>('/api/admin/cs/drafts?status=pending_review', fetcher);
  const { data: faqs, mutate: mFaqs, isLoading: lF } = useSWR<FaqCandidate[]>('/api/admin/cs/faq-candidates?status=pending', fetcher);
  const { data: manuals, mutate: mMan, isLoading: lM } = useSWR<Manual[]>('/api/admin/cs/manuals', fetcher);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'drafts', label: '응대 검수', count: drafts?.length ?? 0 },
    { key: 'faqs', label: 'FAQ 후보', count: faqs?.length ?? 0 },
    { key: 'manuals', label: '응대 매뉴얼', count: manuals?.length ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label} <span className="text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
        <button
          onClick={() => {
            mDrafts();
            mFaqs();
            mMan();
          }}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="w-4 h-4" /> 새로고침
        </button>
      </div>

      {tab === 'drafts' && (
        <div className="space-y-3">
          {lD ? (
            <p className="text-sm text-gray-500 py-8 text-center">불러오는 중...</p>
          ) : (drafts?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">검수 대기 중인 응대 초안이 없습니다.</p>
          ) : (
            drafts!.map((d) => <DraftCard key={d.id} draft={d} onChanged={() => mDrafts()} />)
          )}
        </div>
      )}

      {tab === 'faqs' && (
        <div className="space-y-3">
          {lF ? (
            <p className="text-sm text-gray-500 py-8 text-center">불러오는 중...</p>
          ) : (faqs?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">검토할 FAQ 후보가 없습니다.</p>
          ) : (
            faqs!.map((c) => <FaqCandidateRow key={c.id} c={c} onChanged={() => mFaqs()} />)
          )}
        </div>
      )}

      {tab === 'manuals' && (
        <div className="space-y-3">
          {lM ? (
            <p className="text-sm text-gray-500 py-8 text-center">불러오는 중...</p>
          ) : (manuals?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">응대 매뉴얼이 없습니다.</p>
          ) : (
            manuals!.map((m) => <ManualCard key={m.id} m={m} onChanged={() => mMan()} />)
          )}
        </div>
      )}
    </div>
  );
}
