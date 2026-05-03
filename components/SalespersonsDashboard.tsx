'use client';

import { useMemo, useState } from 'react';
import {
  TrendingUp,
  Users as UsersIcon,
  UserCheck,
  Repeat,
  Wallet,
  Search,
  ArrowUpDown,
  Crown,
  Shield,
  Star,
  Award,
  User,
} from 'lucide-react';

// ========== Types ==========
type RankCode = 'RD' | 'BM' | 'TL' | 'SUC' | 'UC' | 'T';
type Status = 'active' | 'dormant' | 'churned';

interface Salesperson {
  id: string;
  name: string;
  rank: RankCode;
  parentId: string | null;
  joinedMonth: string;
  personalRevenue: number;
  groupRevenue: number;
  monthlyCommission: number;
  retained90d: boolean;
  status: Status;
}

// ========== Constants ==========
const RANK_META: Record<RankCode, { label: string; level: number; color: string; bg: string; ring: string }> = {
  RD: { label: '지역본부장', level: 4, color: 'text-orange-700', bg: 'bg-orange-100', ring: 'ring-orange-500' },
  BM: { label: '지점장', level: 3, color: 'text-blue-800', bg: 'bg-blue-100', ring: 'ring-blue-700' },
  TL: { label: '팀장', level: 2, color: 'text-sky-700', bg: 'bg-sky-100', ring: 'ring-sky-500' },
  SUC: { label: '수석컨설턴트', level: 1.5, color: 'text-slate-700', bg: 'bg-slate-100', ring: 'ring-slate-400' },
  UC: { label: '컨설턴트', level: 1, color: 'text-gray-700', bg: 'bg-gray-100', ring: 'ring-gray-400' },
  T: { label: '트레이니', level: 0, color: 'text-gray-500', bg: 'bg-gray-50', ring: 'ring-gray-300' },
};

const COMMISSION_RATES = [
  { key: 'direct', label: '직접판매수당', rate: 0.16, target: '본인', desc: '본인이 수주한 매출' },
  { key: 'tier1', label: '1차 후원수당', rate: 0.05, target: '직속 TL', desc: '직속 UC 매출' },
  { key: 'tier2', label: '2차 후원수당', rate: 0.025, target: '차상위 BM', desc: '직속 TL 그룹 매출' },
  { key: 'tier3', label: '3차 후원수당', rate: 0.015, target: '최상위 RD', desc: '직속 BM 그룹 매출' },
  { key: 'mentor', label: '육성수당', rate: 0.01, target: '멘토', desc: '신규 UC 첫 6개월' },
  { key: 'pool', label: '시책 풀', rate: 0.02, target: '분기 우수자', desc: '적립 후 분기 분배' },
];

