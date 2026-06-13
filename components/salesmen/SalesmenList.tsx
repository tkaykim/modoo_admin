'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Search, ChevronLeft, ChevronRight, Users as UsersIcon, AlertTriangle } from 'lucide-react';
import type { GradeLevelRow, GradePolicy, SalesmanListItem } from '@/lib/salesmen';
import { GRADE_LEVELS, SALESMAN_STATUSES } from '@/lib/salesmen';
import GradeBadge from './GradeBadge';
import SalesmanDetailDrawer from './SalesmanDetailDrawer';

interface ListResponse {
  data: SalesmanListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || 'Failed to fetch');
  }
  return res.json();
};

const STATUS_LABELS: Record<string, string> = {
  pending: '승인대기',
  active: '활성',
  dormant: '휴면',
  churned: '이탈',
};
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  dormant: 'bg-yellow-100 text-yellow-800',
  churned: 'bg-gray-200 text-gray-700',
};

export default function SalesmenList() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<'all' | typeof SALESMAN_STATUSES[number]>('all');
  const [grade, setGrade] = useState<'all' | string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const url = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      status,
      grade,
    });
    if (debouncedQ) params.set('q', debouncedQ);
    return `/api/admin/salesmen?${params.toString()}`;
  }, [page, status, grade, debouncedQ]);

  const { data, isLoading, error, mutate } = useSWR<ListResponse>(url, fetcher);
  // 승인 대기자 수 — 상단 배너용 (status 필터와 무관하게 항상 조회)
  const { data: pendingData, mutate: mutatePending } = useSWR<ListResponse>(
    '/api/admin/salesmen?status=pending&page=1&limit=1',
    fetcher
  );
  const pendingCount = pendingData?.total ?? 0;
  const { data: gradeData } = useSWR<{ levels: GradeLevelRow[] }>('/api/admin/grade-levels', fetcher);
  const { data: policyData } = useSWR<{ policy: GradePolicy }>('/api/admin/grade-policy', fetcher);
  const dormantWarn = policyData?.policy?.dormant_inactive_months ?? 3;
  const churnedWarn = policyData?.policy?.churned_inactive_months ?? 6;
  const gradeLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of gradeData?.levels ?? []) m.set(g.level, g.label);
    return m;
  }, [gradeData]);

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  return (
    <div className="space-y-3">
      {pendingCount > 0 && status !== 'pending' && (
        <button
          onClick={() => {
            setStatus('pending');
            setPage(1);
          }}
          className="w-full flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-md px-4 py-2.5 text-left hover:bg-blue-100 transition-colors"
        >
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
            {pendingCount}
          </span>
          <span className="text-sm font-medium text-blue-900">
            승인 대기 중인 영업사원 신청 {pendingCount}건 — 클릭해서 검토
          </span>
          <ChevronRight className="w-4 h-4 text-blue-500 ml-auto" />
        </button>
      )}
      <div className="bg-white border border-gray-200/60 rounded-md p-3 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·코드(SR-...)·전화로 검색"
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChips
            value={status}
            onChange={(v) => {
              setStatus(v as typeof status);
              setPage(1);
            }}
            options={[
              { value: 'all', label: '전체 상태' },
              ...SALESMAN_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
            ]}
          />
          <FilterChips
            value={grade}
            onChange={(v) => {
              setGrade(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: '전체 등급' },
              ...GRADE_LEVELS.map((g) => ({ value: g, label: g.replace('LV', 'Lv.') })),
            ]}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-800">
          {error instanceof Error ? error.message : '목록을 불러오지 못했습니다.'}
        </div>
      )}

      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>총 {total.toLocaleString('ko-KR')}명</span>
          {isLoading && <span>불러오는 중...</span>}
        </div>

        <div className="overflow-x-auto hidden md:block">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th>코드</Th>
                <Th>이름</Th>
                <Th>등급</Th>
                <Th>상태</Th>
                <Th>활동</Th>
                <Th align="right">이번 달 매출</Th>
                <Th align="right">예상 수수료</Th>
                <Th align="right">팀</Th>
                <Th align="right">파트너몰</Th>
                <Th>멘토</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((sp) => (
                <tr
                  key={sp.id}
                  onClick={() => setSelectedId(sp.id)}
                  className="hover:bg-orange-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-700">{sp.salesman_code}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-900">
                    {sp.display_name || '-'}
                    <div className="text-[11px] text-gray-500">{sp.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <GradeBadge grade={sp.grade} label={gradeLabelMap.get(sp.grade)} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                        STATUS_COLORS[sp.status] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {STATUS_LABELS[sp.status] ?? sp.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <InactivityChip
                      months={sp.inactive_months}
                      dormantWarn={dormantWarn}
                      churnedWarn={churnedWarn}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right text-gray-900">
                    {sp.this_month_revenue.toLocaleString('ko-KR')}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right text-orange-700">
                    {sp.this_month_commission.toLocaleString('ko-KR')}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right text-gray-700">
                    {sp.active_team_count}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right text-gray-700">
                    {sp.active_partner_mall_count}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{sp.mentor_display_name ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-gray-100">
          {items.map((sp) => (
            <button
              key={sp.id}
              onClick={() => setSelectedId(sp.id)}
              className="w-full text-left p-3 hover:bg-orange-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{sp.display_name || '-'}</div>
                  <div className="text-[11px] font-mono text-gray-500">{sp.salesman_code}</div>
                  <div className="text-[11px] text-gray-500 truncate">{sp.email ?? ''}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <GradeBadge grade={sp.grade} label={gradeLabelMap.get(sp.grade)} />
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] ${
                      STATUS_COLORS[sp.status] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {STATUS_LABELS[sp.status] ?? sp.status}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-gray-600 items-center">
                <InactivityChip
                  months={sp.inactive_months}
                  dormantWarn={dormantWarn}
                  churnedWarn={churnedWarn}
                />
                <span>이번 달 {sp.this_month_revenue.toLocaleString('ko-KR')}원</span>
                <span className="text-orange-700">
                  수수료 {sp.this_month_commission.toLocaleString('ko-KR')}원
                </span>
                <span>팀 {sp.active_team_count}</span>
                <span>몰 {sp.active_partner_mall_count}</span>
              </div>
            </button>
          ))}
        </div>

        {!isLoading && items.length === 0 && (
          <div className="text-center py-12">
            <UsersIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500">조건에 맞는 영업사원이 없습니다.</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
            <span>
              {((page - 1) * limit + 1).toLocaleString('ko-KR')}-
              {Math.min(page * limit, total).toLocaleString('ko-KR')} / {total.toLocaleString('ko-KR')}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                이전
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                다음
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <SalesmanDetailDrawer
          salesmanId={selectedId}
          gradeLevels={gradeData?.levels ?? []}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            mutate();
            mutatePending();
          }}
        />
      )}
    </div>
  );
}

function FilterChips({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            value === o.value
              ? 'bg-orange-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function InactivityChip({
  months,
  dormantWarn,
  churnedWarn,
}: {
  months: number;
  dormantWarn: number;
  churnedWarn: number;
}) {
  if (months === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-green-100 text-green-800">
        활동 중
      </span>
    );
  }
  if (months >= churnedWarn) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-red-100 text-red-800">
        <AlertTriangle className="w-3 h-3" />
        {months}개월 무매출 (이탈 위험)
      </span>
    );
  }
  if (months >= dormantWarn) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-800">
        <AlertTriangle className="w-3 h-3" />
        {months}개월 무매출
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700">
      {months}개월째 매출 없음
    </span>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-4 py-2 text-${align} text-xs font-medium text-gray-500 uppercase tracking-wider`}
    >
      {children}
    </th>
  );
}
