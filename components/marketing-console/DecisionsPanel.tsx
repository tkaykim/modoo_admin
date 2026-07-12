'use client';

// 오늘의 결정 — 승인 대기 소재를 근거와 함께 카드로 보여주고, 원탭 승인=즉시 집행.
// (feedback_admin_ux_journey: "편하게 보고 → 편하게 결정" 한 여정, 모바일 우선)

import { useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, XCircle, Clock3, Flame, ShieldCheck } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(async (res) => {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || '불러오기 실패');
  return json.data;
});

type PendingDraft = {
  id: string;
  title: string | null;
  primary_text: string | null;
  overlay_headline: string | null;
  overlay_sub: string | null;
  rationale: string | null;
  based_on: string | null;
  image_url: string | null;
  image_hash: string | null;
  created_at: string;
};

type TimelineRow = {
  id: string;
  kind: string;
  target_name: string | null;
  reason: string | null;
  status: string;
  proposed_by: string | null;
  created_at: string;
};

type CompetitorWinner = { headline: string; body: string; daysRunning: number };

type DecisionsData = {
  pending: PendingDraft[];
  timeline: TimelineRow[];
  competitorWinners: CompetitorWinner[];
  testAdSetId: string;
};

const KIND_LABEL: Record<string, string> = {
  pause_ad: '⏸ 자동 OFF',
  activate_ad: '▶ 활성화',
  promote_ad: '🏆 승격',
  create_ad: '➕ 소재 등록',
  adset_budget: '💰 예산',
  note: '📝 기록',
};

export default function DecisionsPanel({ onChanged }: { onChanged?: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<DecisionsData>('/api/admin/marketing-console/decisions', fetcher, {
    revalidateOnFocus: false,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const decide = async (draftId: string, action: 'approve' | 'reject') => {
    setBusyId(draftId);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/marketing-console/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draftId, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || '처리 실패');
      setNotice(action === 'approve' ? `승인 완료 — 테스트 세트에 즉시 집행됐습니다 (광고 ${json.data?.adId ?? ''}).` : '기각 처리했습니다.');
      await mutate();
      onChanged?.();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '처리 중 오류');
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) return <div className="px-4 py-10 text-center text-sm text-gray-500">결정 대기 항목을 불러오는 중...</div>;
  if (error) return <div className="px-4 py-6 text-sm text-red-600">{error.message}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4 p-4">
      {notice && <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{notice}</div>}

      {/* 승인 대기 카드 — 결정에 필요한 근거를 버튼 옆에 */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">승인 대기 소재 {data.pending.length}건</h3>
          <span className="text-xs text-gray-400">승인 = 테스트 세트 즉시 집행 · 이후는 가드레일이 감시</span>
        </div>
        {data.pending.length === 0 && (
          <div className="rounded-md border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
            결정 대기 소재가 없습니다. 다음 주간 생성(일요일 밤)에 새 소재가 올라옵니다.
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {data.pending.map((draft) => (
            <div key={draft.id} className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
              {draft.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.image_url} alt={draft.title ?? ''} className="aspect-[4/5] w-full bg-gray-100 object-cover" />
              ) : (
                <div className="flex aspect-[4/5] w-full items-center justify-center bg-gray-50 text-xs text-gray-400">
                  이미지 생성 대기 — 승인 불가
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{draft.title}</p>
                  <p className="text-xs text-gray-500">
                    {draft.overlay_headline}
                    {draft.overlay_sub ? ` · ${draft.overlay_sub}` : ''}
                  </p>
                </div>
                {draft.primary_text && (
                  <p className="whitespace-pre-line rounded bg-gray-50 px-2 py-1.5 text-xs leading-relaxed text-gray-700">{draft.primary_text}</p>
                )}
                {(draft.rationale || draft.based_on) && (
                  <p className="text-[11px] leading-relaxed text-gray-500">
                    근거: {draft.rationale}
                    {draft.based_on ? ` (참고: ${draft.based_on})` : ''}
                  </p>
                )}
                <div className="mt-auto flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyId === draft.id || !draft.image_hash}
                    onClick={() => decide(draft.id, 'approve')}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {busyId === draft.id ? '집행 중...' : '승인 · 즉시 집행'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === draft.id}
                    onClick={() => decide(draft.id, 'reject')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    기각
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 경쟁사 트렌드 — 결정 컨텍스트 */}
      {data.competitorWinners.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-gray-900">경쟁사 장수 집행 소재 (시장 검증 소구)</h3>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {data.competitorWinners.map((winner, index) => (
              <div key={index} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-xs font-semibold text-gray-800">
                  {winner.headline || '(헤드라인 없음)'}
                  <span className="ml-1.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">{winner.daysRunning}일째</span>
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">{winner.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 자동 운영 타임라인 */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">자동 운영 이력 (가드레일·승격·등록)</h3>
        </div>
        <div className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
          {data.timeline.map((row) => (
            <div key={row.id} className="flex items-start gap-2 px-3 py-2">
              <span className="mt-0.5 shrink-0 text-xs">{KIND_LABEL[row.kind] ?? row.kind}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-800">{row.target_name}</p>
                {row.reason && <p className="truncate text-[11px] text-gray-500">{row.reason}</p>}
              </div>
              <span className="shrink-0 text-[11px] text-gray-400">{new Date(row.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
          {data.timeline.length === 0 && <div className="px-3 py-6 text-center text-xs text-gray-400">이력이 없습니다.</div>}
        </div>
      </div>
    </div>
  );
}