const RANK_CARDS: Array<{
  code: RankCode;
  tagline: string;
  promotion: string[];
  authorities: string[];
  monthlyIncome: string;
  kpi: string[];
}> = [
  {
    code: 'RD',
    tagline: '한 권역의 사령관',
    promotion: ['분기 매출 5억+', 'BM 3명 이상 직속', '본인 월매출 1,500만+'],
    authorities: ['할인 25% 자율', 'BM 승급 결정권', '권역 마케팅 예산 운용'],
    monthlyIncome: '12,000,000 ~ 18,000,000',
    kpi: ['권역 월매출 7억', '직속 BM 2~5', '총 산하 60~200명'],
  },
  {
    code: 'BM',
    tagline: '한 도시의 영업 책임자',
    promotion: ['분기 매출 1억+', 'TL 2명 이상 직속', '본인 월매출 1,000만+'],
    authorities: ['할인 20% 자율', '신규 UC 채용 결정권', '지점 사무실 운영권'],
    monthlyIncome: '9,000,000 ~ 14,000,000',
    kpi: ['지점 월매출 2억', '직속 TL 2~6', '총 산하 10~60명'],
  },
  {
    code: 'TL',
    tagline: '팀의 첫 리더',
    promotion: ['분기 매출 2,500만+', 'UC 3명 이상 직속', '본인 월매출 1,000만+'],
    authorities: ['할인 15% 자율', '팀원 채용 추천권', '팀원 KPI 평가권'],
    monthlyIncome: '4,000,000 ~ 6,000,000',
    kpi: ['팀 월매출 4,000만', '직속 UC 3~8', '팀원 이탈률 ≤25%'],
  },
  {
    code: 'SUC',
    tagline: '검증된 영업 전문가',
    promotion: ['본인 월매출 평균 500만+', '누적매출 3,000만+'],
    authorities: ['할인 10% 자율', '본사 우선 리드 배정', '추천 파트너 모집권'],
    monthlyIncome: '2,000,000 ~ 3,500,000',
    kpi: ['월매출 1,500~2,500만', '재발주율 30%+'],
  },
  {
    code: 'UC',
    tagline: '내 시간, 내 인맥, 내 매출',
    promotion: ['첫 수주 완료 또는 입사 30일'],
    authorities: ['할인 10% 자율', '샘플 무료 발송 월 3건', '고객 명함 보유'],
    monthlyIncome: '800,000 ~ 2,400,000',
    kpi: ['월매출 500~1,500만', '월 견적 15건', '전환율 35%'],
  },
];

