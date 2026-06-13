'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { X, Save, Lock, Unlock, RefreshCw } from 'lucide-react';
import type { GradeLevelRow, SalesmanProfile } from '@/lib/salesmen';
import { GRADE_LEVELS, SALESMAN_STATUSES } from '@/lib/salesmen';
import GradeBadge from './GradeBadge';
import SalesmanMetricsPanel from './SalesmanMetricsPanel';
import SettlementsList from './SettlementsList';
import GradeHistoryList from './GradeHistoryList';

interface DetailResponse {
  profile: SalesmanProfile;
  user: { id: string; email: string | null; name: string | null; phone_number: string | null } | null;
  mentor: { id: string; display_name: string | null; salesman_code: string } | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || 'Failed to fetch');
  }
  return res.json();
};

export default function SalesmanDetailDrawer({
  salesmanId,
  gradeLevels,
  onClose,
  onChanged,
}: {
  salesmanId: string;
  gradeLevels: GradeLevelRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, mutate } = useSWR<DetailResponse>(
    `/api/admin/salesmen/${salesmanId}`,
    fetcher
  );

  const [grade, setGrade] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [lockEnabled, setLockEnabled] = useState(true);
  const [lockMonths, setLockMonths] = useState<number>(3);
  const [lockReason, setLockReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'unlock' | 'reeval' | 'approval' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.profile) return;
    setGrade(data.profile.grade);
    setStatus(data.profile.status);
    setDisplayName(data.profile.display_name ?? '');
    setPhone(data.profile.phone ?? '');
    setNote(data.profile.note ?? '');
    setLockReason('');
  }, [data?.profile]);

  const profile = data?.profile;
  const lockedNow =
    profile?.grade_locked_until && new Date(profile.grade_locked_until).getTime() > Date.now();
  const gradeChanged = profile && grade !== profile.grade;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const payload: Record<string, unknown> = {
        status,
        display_name: displayName || null,
        phone: phone || null,
        note: note || null,
      };
      if (gradeChanged) {
        payload.grade = grade;
        payload.grade_lock = lockEnabled;
        payload.grade_lock_months = lockMonths;
        payload.grade_lock_reason = lockReason || null;
      }
      const res = await fetch(`/api/admin/salesmen/${salesmanId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '저장에 실패했습니다.');
      }
      await mutate();
      onChanged();
      setInfo('저장되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  // 승인/거절 — pending 신청자 전용. 기존 PATCH(status) 재사용.
  const handleApproval = async (decision: 'active' | 'churned') => {
    setBusy('approval');
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/salesmen/${salesmanId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: decision }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '처리에 실패했습니다.');
      }
      await mutate();
      onChanged();
      setStatus(decision);
      setInfo(decision === 'active' ? '승인되었습니다. 영업사원이 로그인할 수 있습니다.' : '신청을 거절했습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setBusy(null);
    }
  };

  const handleUnlock = async () => {
    setBusy('unlock');
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/salesmen/${salesmanId}/unlock`, { method: 'POST' });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '잠금 해제 실패');
      }
      await mutate();
      onChanged();
      setInfo('잠금이 해제되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '잠금 해제 실패');
    } finally {
      setBusy(null);
    }
  };

  const handleReevaluate = async (dryRun: boolean) => {
    setBusy('reeval');
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/admin/salesmen/reevaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesmanIds: [salesmanId], dryRun }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '재평가 실패');
      const result = Array.isArray(payload.results) ? payload.results[0] : null;
      setInfo(
        `${dryRun ? '[Dry-run] ' : ''}결과: ${result?.action ?? 'noop'}${
          result?.from && result?.to ? ` (${result.from} → ${result.to})` : ''
        }${result?.avg ? ` · 평균 ${Math.floor(result.avg).toLocaleString('ko-KR')}원` : ''}`
      );
      if (!dryRun) await mutate();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '재평가 실패');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex justify-end"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900 truncate">
                {profile?.display_name || '영업사원'}
              </h2>
              {profile?.grade && (
                <GradeBadge
                  grade={profile.grade}
                  label={gradeLevels.find((g) => g.level === profile.grade)?.label}
                />
              )}
              {lockedNow && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[11px]">
                  <Lock className="w-3 h-3" />
                  자동평가 잠금
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 font-mono">{profile?.salesman_code}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-800">
              {error}
            </div>
          )}
          {info && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800">
              {info}
            </div>
          )}

          {/* 승인 대기 배너 — 신청자 검토 (pending) */}
          {profile?.status === 'pending' && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="text-sm font-bold text-blue-900 mb-1">영업사원 지원 신청</div>
              <div className="text-xs text-blue-800 mb-3">
                {profile.display_name || '신청자'} · {data?.user?.email ?? ''} · {profile.phone ?? '연락처 미상'}
                <br />
                신청일 {new Date(profile.joined_at).toLocaleString('ko-KR')}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApproval('active')}
                  disabled={busy === 'approval'}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded disabled:opacity-50"
                >
                  {busy === 'approval' ? '처리 중...' : '✓ 승인'}
                </button>
                <button
                  onClick={() => {
                    if (confirm('이 신청을 거절하시겠습니까? (이탈 처리되어 로그인 불가)')) {
                      handleApproval('churned');
                    }
                  }}
                  disabled={busy === 'approval'}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded disabled:opacity-50"
                >
                  거절
                </button>
              </div>
            </div>
          )}

          {/* 잠금 배너 */}
          {lockedNow && profile && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs flex items-center justify-between gap-2">
              <div className="text-amber-900">
                <div className="font-medium">자동 재평가 잠금됨</div>
                <div className="text-[11px] text-amber-800 mt-0.5">
                  {new Date(profile.grade_locked_until!).toLocaleString('ko-KR')} 까지
                  {profile.grade_locked_reason ? ` · ${profile.grade_locked_reason}` : ''}
                </div>
              </div>
              <button
                onClick={handleUnlock}
                disabled={busy === 'unlock'}
                className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[11px] rounded disabled:opacity-50"
              >
                <Unlock className="w-3 h-3" />
                잠금 해제
              </button>
            </div>
          )}

          {/* 재평가 액션 */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleReevaluate(true)}
              disabled={busy === 'reeval'}
              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 text-[11px] rounded border border-gray-300 disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" />
              개별 Dry-run
            </button>
            <button
              onClick={() => handleReevaluate(false)}
              disabled={busy === 'reeval'}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] rounded disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" />
              개별 즉시 재평가
            </button>
            <span className="text-[11px] text-gray-500 ml-auto">
              마지막 평가:{' '}
              {profile?.last_grade_evaluated_at
                ? new Date(profile.last_grade_evaluated_at).toLocaleString('ko-KR')
                : '-'}{' '}
              · grace 카운터: {profile?.consecutive_below_threshold ?? 0}
            </span>
          </div>

          {/* 기본 정보 편집 */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">기본 정보</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="이름">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </Field>
              <Field label="전화">
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </Field>
              <Field label="이메일 (auth)">
                <div className="text-xs text-gray-700 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md truncate">
                  {data?.user?.email ?? '-'}
                </div>
              </Field>
              <Field label="가입일">
                <div className="text-xs text-gray-700 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
                  {profile?.joined_at?.slice(0, 10) ?? '-'}
                </div>
              </Field>
              <Field label="등급">
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {GRADE_LEVELS.map((lv) => {
                    const meta = gradeLevels.find((g) => g.level === lv);
                    return (
                      <option key={lv} value={lv}>
                        {lv.replace('LV', 'Lv.')} · {meta?.label ?? ''} ·{' '}
                        {meta ? `${(Number(meta.commission_rate) * 100).toFixed(1)}%` : ''}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label="상태">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {SALESMAN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s === 'pending' ? '승인대기' : s === 'active' ? '활성' : s === 'dormant' ? '휴면' : '이탈'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="멘토">
                <div className="text-xs text-gray-700 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
                  {data?.mentor
                    ? `${data.mentor.display_name ?? data.mentor.salesman_code} (${data.mentor.salesman_code})`
                    : '-'}
                </div>
              </Field>
            </div>

            {gradeChanged && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
                <div className="text-xs font-medium text-blue-900">
                  등급 수동 변경: {profile?.grade} → {grade}
                </div>
                <label className="flex items-center gap-2 text-xs text-blue-900">
                  <input
                    type="checkbox"
                    checked={lockEnabled}
                    onChange={(e) => setLockEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  변경 후 자동 재평가 잠금
                </label>
                {lockEnabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-blue-900 mb-0.5">잠금 기간(개월)</label>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        value={lockMonths}
                        onChange={(e) => setLockMonths(Number(e.target.value))}
                        className="w-full px-2 py-1 text-xs border border-blue-200 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-blue-900 mb-0.5">사유</label>
                      <input
                        type="text"
                        value={lockReason}
                        onChange={(e) => setLockReason(e.target.value)}
                        placeholder="예: 신규 영업 부문 인수인계"
                        className="w-full px-2 py-1 text-xs border border-blue-200 rounded"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <Field label="메모">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </Field>
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs rounded-md disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </section>

          <SalesmanMetricsPanel salesmanId={salesmanId} />
          <GradeHistoryList salesmanId={salesmanId} />
          <SettlementsList salesmanId={salesmanId} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