// ========== Dummy Data ==========
// 30명 파일럿: RD 1 + BM 3 + TL 5 + UC 21
const DUMMY: Salesperson[] = [
  { id: 'rd1', name: '김본부', rank: 'RD', parentId: null, joinedMonth: '2024-03', personalRevenue: 14_500_000, groupRevenue: 612_000_000, monthlyCommission: 12_840_000, retained90d: true, status: 'active' },
  { id: 'bm1', name: '이지점', rank: 'BM', parentId: 'rd1', joinedMonth: '2024-04', personalRevenue: 19_200_000, groupRevenue: 248_000_000, monthlyCommission: 10_120_000, retained90d: true, status: 'active' },
  { id: 'bm2', name: '박지점', rank: 'BM', parentId: 'rd1', joinedMonth: '2024-05', personalRevenue: 18_400_000, groupRevenue: 215_000_000, monthlyCommission: 8_950_000, retained90d: true, status: 'active' },
  { id: 'bm3', name: '최지점', rank: 'BM', parentId: 'rd1', joinedMonth: '2024-08', personalRevenue: 16_800_000, groupRevenue: 149_000_000, monthlyCommission: 6_780_000, retained90d: true, status: 'active' },
  { id: 'tl1', name: '정팀장', rank: 'TL', parentId: 'bm1', joinedMonth: '2024-06', personalRevenue: 16_300_000, groupRevenue: 52_000_000, monthlyCommission: 5_210_000, retained90d: true, status: 'active' },
  { id: 'tl2', name: '강팀장', rank: 'TL', parentId: 'bm1', joinedMonth: '2024-09', personalRevenue: 14_800_000, groupRevenue: 41_000_000, monthlyCommission: 4_420_000, retained90d: true, status: 'active' },
  { id: 'tl3', name: '윤팀장', rank: 'TL', parentId: 'bm2', joinedMonth: '2024-07', personalRevenue: 15_500_000, groupRevenue: 47_000_000, monthlyCommission: 4_830_000, retained90d: true, status: 'active' },
  { id: 'tl4', name: '한팀장', rank: 'TL', parentId: 'bm2', joinedMonth: '2024-10', personalRevenue: 12_400_000, groupRevenue: 33_000_000, monthlyCommission: 3_650_000, retained90d: true, status: 'active' },
  { id: 'tl5', name: '서팀장', rank: 'TL', parentId: 'bm3', joinedMonth: '2024-11', personalRevenue: 11_800_000, groupRevenue: 28_000_000, monthlyCommission: 3_140_000, retained90d: true, status: 'active' },
  { id: 'uc01', name: '김민지', rank: 'SUC', parentId: 'tl1', joinedMonth: '2024-08', personalRevenue: 22_400_000, groupRevenue: 22_400_000, monthlyCommission: 3_584_000, retained90d: true, status: 'active' },
  { id: 'uc02', name: '이서연', rank: 'UC', parentId: 'tl1', joinedMonth: '2025-01', personalRevenue: 9_800_000, groupRevenue: 9_800_000, monthlyCommission: 1_568_000, retained90d: true, status: 'active' },
  { id: 'uc03', name: '박지호', rank: 'UC', parentId: 'tl1', joinedMonth: '2025-02', personalRevenue: 7_200_000, groupRevenue: 7_200_000, monthlyCommission: 1_152_000, retained90d: true, status: 'active' },
  { id: 'uc04', name: '최유나', rank: 'T', parentId: 'tl1', joinedMonth: '2025-03', personalRevenue: 3_400_000, groupRevenue: 3_400_000, monthlyCommission: 644_000, retained90d: false, status: 'active' },
  { id: 'uc05', name: '정하늘', rank: 'UC', parentId: 'tl2', joinedMonth: '2024-12', personalRevenue: 11_200_000, groupRevenue: 11_200_000, monthlyCommission: 1_792_000, retained90d: true, status: 'active' },
  { id: 'uc06', name: '강도윤', rank: 'UC', parentId: 'tl2', joinedMonth: '2025-01', personalRevenue: 8_400_000, groupRevenue: 8_400_000, monthlyCommission: 1_344_000, retained90d: true, status: 'active' },
  { id: 'uc07', name: '윤서아', rank: 'T', parentId: 'tl2', joinedMonth: '2025-03', personalRevenue: 2_800_000, groupRevenue: 2_800_000, monthlyCommission: 528_000, retained90d: false, status: 'active' },
  { id: 'uc08', name: '한지우', rank: 'SUC', parentId: 'tl3', joinedMonth: '2024-09', personalRevenue: 19_500_000, groupRevenue: 19_500_000, monthlyCommission: 3_120_000, retained90d: true, status: 'active' },
  { id: 'uc09', name: '서예준', rank: 'UC', parentId: 'tl3', joinedMonth: '2024-12', personalRevenue: 10_400_000, groupRevenue: 10_400_000, monthlyCommission: 1_664_000, retained90d: true, status: 'active' },
  { id: 'uc10', name: '오시우', rank: 'UC', parentId: 'tl3', joinedMonth: '2025-01', personalRevenue: 6_800_000, groupRevenue: 6_800_000, monthlyCommission: 1_088_000, retained90d: true, status: 'active' },
  { id: 'uc11', name: '신예린', rank: 'UC', parentId: 'tl3', joinedMonth: '2025-02', personalRevenue: 4_300_000, groupRevenue: 4_300_000, monthlyCommission: 688_000, retained90d: false, status: 'active' },
  { id: 'uc12', name: '임채원', rank: 'UC', parentId: 'tl4', joinedMonth: '2024-11', personalRevenue: 9_200_000, groupRevenue: 9_200_000, monthlyCommission: 1_472_000, retained90d: true, status: 'active' },
  { id: 'uc13', name: '배수아', rank: 'UC', parentId: 'tl4', joinedMonth: '2025-01', personalRevenue: 7_400_000, groupRevenue: 7_400_000, monthlyCommission: 1_184_000, retained90d: true, status: 'active' },
  { id: 'uc14', name: '조하린', rank: 'T', parentId: 'tl4', joinedMonth: '2025-03', personalRevenue: 1_800_000, groupRevenue: 1_800_000, monthlyCommission: 380_000, retained90d: false, status: 'active' },
  { id: 'uc15', name: '권민서', rank: 'UC', parentId: 'tl5', joinedMonth: '2024-12', personalRevenue: 8_900_000, groupRevenue: 8_900_000, monthlyCommission: 1_424_000, retained90d: true, status: 'active' },
  { id: 'uc16', name: '백다은', rank: 'UC', parentId: 'tl5', joinedMonth: '2025-01', personalRevenue: 5_600_000, groupRevenue: 5_600_000, monthlyCommission: 896_000, retained90d: true, status: 'active' },
  { id: 'uc17', name: '문승현', rank: 'T', parentId: 'tl5', joinedMonth: '2025-04', personalRevenue: 1_200_000, groupRevenue: 1_200_000, monthlyCommission: 240_000, retained90d: false, status: 'active' },
  { id: 'uc18', name: '안유진', rank: 'UC', parentId: 'tl1', joinedMonth: '2024-10', personalRevenue: 0, groupRevenue: 0, monthlyCommission: 0, retained90d: true, status: 'dormant' },
  { id: 'uc19', name: '노지민', rank: 'UC', parentId: 'tl3', joinedMonth: '2024-08', personalRevenue: 0, groupRevenue: 0, monthlyCommission: 0, retained90d: false, status: 'churned' },
];

const DUMMY_KPI = {
  monthlyRevenue: 523_400_000,
  revenueDeltaPct: 12,
  activeUC: 27,
  activeUCTarget: 30,
  retention90d: 0.64,
  retentionTarget: 0.6,
  reorderRate: 0.31,
  reorderTarget: 0.3,
  commissionRatio: 0.276,
  commissionCeiling: 0.35,
};

// ========== Helpers ==========
const formatKRW = (n: number) =>
  n >= 100_000_000 ? `${(n / 100_000_000).toFixed(2)}억` : n >= 10_000_000 ? `${(n / 10_000_000).toFixed(1)}천만` : `${(n / 10_000).toLocaleString()}만`;

const fullKRW = (n: number) => `₩${n.toLocaleString()}`;

const statusBadge = (s: Status) => {
  const m: Record<Status, { label: string; cls: string }> = {
    active: { label: '활성', cls: 'bg-green-100 text-green-800' },
    dormant: { label: '휴면', cls: 'bg-yellow-100 text-yellow-800' },
    churned: { label: '이탈', cls: 'bg-red-100 text-red-800' },
  };
  return m[s];
};

// ========== Sections ==========
function KPICards() {
  const k = DUMMY_KPI;
  const cards = [
    { icon: TrendingUp, label: '이번 달 총매출', value: fullKRW(k.monthlyRevenue), sub: `전월대비 +${k.revenueDeltaPct}%`, tone: 'orange' },
    { icon: UsersIcon, label: '활성 UC 수', value: `${k.activeUC}명`, sub: `목표 ${k.activeUCTarget}명`, tone: 'blue' },
    { icon: UserCheck, label: '90일 정착률', value: `${(k.retention90d * 100).toFixed(0)}%`, sub: `목표 ${(k.retentionTarget * 100).toFixed(0)}%`, tone: 'sky' },
    { icon: Repeat, label: '재발주율 (12M)', value: `${(k.reorderRate * 100).toFixed(0)}%`, sub: `목표 ${(k.reorderTarget * 100).toFixed(0)}%`, tone: 'green' },
    { icon: Wallet, label: '수당풀/매출', value: `${(k.commissionRatio * 100).toFixed(1)}%`, sub: `법정상한 ${(k.commissionCeiling * 100).toFixed(0)}%`, tone: 'slate' },
  ];
  const toneMap: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-700',
    blue: 'bg-blue-50 text-blue-700',
    sky: 'bg-sky-50 text-sky-700',
    green: 'bg-green-50 text-green-700',
    slate: 'bg-slate-50 text-slate-700',
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className={`inline-flex items-center justify-center w-8 h-8 rounded-md mb-2 ${toneMap[c.tone]}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="text-xs text-gray-500">{c.label}</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">{c.value}</div>
            <div className="text-xs text-gray-500 mt-1">{c.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

function OrgTree() {
  const byParent = useMemo(() => {
    const m = new Map<string | null, Salesperson[]>();
    DUMMY.forEach((p) => {
      const arr = m.get(p.parentId) ?? [];
      arr.push(p);
      m.set(p.parentId, arr);
    });
    return m;
  }, []);

  const rd = DUMMY.find((p) => p.rank === 'RD')!;
  const bms = byParent.get(rd.id) ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
      <div className="flex flex-col items-center min-w-[800px] gap-4">
        <OrgNode person={rd} />
        <Connector />
        <div className="flex justify-around w-full gap-4">
          {bms.map((bm) => {
            const tls = byParent.get(bm.id) ?? [];
            return (
              <div key={bm.id} className="flex flex-col items-center flex-1 gap-3">
                <OrgNode person={bm} />
                <Connector />
                <div className="flex flex-wrap justify-center gap-3">
                  {tls.map((tl) => {
                    const ucs = byParent.get(tl.id) ?? [];
                    return (
                      <div key={tl.id} className="flex flex-col items-center gap-2">
                        <OrgNode person={tl} />
                        <div className="w-px h-3 bg-gray-300" />
                        <div className="flex flex-col gap-1">
                          {ucs.map((uc) => (
                            <OrgNode key={uc.id} person={uc} compact />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return <div className="w-px h-4 bg-gray-300" />;
}

function OrgNode({ person, compact = false }: { person: Salesperson; compact?: boolean }) {
  const meta = RANK_META[person.rank];
  if (compact) {
    return (
      <div className={`px-2 py-1 rounded ${meta.bg} ${meta.color} text-[11px] font-medium ring-1 ${meta.ring} whitespace-nowrap`}>
        {person.name} · {formatKRW(person.personalRevenue)}
      </div>
    );
  }
  return (
    <div className={`px-3 py-2 rounded-md ${meta.bg} ${meta.color} text-xs font-semibold ring-2 ${meta.ring} text-center min-w-[110px]`}>
      <div className="text-[10px] uppercase opacity-70">{meta.label}</div>
      <div className="text-sm">{person.name}</div>
      <div className="text-[11px] font-mono opacity-80 mt-0.5">{formatKRW(person.personalRevenue)}</div>
    </div>
  );
}

function SalespersonsTable() {
  const [query, setQuery] = useState('');
  const [rankFilter, setRankFilter] = useState<RankCode | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [sortKey, setSortKey] = useState<'personalRevenue' | 'groupRevenue' | 'monthlyCommission'>('monthlyCommission');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const parentName = (id: string | null) => (id ? DUMMY.find((p) => p.id === id)?.name ?? '-' : '-');

  const filtered = useMemo(() => {
    return DUMMY.filter((p) => {
      if (query && !p.name.includes(query)) return false;
      if (rankFilter !== 'all' && p.rank !== rankFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    }).sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [query, rankFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="p-3 border-b border-gray-200 flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 검색"
            className="pl-7 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={rankFilter}
          onChange={(e) => setRankFilter(e.target.value as RankCode | 'all')}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
        >
          <option value="all">직급 전체</option>
          {(['RD', 'BM', 'TL', 'SUC', 'UC', 'T'] as RankCode[]).map((r) => (
            <option key={r} value={r}>
              {RANK_META[r].label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | 'all')}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
        >
          <option value="all">상태 전체</option>
          <option value="active">활성</option>
          <option value="dormant">휴면</option>
          <option value="churned">이탈</option>
        </select>
        <div className="text-sm text-gray-500 ml-auto">총 {filtered.length}명</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">이름</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">직급</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">직속상위</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">입사월</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('personalRevenue')}>
                <span className="inline-flex items-center gap-1">본인매출 <ArrowUpDown className="w-3 h-3" /></span>
              </th>
              <th className="px-3 py-2 text-right font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('groupRevenue')}>
                <span className="inline-flex items-center gap-1">그룹매출 <ArrowUpDown className="w-3 h-3" /></span>
              </th>
              <th className="px-3 py-2 text-right font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('monthlyCommission')}>
                <span className="inline-flex items-center gap-1">이번달 수당 <ArrowUpDown className="w-3 h-3" /></span>
              </th>
              <th className="px-3 py-2 text-center font-semibold text-gray-700">90일 정착</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-700">상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const meta = RANK_META[p.rank];
              const sb = statusBadge(p.status);
              return (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{p.name}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${meta.bg} ${meta.color}`}>{meta.label}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{parentName(p.parentId)}</td>
                  <td className="px-3 py-2 text-gray-600 font-mono text-xs">{p.joinedMonth}</td>
                  <td className="px-3 py-2 text-right font-mono">{fullKRW(p.personalRevenue)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600">
                    {p.groupRevenue !== p.personalRevenue ? fullKRW(p.groupRevenue) : '-'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">{fullKRW(p.monthlyCommission)}</td>
                  <td className="px-3 py-2 text-center">{p.retained90d ? '✓' : '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${sb.cls}`}>{sb.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CommissionMatrix() {
  const [orderAmount, setOrderAmount] = useState(10_000_000);
  const totalRate = COMMISSION_RATES.reduce((s, c) => s + c.rate, 0);
  const companyMargin = 1 - totalRate;

  const rateColors: Record<string, string> = {
    direct: 'bg-orange-500',
    tier1: 'bg-blue-600',
    tier2: 'bg-sky-500',
    tier3: 'bg-cyan-500',
    mentor: 'bg-purple-500',
    pool: 'bg-amber-500',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Donut + breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-gray-900 mb-3">수당 분배 (매출 대비)</div>
        <div className="flex h-8 rounded-md overflow-hidden ring-1 ring-gray-200">
          {COMMISSION_RATES.map((c) => (
            <div
              key={c.key}
              className={`${rateColors[c.key]} flex items-center justify-center text-[10px] font-bold text-white`}
              style={{ width: `${c.rate * 100 / 0.5}%` }}
              title={`${c.label} ${c.rate * 100}%`}
            >
              {c.rate >= 0.04 ? `${(c.rate * 100).toFixed(1)}%` : ''}
            </div>
          ))}
          <div
            className="bg-gray-300 flex items-center justify-center text-[10px] font-bold text-gray-700"
            style={{ width: `${companyMargin * 100 / 0.5}%` }}
            title={`회사 ${companyMargin * 100}%`}
          >
            회사 {(companyMargin * 100).toFixed(0)}%
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {COMMISSION_RATES.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-xs">
              <div className={`w-3 h-3 rounded ${rateColors[c.key]}`} />
              <div className="flex-1 text-gray-700">
                <span className="font-semibold">{c.label}</span>
                <span className="text-gray-500 ml-1">— {c.target}</span>
              </div>
              <div className="font-mono text-gray-900">{(c.rate * 100).toFixed(1)}%</div>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs pt-1 border-t border-gray-200">
            <div className="w-3 h-3 rounded bg-gray-300" />
            <div className="flex-1 font-semibold text-gray-900">회사 마진 + 운영비</div>
            <div className="font-mono text-gray-900">{(companyMargin * 100).toFixed(0)}%</div>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-gray-500 leading-relaxed">
          ⚖️ 후원수당 합계 28% — 방문판매법상 35% 상한 대비 7%p 안전마진. 분기별 자동 모니터링 권장.
        </div>
      </div>

      {/* Calculator */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-gray-900 mb-3">매출 1건 → 수당 시뮬레이션</div>
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>주문 금액</span>
            <span className="font-mono font-semibold text-gray-900">{fullKRW(orderAmount)}</span>
          </div>
          <input
            type="range"
            min={1_000_000}
            max={100_000_000}
            step={500_000}
            value={orderAmount}
            onChange={(e) => setOrderAmount(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-gray-400 font-mono">
            <span>100만</span>
            <span>5천만</span>
            <span>1억</span>
          </div>
        </div>

        <div className="space-y-1.5">
          {COMMISSION_RATES.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-xs">
              <div className={`w-1 h-5 ${rateColors[c.key]} rounded`} />
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{c.label}</div>
                <div className="text-[10px] text-gray-500">{c.desc}</div>
              </div>
              <div className="text-right">
                <div className="font-mono font-semibold text-gray-900">{fullKRW(Math.round(orderAmount * c.rate))}</div>
                <div className="text-[10px] text-gray-500">{(c.rate * 100).toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-sm">
          <span className="font-semibold text-gray-900">수당 합계</span>
          <span className="font-mono font-bold text-orange-700">{fullKRW(Math.round(orderAmount * totalRate))}</span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-gray-600">회사 귀속 (마진+운영비)</span>
          <span className="font-mono text-gray-700">{fullKRW(Math.round(orderAmount * companyMargin))}</span>
        </div>
      </div>
    </div>
  );
}

function RankCardsSection() {
  const iconMap: Record<RankCode, React.ComponentType<{ className?: string }>> = {
    RD: Crown,
    BM: Shield,
    TL: Star,
    SUC: Award,
    UC: User,
    T: User,
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
      {RANK_CARDS.map((card) => {
        const meta = RANK_META[card.code];
        const Icon = iconMap[card.code];
        return (
          <div key={card.code} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-md ${meta.bg} ${meta.color} flex items-center justify-center`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className={`text-[10px] font-bold uppercase ${meta.color}`}>{card.code}</div>
                <div className="text-sm font-bold text-gray-900">{meta.label}</div>
              </div>
            </div>
            <div className="text-xs text-gray-600 italic mb-3">"{card.tagline}"</div>

            <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">승급 조건</div>
            <ul className="text-xs text-gray-700 space-y-0.5 mb-3">
              {card.promotion.map((p, i) => (
                <li key={i} className="flex gap-1"><span className="text-gray-400">·</span>{p}</li>
              ))}
            </ul>

            <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">권한</div>
            <ul className="text-xs text-gray-700 space-y-0.5 mb-3">
              {card.authorities.map((a, i) => (
                <li key={i} className="flex gap-1"><span className="text-gray-400">·</span>{a}</li>
              ))}
            </ul>

            <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">예상 월수익</div>
            <div className="text-sm font-mono font-bold text-orange-700 mb-3">₩{card.monthlyIncome}</div>

            <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">주요 KPI</div>
            <ul className="text-xs text-gray-700 space-y-0.5 mt-auto">
              {card.kpi.map((k, i) => (
                <li key={i} className="flex gap-1"><span className="text-gray-400">·</span>{k}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({ index, title, desc }: { index: number; title: string; desc: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-mono font-bold text-orange-600">SECTION {index}</span>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
    </div>
  );
}

// ========== Main ==========
export default function SalespersonsDashboard() {
  return (
    <div className="space-y-8">
      <section>
        <SectionHeader index={1} title="핵심 KPI" desc="이번 달 영업조직 헬스체크" />
        <KPICards />
      </section>

      <section>
        <SectionHeader index={2} title="조직 구조 (수도권 파일럿 30명)" desc="RD 1 + BM 3 + TL 5 + UC 21 — 노드의 숫자는 본인 월매출" />
        <OrgTree />
      </section>

      <section>
        <SectionHeader index={3} title="영업사원 명단" desc="직급·상태 필터, 매출/수당 정렬 가능" />
        <SalespersonsTable />
      </section>

      <section>
        <SectionHeader index={4} title="수수료·직급수당 매트릭스" desc="총 28% 후원수당 구조 + 매출 슬라이더로 실시간 계산" />
        <CommissionMatrix />
      </section>

      <section>
        <SectionHeader index={5} title="직급별 카드" desc="승급조건·권한·예상 월수익·KPI" />
        <RankCardsSection />
      </section>
    </div>
  );
}
