'use client';

import { useState } from 'react';
import {
  Package,
  Users as UsersIcon,
  Coins,
  TrendingUp,
  ArrowRight,
  ArrowDown,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Info,
  User,
  Award,
  Crown,
} from 'lucide-react';

const fmt = (n: number) => `₩${n.toLocaleString()}`;
const fmtShort = (n: number) =>
  n >= 100_000_000 ? `${(n / 100_000_000).toFixed(1)}억` : n >= 10_000_000 ? `${(n / 10_000_000).toFixed(1)}천만` : `${(n / 10_000).toLocaleString()}만`;

// ==========================================================
// 등급 정의 (단일 영업사원 트랙)
// ==========================================================
type GradeCode = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

interface Grade {
  code: GradeCode;
  name: string;
  rate: number;
  min: number;
  max: number | null;
  color: string;
  bg: string;
  ring: string;
  desc: string;
}

const GRADES: Grade[] = [
  { code: 'BRONZE', name: 'Bronze', rate: 0.10, min: 0, max: 3_000_000, color: 'text-amber-800', bg: 'bg-amber-100', ring: 'ring-amber-400', desc: '신입~안착 전 단계' },
  { code: 'SILVER', name: 'Silver', rate: 0.15, min: 3_000_000, max: 7_000_000, color: 'text-slate-700', bg: 'bg-slate-200', ring: 'ring-slate-400', desc: '안정기 — 정기 수입 발생' },
  { code: 'GOLD', name: 'Gold', rate: 0.18, min: 7_000_000, max: 15_000_000, color: 'text-yellow-800', bg: 'bg-yellow-100', ring: 'ring-yellow-500', desc: '우수 영업사원 — 본사 우선 리드' },
  { code: 'PLATINUM', name: 'Platinum', rate: 0.22, min: 15_000_000, max: 30_000_000, color: 'text-sky-800', bg: 'bg-sky-100', ring: 'ring-sky-500', desc: '톱 클래스 — 팀 리더 자격' },
  { code: 'DIAMOND', name: 'Diamond', rate: 0.25, min: 30_000_000, max: null, color: 'text-purple-800', bg: 'bg-purple-100', ring: 'ring-purple-500', desc: '레전드 — 본사 전략 파트너' },
];

const gradeOf = (avgRev: number): Grade => {
  for (let i = GRADES.length - 1; i >= 0; i--) {
    if (avgRev >= GRADES[i].min) return GRADES[i];
  }
  return GRADES[0];
};

// ==========================================================
// Section Wrapper
// ==========================================================
function GuideSection({ num, title, subtitle, children }: { num: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-200 pt-8">
      <div className="mb-5">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[11px] font-mono font-bold text-orange-600 tracking-wider">CHAPTER {num}</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

// ==========================================================
// Ch.1 한눈에 보기
// ==========================================================
function Ch1Overview() {
  const items = [
    { icon: Package, q: '무엇을 파나?', a: '단체복', d: '학교·기업·동호회·매장 단체주문. 5벌 ₩15만부터 1,000벌 ₩1억까지 폭넓은 단가대.' },
    { icon: UsersIcon, q: '누가 파나?', a: '영업사원 (위촉직)', d: '본사 직원 아닌 프리랜서 세일즈. 본인 인맥·시간으로 자율 영업. 등급별 차등 수수료.' },
    { icon: Coins, q: '수익은 어떻게?', a: '본인 매출의 10~25%', d: '실적 등급(Bronze~Diamond)에 따라 수수료율 차등. 후원수당·라인 구조 없음.' },
    { icon: TrendingUp, q: '어떻게 자라나?', a: '단계적 조직 확장', d: '시작은 영업사원 단일 트랙. 일정 규모 후 팀장/지점장 직책 도입(별도 직책급).' },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="w-9 h-9 rounded-md bg-orange-100 text-orange-700 flex items-center justify-center mb-3">
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-xs text-gray-500 mb-1">Q{i + 1}. {it.q}</div>
            <div className="text-base font-bold text-gray-900 mb-2">{it.a}</div>
            <div className="text-xs text-gray-600 leading-relaxed">{it.d}</div>
          </div>
        );
      })}
    </div>
  );
}

// ==========================================================
// Ch.2 영업사원 등급표
// ==========================================================
function Ch2GradeTable() {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-900 text-white">
          <div className="text-sm font-bold">5등급 누진 수수료제</div>
          <div className="text-xs text-gray-300 mt-0.5">직전 3개월 평균 본인매출로 자동 산정 — 매월 1일 갱신</div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">등급</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">3개월 평균 본인매출</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700">수수료율</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700">월매출 ₩1,000만 시</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">의미</th>
            </tr>
          </thead>
          <tbody>
            {GRADES.map((g) => (
              <tr key={g.code} className="border-t border-gray-100">
                <td className="px-4 py-3">
                  <span className={`px-3 py-1 rounded-md text-xs font-bold ring-2 ${g.bg} ${g.color} ${g.ring}`}>{g.name}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-700">
                  {fmtShort(g.min)} ~ {g.max ? fmtShort(g.max) : '∞'}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-orange-700 text-base">{(g.rate * 100).toFixed(0)}%</td>
                <td className="px-4 py-3 text-right font-mono text-gray-800">{fmt(10_000_000 * g.rate)}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{g.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs leading-relaxed text-blue-900">
          <div className="font-bold mb-2">왜 누진제인가</div>
          <ul className="space-y-1">
            <li>· 신입 보호 (Bronze 10%) — 큰 부담 없이 시작</li>
            <li>· 성장 동기 (Silver→Gold→Platinum) — 매출 늘면 수수료 비율 자체가 올라감</li>
            <li>· 우수자 보상 (Diamond 25%) — 평균의 5배 매출 = 1.5배 수수료</li>
            <li>· 자동 산정 — 사람 판단 없음, 분쟁 최소화</li>
          </ul>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-xs leading-relaxed text-orange-900">
          <div className="font-bold mb-2">후원수당 모델 대비 단순함</div>
          <ul className="space-y-1">
            <li>· 본인 매출 → 본인 수수료. 라인·하위 따질 필요 없음</li>
            <li>· 다단계 논란 자체 없음 (영업사원 = 자동차 딜러·정수기 코디와 동일)</li>
            <li>· 영업사원은 등급표 한 장만 보면 끝</li>
            <li>· 본사는 매출 × 등급 수수료율로 자동 계산</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ==========================================================
// Ch.3 조직 진화 4단계
// ==========================================================
function Ch3OrgEvolution() {
  const stages = [
    {
      stage: 'Stage 0',
      label: '시드',
      months: 'M0 ~ M3',
      size: '영업사원 5~10명',
      structure: '사업주 직접 관리. 영업사원 모두 동등(Bronze).',
      who: '사업주 1명 + 영업사원 5~10명',
      focus: '시장 검증 / 영업 스크립트 다듬기 / 실패 패턴 수집',
      compensation: '수수료 10% 균일 (Bronze 고정)',
      manager: '없음 — 사업주가 모든 영업사원 직접 코칭',
      color: 'bg-gray-100 border-gray-400',
      headerBg: 'bg-gray-700',
    },
    {
      stage: 'Stage 1',
      label: '등급제 도입',
      months: 'M4 ~ M9',
      size: '영업사원 10~30명',
      structure: '5등급제 본격 적용. 영업사원 등급별 수수료 차등.',
      who: '사업주 + 본사 영업운영팀(1~2명) + 영업사원 10~30명',
      focus: 'Bronze 졸업률·Silver 안착률 측정 / 본사 인사이드 리드 배정',
      compensation: 'Bronze 10% / Silver 15% / Gold 18% (Platinum/Diamond는 Stage 1에선 거의 없음)',
      manager: '여전히 본사 영업운영팀이 직접 관리',
      color: 'bg-blue-50 border-blue-400',
      headerBg: 'bg-blue-700',
    },
    {
      stage: 'Stage 2',
      label: '첫 팀장 등장',
      months: 'M10 ~ M18',
      size: '영업사원 30~80명',
      structure: 'Gold+ 영업사원 중 우수자 → 팀장 직책 부여 (선택). 팀장은 본인 영업도 계속.',
      who: '사업주 + 영업운영팀 + 팀장 2~5명 + 영업사원 30~80명',
      focus: '팀장 매니지먼트 역량 검증 / 신입 정착률 60% 도달',
      compensation: '영업사원: 5등급 그대로 / 팀장: 본인 등급 + 직책급 ₩50만 + 팀 매출 3% 인센티브',
      manager: '팀장이 직속 영업사원 5~10명 코칭. 사업주는 팀장만 관리.',
      color: 'bg-orange-50 border-orange-400',
      headerBg: 'bg-orange-700',
    },
    {
      stage: 'Stage 3',
      label: '다층 조직',
      months: 'M19+',
      size: '영업사원 80~300명+',
      structure: '지점장 등장. 권역별 분할.',
      who: '사업주 + 본부 + 지점장 3~5명 + 팀장 10~20명 + 영업사원 80~300명',
      focus: '권역 독점 / 전국화 / 신규 시장 카테고리 개척',
      compensation: '영업사원 등급제 + 팀장 직책급/인센티브 + 지점장 직책급 ₩200만 + 지점매출 2%',
      manager: '지점장 → 팀장 → 영업사원 3계층',
      color: 'bg-purple-50 border-purple-400',
      headerBg: 'bg-purple-700',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        <span className="font-bold">핵심: </span>
        처음부터 팀 구조 만들지 않음. <strong>Stage 0~1은 영업사원 단일 트랙</strong>. 30명+ 도달하면 우수자 중에서 팀장 자리 만듦.
        지점장은 Stage 3 이후. 단계 안 거치고 점프하면 무너짐.
      </div>

      {stages.map((s, idx) => (
        <div key={s.stage} className={`border-2 rounded-lg overflow-hidden ${s.color}`}>
          <div className={`px-4 py-3 ${s.headerBg} text-white flex items-center justify-between`}>
            <div>
              <div className="text-[10px] font-mono font-bold opacity-80">{s.stage}</div>
              <div className="text-base font-bold">{s.label}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono opacity-80">{s.months}</div>
              <div className="text-sm font-bold">{s.size}</div>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="font-semibold text-gray-900 mb-1">📋 구성원</div>
              <div className="text-gray-700 leading-relaxed">{s.who}</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">🎯 이 단계의 핵심 과제</div>
              <div className="text-gray-700 leading-relaxed">{s.focus}</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">💰 보상 구조</div>
              <div className="text-gray-700 leading-relaxed">{s.compensation}</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900 mb-1">👥 관리 체계</div>
              <div className="text-gray-700 leading-relaxed">{s.manager}</div>
            </div>
          </div>
          {/* 단계별 미니 조직도 */}
          <div className="px-4 pb-4">
            <StageOrgChart stage={idx} />
          </div>
        </div>
      ))}

      <div className="bg-gray-900 text-white rounded-lg p-4 text-xs leading-relaxed">
        <div className="font-bold text-orange-400 mb-2">단계 전환 트리거</div>
        <ul className="space-y-1 text-gray-200">
          <li>· <strong className="text-white">Stage 0 → 1</strong>: 영업사원 8명 도달 + 첫 Silver 등급 발생 (월매출 ₩300만+ 사례)</li>
          <li>· <strong className="text-white">Stage 1 → 2</strong>: 영업사원 25명+ + Gold 등급자 3명 이상 (팀장 후보 풀 확보)</li>
          <li>· <strong className="text-white">Stage 2 → 3</strong>: 팀 4개+ 안정 운영 + 권역 분할 매출 충분 (월매출 ₩10억+)</li>
        </ul>
      </div>
    </div>
  );
}

function StageOrgChart({ stage }: { stage: number }) {
  if (stage === 0) {
    return (
      <div className="bg-white rounded-md p-3 border border-gray-200">
        <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">조직도</div>
        <div className="flex flex-col items-center gap-2">
          <Node label="사업주" sub="직접 관리" big color="bg-gray-900 text-white" />
          <div className="w-px h-3 bg-gray-300" />
          <div className="flex gap-1.5 flex-wrap justify-center">
            {Array.from({ length: 7 }).map((_, i) => (
              <Node key={i} label={`영업${i + 1}`} sub="Bronze" color="bg-amber-100 text-amber-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (stage === 1) {
    return (
      <div className="bg-white rounded-md p-3 border border-gray-200">
        <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">조직도</div>
        <div className="flex flex-col items-center gap-2">
          <Node label="사업주 + 영업운영팀" sub="2~3명" big color="bg-gray-900 text-white" />
          <div className="w-px h-3 bg-gray-300" />
          <div className="flex gap-1.5 flex-wrap justify-center">
            {[
              { l: '영1', g: 'Gold', c: 'bg-yellow-100 text-yellow-800' },
              { l: '영2', g: 'Gold', c: 'bg-yellow-100 text-yellow-800' },
              { l: '영3', g: 'Silver', c: 'bg-slate-200 text-slate-800' },
              { l: '영4', g: 'Silver', c: 'bg-slate-200 text-slate-800' },
              { l: '영5', g: 'Silver', c: 'bg-slate-200 text-slate-800' },
              { l: '영6', g: 'Bronze', c: 'bg-amber-100 text-amber-800' },
              { l: '영7', g: 'Bronze', c: 'bg-amber-100 text-amber-800' },
              { l: '영8', g: 'Bronze', c: 'bg-amber-100 text-amber-800' },
              { l: '영9', g: 'Bronze', c: 'bg-amber-100 text-amber-800' },
              { l: '영10+', g: 'Bronze', c: 'bg-amber-100 text-amber-800' },
            ].map((p, i) => (
              <Node key={i} label={p.l} sub={p.g} color={p.c} />
            ))}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">사업주가 모든 영업사원 직접 또는 영업운영팀 통해 관리</div>
        </div>
      </div>
    );
  }
  if (stage === 2) {
    return (
      <div className="bg-white rounded-md p-3 border border-gray-200">
        <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">조직도</div>
        <div className="flex flex-col items-center gap-2">
          <Node label="사업주" sub="" big color="bg-gray-900 text-white" />
          <div className="w-px h-3 bg-gray-300" />
          <div className="flex gap-3 justify-center flex-wrap">
            {['팀장 A', '팀장 B', '팀장 C'].map((tm) => (
              <div key={tm} className="flex flex-col items-center gap-1">
                <Node label={tm} sub="Gold+" color="bg-orange-200 text-orange-900 ring-2 ring-orange-500" />
                <div className="w-px h-2 bg-gray-300" />
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Node key={i} label="" sub="" tiny color="bg-amber-100" />
                  ))}
                </div>
                <div className="text-[9px] text-gray-500">5~8명</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  // stage 3
  return (
    <div className="bg-white rounded-md p-3 border border-gray-200">
      <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">조직도</div>
      <div className="flex flex-col items-center gap-2">
        <Node label="사업주 + 본부" big color="bg-gray-900 text-white" />
        <div className="w-px h-3 bg-gray-300" />
        <div className="flex gap-4 flex-wrap justify-center">
          {['지점 A', '지점 B', '지점 C'].map((br) => (
            <div key={br} className="flex flex-col items-center gap-1">
              <Node label={br} sub="지점장" color="bg-purple-200 text-purple-900 ring-2 ring-purple-500" />
              <div className="w-px h-2 bg-gray-300" />
              <div className="flex gap-2">
                {['T1', 'T2'].map((t) => (
                  <div key={t} className="flex flex-col items-center gap-0.5">
                    <Node label={t} sub="팀장" color="bg-orange-200 text-orange-900" tiny />
                    <div className="flex gap-0.5">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Node key={i} label="" sub="" tiny color="bg-amber-100" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Node({ label, sub, color, big, tiny }: { label: string; sub?: string; color: string; big?: boolean; tiny?: boolean }) {
  if (tiny) return <div className={`w-3 h-3 rounded-sm ${color}`} title={label} />;
  return (
    <div className={`px-2 py-1 rounded ${color} ${big ? 'text-sm font-bold' : 'text-[10px] font-semibold'} text-center`}>
      <div>{label}</div>
      {sub && <div className="text-[9px] opacity-80">{sub}</div>}
    </div>
  );
}

// ==========================================================
// Ch.4 다양한 매출 시나리오 (₩15만 ~ ₩1억)
// ==========================================================
function Ch4RevenueScenarios() {
  // 작은 단가일수록 원가율 높음 (배송·포장비 비중 ↑), 큰 단가일수록 원가율 ↓
  const scenarios = [
    { rev: 150_000, customer: '소형 동호회 5벌 응원티', context: '풋살팀이 시즌 응원티 단체 주문', cogsRate: 0.55, qty: 5 },
    { rev: 300_000, customer: '마라톤 동호회 10벌 티', context: '연말 송년 대회용 단체티', cogsRate: 0.5, qty: 10 },
    { rev: 600_000, customer: '카페 직원 유니폼 8벌', context: '신규 매장 오픈 직원 유니폼', cogsRate: 0.46, qty: 8 },
    { rev: 1_200_000, customer: '헬스장 직원 유니폼 15벌', context: '브랜드 통일 — 폴로 + 자수', cogsRate: 0.43, qty: 15 },
    { rev: 2_500_000, customer: '학교 동아리 단체복 30벌', context: '체육복 + 자수 + 네임마킹', cogsRate: 0.42, qty: 30 },
    { rev: 5_000_000, customer: '중규모 기업 워크샵 100벌', context: '연수원 워크샵용 캐주얼 티', cogsRate: 0.41, qty: 100 },
    { rev: 10_000_000, customer: '학교 체육복 200벌', context: '신학기 신입생 체육복 일괄', cogsRate: 0.4, qty: 200 },
    { rev: 30_000_000, customer: '중견기업 워크웨어 500벌', context: '공장 직원 유니폼 + 안전조끼', cogsRate: 0.38, qty: 500 },
    { rev: 100_000_000, customer: '프랜차이즈 본사 통합 발주 1,500벌', context: '가맹점 50개 × 30벌 일괄', cogsRate: 0.35, qty: 1500 },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        <span className="font-bold">읽는 법: </span>
        매출 1건마다 등급별로 영업사원이 받는 수수료가 다름. 작은 단가는 원가율이 높아 본사 마진이 작고, 큰 단가는 마진이 큼.
        실제 영업사원이 마주칠 다양한 단가대를 9개 시나리오로 정리.
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">매출</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">고객 시나리오</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-700">원가</th>
              <th className="px-3 py-2 text-right font-semibold text-amber-700">B 10%</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">S 15%</th>
              <th className="px-3 py-2 text-right font-semibold text-yellow-700">G 18%</th>
              <th className="px-3 py-2 text-right font-semibold text-sky-700">P 22%</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-700">D 25%</th>
              <th className="px-3 py-2 text-right font-semibold text-green-700">본사 마진<sup className="text-[8px]">①</sup></th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => {
              const cogs = s.rev * s.cogsRate;
              return (
                <tr key={s.rev} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono font-bold text-gray-900">{fmt(s.rev)}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-gray-900">{s.customer}</div>
                    <div className="text-[10px] text-gray-500">{s.context}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-red-600">
                    {fmt(Math.round(cogs))}
                    <div className="text-[10px] opacity-70">{(s.cogsRate * 100).toFixed(0)}%</div>
                  </td>
                  {GRADES.map((g) => (
                    <td key={g.code} className="px-3 py-2 text-right font-mono text-gray-800">
                      {fmt(Math.round(s.rev * g.rate))}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-bold text-green-700">
                    {fmt(Math.round(s.rev - cogs - s.rev * 0.18))}
                    <div className="text-[10px] opacity-70">@Gold</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-[10px] text-gray-500">
          ① 본사 마진 = 매출 - 원가 - Gold 18% 수수료 (운영비 별도). 시나리오 단순화 위해 Gold 기준.
        </div>
      </div>

      {/* 시나리오 카드 - 작은 단가 vs 큰 단가 비교 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
          <div className="text-xs font-bold text-amber-900 mb-2">소액 단가의 함정</div>
          <div className="text-[11px] text-amber-900 space-y-1.5 leading-relaxed">
            <p>₩15만 주문 한 건은 영업사원에게 Gold 기준 ₩27,000 수수료. 30분 상담만으로 끝낼 게 아니면 시간 대비 비효율.</p>
            <p className="font-bold">→ 소액 단가는 "쉬운 첫 거래" 또는 "추천 트리거"로만 활용. 본 게임은 ₩100만+ 거래.</p>
          </div>
        </div>
        <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
          <div className="text-xs font-bold text-blue-900 mb-2">중간 단가가 황금</div>
          <div className="text-[11px] text-blue-900 space-y-1.5 leading-relaxed">
            <p>₩250만~1,000만 단가가 가장 균형 좋음. 시간 대비 수수료, 결정권자 설득 난이도, 재발주 가능성 모두 적정.</p>
            <p className="font-bold">→ 영업사원이 집중해야 할 핵심 단가대.</p>
          </div>
        </div>
        <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
          <div className="text-xs font-bold text-purple-900 mb-2">대형 단가는 본사 직접</div>
          <div className="text-[11px] text-purple-900 space-y-1.5 leading-relaxed">
            <p>₩3,000만+ 거래는 협상·계약·납기 리스크 큼. 영업사원 위임 시 클레임·반품 시 손실 ↑.</p>
            <p className="font-bold">→ 사업주/본사 영업팀이 직접 클로징, 발견한 영업사원에겐 추천 보너스(고정금)만.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================================
// Ch.5 단일 거래 → 수수료 시뮬레이터
// ==========================================================
function Ch5Simulator() {
  const [order, setOrder] = useState(2_500_000);
  const [grade, setGrade] = useState<GradeCode>('SILVER');

  const selectedGrade = GRADES.find((g) => g.code === grade)!;
  const commission = order * selectedGrade.rate;
  const net = commission * 0.967; // 3.3% 원천징수

  // 작은 단가일수록 원가율 ↑
  const cogsRate = order < 200_000 ? 0.55 : order < 500_000 ? 0.5 : order < 1_000_000 ? 0.46 : order < 3_000_000 ? 0.42 : order < 10_000_000 ? 0.4 : 0.35;
  const cogs = order * cogsRate;
  const companyMargin = order - cogs - commission;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="text-sm font-bold text-gray-900 mb-3">슬라이더로 직접 확인</div>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>주문 금액</span>
            <span className="font-mono font-bold text-gray-900 text-base">{fmt(order)}</span>
          </div>
          <input
            type="range"
            min={100_000}
            max={100_000_000}
            step={50_000}
            value={order}
            onChange={(e) => setOrder(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-1">
            <span>10만</span>
            <span>100만</span>
            <span>1,000만</span>
            <span>1억</span>
          </div>
        </div>

        <div className="mb-2 text-xs font-semibold text-gray-700">영업사원 등급 선택</div>
        <div className="flex gap-2 flex-wrap mb-4">
          {GRADES.map((g) => (
            <button
              key={g.code}
              onClick={() => setGrade(g.code)}
              className={`px-3 py-2 rounded-md text-xs font-bold transition-all ${
                grade === g.code ? `${g.bg} ${g.color} ring-2 ${g.ring}` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {g.name} {(g.rate * 100).toFixed(0)}%
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-3 border-t border-gray-200">
          <Stat label="영업사원 수수료" value={fmt(Math.round(commission))} sub={`매출의 ${(selectedGrade.rate * 100).toFixed(0)}%`} color="text-orange-700" />
          <Stat label="3.3% 원천징수 후 실수령" value={fmt(Math.round(net))} sub="사업소득 처리" color="text-blue-700" />
          <Stat label="원가 (제품)" value={fmt(Math.round(cogs))} sub={`${(cogsRate * 100).toFixed(0)}%`} color="text-red-600" />
          <Stat label="본사 매출이익" value={fmt(Math.round(companyMargin))} sub={`매출의 ${((companyMargin / order) * 100).toFixed(1)}%`} color="text-green-700" />
        </div>

        <div className="mt-3 text-[11px] text-gray-500 leading-relaxed">
          ※ 본사 매출이익 = 매출 - 원가 - 수수료. 운영비(인건비/사무실/마케팅)는 별도. 운영비 차감 후 영업이익은 ch9 BEP 시뮬레이터에서 확인.
        </div>
      </div>

      {/* 등급별 비교 막대 */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm font-bold text-gray-900 mb-3">현재 주문 {fmt(order)} — 등급별 수수료 비교</div>
        <div className="space-y-2">
          {GRADES.map((g) => {
            const c = order * g.rate;
            const max = order * 0.25;
            return (
              <div key={g.code} className="flex items-center gap-3">
                <div className="w-20 text-xs font-bold text-gray-700">{g.name}</div>
                <div className="flex-1 bg-gray-100 rounded h-7 relative overflow-hidden">
                  <div
                    className={`absolute top-0 left-0 h-full ${g.bg.replace('100', '300').replace('200', '400')} rounded flex items-center justify-end px-2`}
                    style={{ width: `${(c / max) * 100}%` }}
                  >
                    <span className="text-xs font-mono font-bold text-gray-900">{(g.rate * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="w-28 text-right font-mono text-sm font-bold text-gray-900">{fmt(Math.round(c))}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
      <div className="text-[10px] font-semibold text-gray-500 uppercase">{label}</div>
      <div className={`text-base font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500">{sub}</div>
    </div>
  );
}

// ==========================================================
// Ch.6 영업 6단계
// ==========================================================
function Ch6SalesPipeline() {
  const stages = [
    { n: 1, name: '탐색·접촉', days: '1~7일', conv: 50, desc: '리드 발굴, 첫 연락, 니즈 파악' },
    { n: 2, name: '제안·견적', days: '1~3일', conv: 70, desc: '시안 + 견적서 발행' },
    { n: 3, name: '시안·샘플', days: '3~7일', conv: 60, desc: '실물 또는 목업 컨펌' },
    { n: 4, name: '계약·계약금', days: '1~3일', conv: 80, desc: '계약 체결 + 계약금 30%' },
    { n: 5, name: '생산·배송', days: '7~14일', conv: null, desc: '생산 + 잔금 + 납품' },
    { n: 6, name: '추천·재구매', days: '영구', conv: 20, desc: '만족 고객 → 새 리드' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
      <div className="flex items-stretch gap-2 min-w-[800px]">
        {stages.map((s, i) => (
          <div key={s.n} className="flex items-stretch flex-1">
            <div className="flex-1 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-md p-3 flex flex-col">
              <div className="text-[10px] font-mono font-bold text-blue-700">STAGE {s.n}</div>
              <div className="text-sm font-bold text-gray-900">{s.name}</div>
              <div className="text-[11px] text-gray-500 mt-1 font-mono">{s.days}</div>
              <div className="text-[11px] text-gray-700 mt-2 leading-tight">{s.desc}</div>
              {s.conv !== null && <div className="mt-auto pt-2 text-[10px] text-blue-700 font-bold">전환율 {s.conv}%</div>}
            </div>
            {i < stages.length - 1 && (
              <div className="flex items-center px-1">
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-700">
        <span className="font-semibold">총 첫 컨택 → 수주 전환율: </span>
        <span className="font-mono">50% × 70% × 60% × 80% = </span>
        <span className="font-mono font-bold text-blue-700">16.8%</span>
        <span className="text-gray-500"> · Stage 6 추천 20%가 자가증식 엔진</span>
      </div>
    </div>
  );
}

// ==========================================================
// Ch.7 페르소나
// ==========================================================
function Ch7Personas() {
  const personas = [
    { title: '경단녀 30~40대 여성', pool: '학부모회·동네 동호회·맘카페', strong: '학교·동호회·매장', reason: '시간 자유도 높고 학부모 네트워크는 신뢰 기반. 작은 단가(₩15~30만)부터 천천히 안착.' },
    { title: '시니어 50~60대 은퇴자', pool: '협회·동창회·교회·로타리', strong: '기업·동호회', reason: '영업 경험·인맥 두터움. ₩100만+ 단가 빠르게 도달 가능.' },
    { title: '댄서·운동 강사', pool: '댄스학원·공연팀·피트니스', strong: '동호회·매장', reason: '본인이 단체복 핵심 고객. SNS·디자인 감각 우수. 시즌별 반복 발주.' },
    { title: '보험설계사 부업', pool: '기존 보험 고객 DB', strong: '기업 인사·총무', reason: '영업 스킬·DB 보유. 보험 권유 못 한 고객 우회 부수입.' },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {personas.map((p, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-bold text-gray-900 mb-3">{i + 1}. {p.title}</div>
          <dl className="space-y-2 text-xs">
            <div>
              <dt className="text-[10px] font-semibold text-gray-500 uppercase">보유 인맥</dt>
              <dd className="text-gray-800">{p.pool}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-gray-500 uppercase">강점 시장</dt>
              <dd className="text-gray-800">{p.strong}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold text-gray-500 uppercase">왜 잘 맞나</dt>
              <dd className="text-gray-700 leading-relaxed">{p.reason}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

// ==========================================================
// Ch.8 한 사람의 18개월 여정 (등급제 기반)
// ==========================================================
function Ch8Journey() {
  const journey = [
    { m: 'M0', grade: 'BRONZE', rev: 0, income: 0, event: '입사. 멘토 매칭. 5일 입문교육. 본사 리드 3건 배정.' },
    { m: 'M1', grade: 'BRONZE', rev: 1_500_000, income: 150_000, event: '첫 수주 (₩300만 학교 동아리). 수수료 10%' },
    { m: 'M2', grade: 'BRONZE', rev: 2_400_000, income: 240_000, event: '연고 영업 본격. 3건 수주.' },
    { m: 'M3', grade: 'BRONZE', rev: 3_500_000, income: 350_000, event: '평균 ₩2.5M (Bronze)' },
    { m: 'M4', grade: 'SILVER', rev: 4_500_000, income: 675_000, event: '✅ Silver 승급 (3개월 평균 ₩300만 돌파). 수수료 15%' },
    { m: 'M5', grade: 'SILVER', rev: 5_200_000, income: 780_000, event: '재발주 첫 발생.' },
    { m: 'M6', grade: 'SILVER', rev: 6_500_000, income: 975_000, event: '월매출 점진적 ↑' },
    { m: 'M7', grade: 'SILVER', rev: 7_800_000, income: 1_170_000, event: '평균 ₩6.5M' },
    { m: 'M8', grade: 'GOLD', rev: 8_500_000, income: 1_530_000, event: '✅ Gold 승급. 수수료 18% + 본사 우선 리드' },
    { m: 'M9', grade: 'GOLD', rev: 9_500_000, income: 1_710_000, event: '인바운드 리드 매주 1~2건 추가 배정' },
    { m: 'M10', grade: 'GOLD', rev: 10_500_000, income: 1_890_000, event: '월매출 1,000만 돌파' },
    { m: 'M11', grade: 'GOLD', rev: 11_500_000, income: 2_070_000, event: '단가 ₩300만+ 거래 비중 60%' },
    { m: 'M12', grade: 'GOLD', rev: 13_000_000, income: 2_340_000, event: '평균 ₩11.7M' },
    { m: 'M13', grade: 'GOLD', rev: 14_500_000, income: 2_610_000, event: 'Platinum 직전' },
    { m: 'M14', grade: 'PLATINUM', rev: 16_000_000, income: 3_520_000, event: '✅ Platinum 승급 (평균 ₩1,500만 돌파). 22%' },
    { m: 'M15', grade: 'PLATINUM', rev: 17_500_000, income: 3_850_000, event: '팀장 직책 제안 (선택). 본인은 영업 집중 선택.' },
    { m: 'M16', grade: 'PLATINUM', rev: 18_500_000, income: 4_070_000, event: '대형 거래 첫 수주 (₩3,000만 워크웨어)' },
    { m: 'M17', grade: 'PLATINUM', rev: 20_000_000, income: 4_400_000, event: '재발주 비중 35%' },
    { m: 'M18', grade: 'PLATINUM', rev: 22_000_000, income: 4_840_000, event: '안정 Platinum. Diamond 도전 또는 팀장 전환 고민.' },
  ];

  const maxRev = Math.max(...journey.map((j) => j.rev));
  const events = ['M1', 'M4', 'M8', 'M14'];

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-xs font-bold text-gray-500 uppercase mb-2">등급 변화</div>
        <div className="flex h-10 rounded-md overflow-hidden ring-1 ring-gray-300">
          <div className="bg-amber-200 flex items-center justify-center text-xs font-bold text-amber-900" style={{ width: `${(4 / 19) * 100}%` }}>Bronze (M0~M3)</div>
          <div className="bg-slate-300 flex items-center justify-center text-xs font-bold text-slate-900" style={{ width: `${(4 / 19) * 100}%` }}>Silver (M4~M7)</div>
          <div className="bg-yellow-200 flex items-center justify-center text-xs font-bold text-yellow-900" style={{ width: `${(6 / 19) * 100}%` }}>Gold (M8~M13)</div>
          <div className="bg-sky-200 flex items-center justify-center text-xs font-bold text-sky-900" style={{ width: `${(5 / 19) * 100}%` }}>Platinum (M14~M18)</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-xs font-bold text-gray-500 uppercase mb-3">월별 본인매출 (천원 단위)</div>
        <div className="flex items-end gap-1 h-32">
          {journey.map((j) => {
            const g = GRADES.find((x) => x.code === j.grade)!;
            return (
              <div key={j.m} className="flex-1 min-w-[28px] flex flex-col items-center gap-1">
                <div className="text-[9px] font-mono text-gray-700">{j.rev > 0 ? Math.round(j.rev / 1000).toLocaleString() : ''}</div>
                <div
                  className={`w-full rounded-t ${g.bg.replace('100', '300').replace('200', '400')}`}
                  style={{ height: `${(j.rev / maxRev) * 80}%`, minHeight: j.rev > 0 ? '4px' : '0' }}
                />
                <div className={`text-[9px] font-mono ${events.includes(j.m) ? 'text-orange-600 font-bold' : 'text-gray-500'}`}>{j.m}</div>
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-gray-500 mt-2">주황 라벨 = 첫 수주 / 등급 승급 시점</div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-bold text-gray-900">월별 상세</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">시점</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-700">등급</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">본인매출</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">수수료(월수입)</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">이벤트</th>
              </tr>
            </thead>
            <tbody>
              {journey.map((j) => {
                const g = GRADES.find((x) => x.code === j.grade)!;
                return (
                  <tr key={j.m} className={`border-t border-gray-100 ${events.includes(j.m) ? 'bg-orange-50' : ''}`}>
                    <td className="px-3 py-1.5 font-mono font-bold text-gray-900">{j.m}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${g.bg} ${g.color}`}>{g.name}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-700">{j.rev > 0 ? fmt(j.rev) : '-'}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-gray-900">{j.income > 0 ? fmt(j.income) : '-'}</td>
                    <td className="px-3 py-1.5 text-gray-700">{j.event}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs leading-relaxed text-blue-900">
        <div className="font-bold mb-2">이 여정에서 보이는 패턴</div>
        <ul className="space-y-1">
          <li>· <strong>Bronze (M0~M3)</strong>: 학습기. 월수입 ~35만. 부수입 수준.</li>
          <li>· <strong>Silver (M4~M7)</strong>: 안정기. 월수입 70~120만. 부업 의미 본격화.</li>
          <li>· <strong>Gold (M8~M13)</strong>: 본업화. 월수입 150~234만. UC 평균 도달.</li>
          <li>· <strong>Platinum (M14~)</strong>: 톱 클래스. 월수입 350~480만. 팀장 자격.</li>
        </ul>
      </div>
    </div>
  );
}

// ==========================================================
// Ch.9 BEP 시뮬레이터
// ==========================================================
function Ch9BEP() {
  const [monthlyRev, setMonthlyRev] = useState(500_000_000);
  const [avgGradeRate, setAvgGradeRate] = useState(0.15);

  const cogsRate = 0.41;
  const variableTotal = cogsRate + avgGradeRate + 0.022;

  const fixed = [
    { name: '본사 인건비', detail: 'CEO + 운영팀 5~8명', amount: 50_000_000 },
    { name: '사무실 임대', detail: '서울권 1곳', amount: 8_000_000 },
    { name: 'IT/CRM 시스템', detail: 'SaaS·서버·라이선스', amount: 4_000_000 },
    { name: '마케팅', detail: '영업사원 모집 + 고객 인바운드', amount: 20_000_000 },
    { name: '회계·법무·세무', detail: '아웃소싱', amount: 3_000_000 },
  ];
  const fixedSum = fixed.reduce((s, f) => s + f.amount, 0);

  const variableCost = monthlyRev * variableTotal;
  const profit = monthlyRev - variableCost - fixedSum;
  const profitMargin = profit / monthlyRev;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>월매출</span>
              <span className="font-mono font-bold text-gray-900">{fmt(monthlyRev)}</span>
            </div>
            <input type="range" min={50_000_000} max={2_000_000_000} step={10_000_000} value={monthlyRev} onChange={(e) => setMonthlyRev(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>평균 수수료율 (조직 평균 등급)</span>
              <span className="font-mono font-bold text-gray-900">{(avgGradeRate * 100).toFixed(1)}%</span>
            </div>
            <input type="range" min={0.1} max={0.25} step={0.005} value={avgGradeRate} onChange={(e) => setAvgGradeRate(Number(e.target.value))} className="w-full" />
            <div className="flex justify-between text-[10px] text-gray-400 font-mono">
              <span>10% (Bronze)</span>
              <span>15% (Silver)</span>
              <span>18% (Gold)</span>
              <span>25% (D)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="월매출" value={fmt(monthlyRev)} sub="100%" color="text-gray-900" />
        <Stat label="변동비 합" value={fmt(variableCost)} sub={`${(variableTotal * 100).toFixed(1)}%`} color="text-red-600" />
        <Stat label="고정비" value={fmt(fixedSum)} sub={`${((fixedSum / monthlyRev) * 100).toFixed(1)}%`} color="text-red-600" />
        <Stat label="영업이익" value={fmt(profit)} sub={`${(profitMargin * 100).toFixed(1)}%`} color={profit > 0 ? 'text-green-700' : 'text-red-700'} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-sm font-bold text-blue-900">고정비 — 월 {fmt(fixedSum)}</div>
        <table className="w-full text-xs">
          <tbody>
            {fixed.map((f) => (
              <tr key={f.name} className="border-t border-gray-100">
                <td className="px-3 py-1.5">
                  <div className="font-semibold text-gray-900">{f.name}</div>
                  <div className="text-[10px] text-gray-500">{f.detail}</div>
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-bold text-gray-900">{fmt(f.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs leading-relaxed text-amber-900">
        <div className="font-bold mb-2">단순 등급제 모델의 BEP 인사이트</div>
        <ul className="space-y-1">
          <li>· 평균 수수료 15% 가정: 월매출 ~₩2억에서 BEP. 5억일 때 영업이익 ~16%.</li>
          <li>· 평균 수수료 18% 가정 (조직 성숙): 월매출 ~₩2.3억 BEP. 5억일 때 ~13%.</li>
          <li>· 후원수당 28% 모델 대비 영업이익 5~8%p 더 높음.</li>
          <li>· 단, 평균 수수료가 등급 분포에 따라 달라짐 — Bronze 비중이 높을수록 평균 ↓.</li>
        </ul>
      </div>
    </div>
  );
}

// ==========================================================
// Ch.10 모집 깔때기
// ==========================================================
function Ch10Funnel() {
  const stages = [
    { label: '광고 노출', n: 100_000, w: 100 },
    { label: '랜딩 방문', n: 1_000, w: 80, conv: 'CTR 1%' },
    { label: '설명회 신청', n: 50, w: 60, conv: '5%' },
    { label: '설명회 참석', n: 30, w: 45, conv: '60%' },
    { label: '가입 (Bronze)', n: 15, w: 30, conv: '50%' },
    { label: '3개월 활성', n: 9, w: 18, conv: '60%' },
  ];
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-sm font-bold text-gray-900 mb-3">모집 깔때기 (월 1,000만원 광고 가정)</div>
      <div className="space-y-1">
        {stages.map((s, i) => (
          <div key={i}>
            <div
              className="bg-gradient-to-r from-orange-400 to-orange-500 h-9 rounded flex items-center justify-center text-xs font-bold text-white"
              style={{ width: `${s.w}%` }}
            >
              {s.label}: {s.n.toLocaleString()}
            </div>
            {s.conv && <div className="text-[10px] text-gray-500 text-center font-mono py-0.5">↓ {s.conv}</div>}
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-700">
        활성 영업사원 1명 확보 비용 (CPA): <span className="font-mono font-bold text-orange-700">약 ₩1,111,000</span>
      </div>
    </div>
  );
}

// ==========================================================
// Ch.11 KPI
// ==========================================================
function Ch11KPI() {
  const kpis = [
    { name: '월 총매출', target: '단계별 게이트', why: '전체 헬스 1순위' },
    { name: '활성 영업사원 수', target: 'Stage1: 30 / Stage2: 80', why: '조직 성장 추적' },
    { name: 'Bronze 졸업률 (3개월 내 Silver 진입)', target: '≥ 50%', why: '교육·온보딩 품질' },
    { name: '90일 정착률', target: '≥ 60%', why: '보험업 평균 30% 대비' },
    { name: '재발주율 12개월', target: '≥ 30%', why: 'LTV 핵심' },
    { name: '평균 등급 분포', target: 'Silver+ 비중 60%', why: '조직 성숙도' },
    { name: 'NPS', target: '≥ 70', why: '추천 발생률' },
  ];
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="divide-y divide-gray-100">
        {kpis.map((k) => (
          <div key={k.name} className="p-3 grid grid-cols-12 gap-2">
            <div className="col-span-12 md:col-span-5 text-sm font-bold text-gray-900">{k.name}</div>
            <div className="col-span-6 md:col-span-3 text-xs font-mono text-orange-700">{k.target}</div>
            <div className="col-span-6 md:col-span-4 text-xs text-gray-500">{k.why}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================================
// Ch.12 세금
// ==========================================================
function Ch12Tax() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white border-2 border-blue-200 rounded-lg p-5">
        <div className="text-xs font-bold text-blue-700 uppercase mb-1">영업사원 입장</div>
        <div className="text-base font-bold text-gray-900 mb-3">사업소득자 — 위촉 프리랜서</div>
        <div className="space-y-3 text-xs">
          <div>
            <div className="font-semibold text-gray-900 mb-1">세무 처리</div>
            <ul className="space-y-1 text-gray-700">
              <li>· 본사가 수수료 지급 시 <span className="font-mono font-bold text-blue-700">3.3% 원천징수</span></li>
              <li>· 매년 5월 종합소득세 본인 신고</li>
              <li>· 4대보험 본사 가입 X (지역가입자)</li>
              <li>· 차량비·식대 등 사업경비 신고 가능</li>
            </ul>
          </div>
          <div className="bg-blue-50 rounded-md p-3 border border-blue-100">
            <div className="font-bold text-blue-900 mb-2">예시 — Gold 영업사원 월 ₩1,800,000 수수료</div>
            <table className="w-full text-[11px]">
              <tbody>
                <tr><td className="py-0.5">본사 수수료</td><td className="py-0.5 text-right font-mono">₩1,800,000</td></tr>
                <tr><td className="py-0.5">3.3% 원천징수</td><td className="py-0.5 text-right font-mono text-red-600">- ₩59,400</td></tr>
                <tr className="border-t border-blue-200"><td className="py-1 font-bold">실수령</td><td className="py-1 text-right font-mono font-bold">₩1,740,600</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="bg-white border-2 border-orange-200 rounded-lg p-5">
        <div className="text-xs font-bold text-orange-700 uppercase mb-1">본사 입장</div>
        <div className="text-base font-bold text-gray-900 mb-3">매출 1건 = ₩10,000,000 기준</div>
        <div className="space-y-2 text-xs mb-3">
          <CostBar label="원가 (COGS)" pct={41} amount={4_100_000} desc="원단·인쇄·자수·배송" color="bg-orange-300" />
          <CostBar label="영업사원 수수료 (Gold 18% 가정)" pct={18} amount={1_800_000} desc="등급별 차등" color="bg-blue-300" />
          <CostBar label="운영비" pct={21} amount={2_100_000} desc="인건비·사무실·IT·마케팅" color="bg-gray-300" />
          <CostBar label="영업이익" pct={20} amount={2_000_000} desc="회사 순이익" color="bg-green-400" />
        </div>
        <div className="bg-orange-50 rounded-md p-3 border border-orange-100 text-xs text-orange-900">
          <span className="font-bold">단순 등급제의 효과: </span>
          후원수당 28% 모델 대비 수수료가 18%로 감소. 영업이익이 10% → 20%로 ↑. 단, 큰 조직 성장 속도는 후원수당 모델보다 느릴 수 있음.
        </div>
      </div>
    </div>
  );
}

function CostBar({ label, pct, amount, desc, color }: { label: string; pct: number; amount: number; desc: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`${color} h-7 rounded flex items-center justify-end px-2 text-[10px] font-bold text-gray-800`} style={{ width: `${pct}%` }}>
        {pct}%
      </div>
      <div className="flex-1">
        <div className="font-semibold text-gray-900">{label}</div>
        <div className="text-[10px] text-gray-500">{desc}</div>
      </div>
      <div className="font-mono font-bold text-gray-900">{fmt(amount)}</div>
    </div>
  );
}

// ==========================================================
// Ch.14 매출 귀속 메커니즘 (Attribution)
// ==========================================================
function Ch14Attribution() {
  const channels = [
    {
      name: '온라인 견적 — 영업사원 고유 링크',
      flow: '영업사원이 본인 코드(SR-A1B2C3) 박힌 링크를 고객에게 전달 → 고객이 사이트에서 견적 신청 → 시스템이 자동으로 영업사원에게 귀속',
      tools: ['모두의 유니폼 사이트', '영업사원 모바일앱'],
      strength: '가장 명확. 분쟁 없음. 자동 추적.',
      coverage: '예상 60%',
      color: 'bg-blue-50 border-blue-300',
    },
    {
      name: '오프라인 — 견적서 직접 발행',
      flow: '영업사원이 모바일앱에서 고객 정보 + 단가 입력 → PDF 견적서 자동 생성 (영업사원 코드 박힘) → 고객이 결제 시 그 견적서 ID로 자동 연결',
      tools: ['영업사원 모바일앱', 'CRM'],
      strength: '오프라인 영업도 추적. 견적서 자체가 attribution 토큰.',
      coverage: '예상 25%',
      color: 'bg-orange-50 border-orange-300',
    },
    {
      name: '카카오 채널 — 추천 코드 입력',
      flow: '고객이 카카오로 문의 → 챗봇/상담원이 "소개해주신 영업사원 분 코드를 알려주세요" 안내 → 코드 입력 시 매핑',
      tools: ['카카오 채널', 'CRM'],
      strength: '가장 자연스러운 추천 경로. 고객 입장에서도 부담 없음.',
      coverage: '예상 10%',
      color: 'bg-yellow-50 border-yellow-300',
    },
    {
      name: '본사 인바운드 자동 배정',
      flow: '광고/검색을 통한 신규 리드 → 권역·전문분야 매칭 룰 → 활성 영업사원에게 자동 배정 (1건 limit) → 배정 즉시 영업사원에게 알림',
      tools: ['CRM', '룰 엔진'],
      strength: '본사 비용으로 모은 리드를 공평 분배. Gold+ 우선.',
      coverage: '예상 5%',
      color: 'bg-purple-50 border-purple-300',
    },
  ];

  const conflicts = [
    {
      situation: '동일 고객에 2명 이상의 영업사원이 따로 컨택',
      rule: '먼저 견적서를 발행한 사람이 우선. 단, 30일 이내 클로징 못 하면 배타권 만료.',
    },
    {
      situation: '추천만 한 영업사원 + 클로징한 영업사원 다름',
      rule: '클로징 전에 CRM에 분배율 등록 (예: 30:70). 등록 안 하면 클로징한 사람 100%.',
    },
    {
      situation: '재발주 — 원래 영업사원 이탈 후 다른 영업사원이 받음',
      rule: '직속 라인 또는 본사 인사이드세일즈 승계. 새 담당자에겐 수수료 50% 인정 (재발주 감액룰).',
    },
    {
      situation: '본사 인바운드 리드를 받은 후 영업사원 이탈',
      rule: '리드는 회사 자산. 다른 활성 영업사원에게 재배정. 종전 영업사원 수수료 권리 소멸.',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        <span className="font-bold">핵심 원칙: </span>
        모든 매출은 <strong>"영업사원 코드"가 박혀야</strong> 인정됨. 코드 없는 매출은 본사 직판으로 자동 분류 (영업사원 수수료 0). 따라서 영업사원은 본인 코드를 적극 활용해야 함.
      </div>

      <div>
        <div className="text-sm font-bold text-gray-900 mb-3">매출 발생 4가지 경로 (Attribution Channels)</div>
        <div className="space-y-3">
          {channels.map((c, i) => (
            <div key={i} className={`border-2 rounded-lg p-4 ${c.color}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-[10px] font-mono font-bold text-gray-500">CHANNEL {i + 1}</div>
                  <div className="text-sm font-bold text-gray-900">{c.name}</div>
                </div>
                <div className="text-right text-[10px]">
                  <div className="text-gray-500">매출 비중</div>
                  <div className="font-mono font-bold text-orange-700">{c.coverage}</div>
                </div>
              </div>
              <div className="bg-white rounded-md p-3 border border-gray-200 mb-2">
                <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">흐름</div>
                <div className="text-xs text-gray-800 leading-relaxed">{c.flow}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="font-semibold text-gray-700">사용 도구: </span>
                  <span className="text-gray-600">{c.tools.join(' / ')}</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">강점: </span>
                  <span className="text-gray-600">{c.strength}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-bold text-gray-900 mb-3">분쟁 해결 룰 (Conflict Resolution)</div>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-700 w-1/3">상황</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">자동 적용 룰</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-semibold text-gray-900">{c.situation}</td>
                  <td className="px-3 py-2 text-gray-700 leading-relaxed">{c.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-900 text-white rounded-lg p-4 text-xs leading-relaxed">
        <div className="font-bold text-orange-400 mb-2">CRM에 자동 강제돼야 하는 핵심 메커니즘</div>
        <ul className="space-y-1 text-gray-200">
          <li>· <strong className="text-white">영업사원 코드 발급</strong>: 가입 즉시 고유 코드(SR-XXXXXX) + 추천 링크 + QR 자동 생성</li>
          <li>· <strong className="text-white">견적서 자동 박음</strong>: 영업사원이 만든 견적서 PDF에 코드 + 본인 사진 + 연락처 박힘</li>
          <li>· <strong className="text-white">결제 단계 검증</strong>: 결제 전 견적서 ID 또는 추천 코드 확인 → 영업사원 자동 매칭</li>
          <li>· <strong className="text-white">분배율 사전 등록 강제</strong>: 협업 영업이면 클로징 전 CRM에서 분배율 입력 안 하면 클로징 진행 불가</li>
          <li>· <strong className="text-white">고아계약 자동 알림</strong>: 영업사원 3개월 비활동 감지 → 직속 라인에 자동 인계 + 알림</li>
        </ul>
      </div>
    </div>
  );
}

// ==========================================================
// Ch.15 영업사원 모바일 앱 (Mockup) — 단체 관리 중심
// ==========================================================
type TeamCategory = '학교' | '기업' | '동호회' | '매장' | '댄스';
type TeamStatus = 'new' | 'active' | 'reorder_due' | 'dormant';

interface Team {
  id: string;
  name: string;
  category: TeamCategory;
  size: number;
  contact: string;
  decisionMaker: string;
  lastOrderDays: number;
  lastOrderAmount: number;
  totalOrders: number;
  totalRevenue: number;
  reorderCycleMonths: number;
  status: TeamStatus;
  note?: string;
  history: Array<{ date: string; amount: number; item: string }>;
}

const TEAMS: Team[] = [
  {
    id: 't1', name: '한빛고등학교 댄스부', category: '학교', size: 25,
    contact: '010-2***-5612', decisionMaker: '박지영 코치',
    lastOrderDays: 60, lastOrderAmount: 2_500_000,
    totalOrders: 4, totalRevenue: 9_000_000,
    reorderCycleMonths: 3, status: 'reorder_due',
    note: '시즌마다 굿즈 추가발주. 디자인 컨펌 빠름.',
    history: [
      { date: '2026-03-04', amount: 2_500_000, item: '봄 시즌 댄스복 25벌' },
      { date: '2025-12-08', amount: 2_300_000, item: '겨울 후드 + 패딩 25벌' },
      { date: '2025-09-15', amount: 2_100_000, item: '가을 공연복 25벌' },
      { date: '2025-06-02', amount: 2_100_000, item: '여름 단체티 25벌' },
    ],
  },
  {
    id: 't2', name: 'ABC주식회사 마케팅실', category: '기업', size: 120,
    contact: '02-555-****', decisionMaker: '김영주 인사팀장',
    lastOrderDays: 335, lastOrderAmount: 4_500_000,
    totalOrders: 3, totalRevenue: 13_200_000,
    reorderCycleMonths: 12, status: 'reorder_due',
    note: '매년 5월 워크숍 단체티. 작년 동일 디자인 호응 좋음.',
    history: [
      { date: '2025-05-10', amount: 4_500_000, item: '워크숍 단체티 120벌' },
      { date: '2024-05-22', amount: 4_300_000, item: '워크숍 단체티 110벌' },
      { date: '2023-11-08', amount: 4_400_000, item: '창립기념 폴로 110벌' },
    ],
  },
  {
    id: 't3', name: '성북구 마라톤동호회', category: '동호회', size: 35,
    contact: '010-9***-2244', decisionMaker: '이재호 회장',
    lastOrderDays: 150, lastOrderAmount: 2_200_000,
    totalOrders: 5, totalRevenue: 9_400_000,
    reorderCycleMonths: 6, status: 'reorder_due',
    note: '봄·가을 시즌 응원티 정기 발주.',
    history: [
      { date: '2025-12-01', amount: 2_200_000, item: '연말대회 응원티 35벌' },
      { date: '2025-09-15', amount: 1_900_000, item: '가을 마라톤 단체복' },
    ],
  },
  {
    id: 't4', name: '자이언트제약 영업본부', category: '기업', size: 80,
    contact: '02-222-****', decisionMaker: '최민호 총무',
    lastOrderDays: 280, lastOrderAmount: 3_200_000,
    totalOrders: 2, totalRevenue: 6_100_000,
    reorderCycleMonths: 12, status: 'reorder_due',
    note: '연말 시상식 단체복 → 작년 만족.',
    history: [
      { date: '2025-07-25', amount: 3_200_000, item: '하계 워크숍 폴로 80벌' },
    ],
  },
  {
    id: 't5', name: '서울대 풋살동아리', category: '동호회', size: 18,
    contact: '010-7***-1820', decisionMaker: '정태웅 대표',
    lastOrderDays: 21, lastOrderAmount: 1_800_000,
    totalOrders: 1, totalRevenue: 1_800_000,
    reorderCycleMonths: 12, status: 'new',
    note: '신규. 첫 발주 만족도 ↑ 추천 요청.',
    history: [{ date: '2026-04-12', amount: 1_800_000, item: '신학기 유니폼 18벌' }],
  },
  {
    id: 't6', name: '댄스아카데미 비트', category: '댄스', size: 45,
    contact: '010-4***-9911', decisionMaker: '한수진 원장',
    lastOrderDays: 14, lastOrderAmount: 1_350_000,
    totalOrders: 6, totalRevenue: 7_800_000,
    reorderCycleMonths: 3, status: 'active',
    note: '원생 단체복 + 굿즈 정기.',
    history: [
      { date: '2026-04-19', amount: 1_350_000, item: '봄 신학기 단체복' },
      { date: '2026-01-08', amount: 1_300_000, item: '겨울 후드' },
    ],
  },
  {
    id: 't7', name: '마린크로스핏 강남', category: '매장', size: 6,
    contact: '010-3***-7733', decisionMaker: '송재훈 점장',
    lastOrderDays: 32, lastOrderAmount: 550_000,
    totalOrders: 1, totalRevenue: 550_000,
    reorderCycleMonths: 6, status: 'active',
    note: '직원 유니폼. 신규 직원 입사 시 추가 발주 가능성.',
    history: [{ date: '2026-04-01', amount: 550_000, item: '직원 유니폼 6벌' }],
  },
  {
    id: 't8', name: '헬스장 그라운드', category: '매장', size: 12,
    contact: '010-1***-4455', decisionMaker: '이태영 대표',
    lastOrderDays: 45, lastOrderAmount: 980_000,
    totalOrders: 2, totalRevenue: 1_700_000,
    reorderCycleMonths: 6, status: 'active',
    note: 'PT 트레이너 유니폼.',
    history: [
      { date: '2026-03-20', amount: 980_000, item: '트레이너 유니폼 12벌' },
      { date: '2025-09-15', amount: 720_000, item: '여름 티 8벌' },
    ],
  },
  {
    id: 't9', name: '경복초등학교 6학년', category: '학교', size: 95,
    contact: '02-733-****', decisionMaker: '김선영 부장교사',
    lastOrderDays: 395, lastOrderAmount: 2_800_000,
    totalOrders: 1, totalRevenue: 2_800_000,
    reorderCycleMonths: 12, status: 'dormant',
    note: '졸업 — 신규 6학년 영업 필요.',
    history: [{ date: '2025-04-05', amount: 2_800_000, item: '졸업기념 후드티 95벌' }],
  },
  {
    id: 't10', name: '카페모찌 강남점', category: '매장', size: 8,
    contact: '010-8***-3210', decisionMaker: '윤지혜 점주',
    lastOrderDays: 240, lastOrderAmount: 650_000,
    totalOrders: 2, totalRevenue: 1_180_000,
    reorderCycleMonths: 12, status: 'dormant',
    note: '오픈 시 발주. 8개월 무연락 — 직원 교체 가능성.',
    history: [
      { date: '2025-09-10', amount: 650_000, item: '직원 앞치마 + 티 8벌' },
    ],
  },
  {
    id: 't11', name: '고려대 응원단', category: '동호회', size: 30,
    contact: '010-5***-7788', decisionMaker: '박서준 단장',
    lastOrderDays: 120, lastOrderAmount: 2_100_000,
    totalOrders: 3, totalRevenue: 5_500_000,
    reorderCycleMonths: 6, status: 'reorder_due',
    note: '체육대회 시즌마다 응원티 발주.',
    history: [
      { date: '2026-01-08', amount: 2_100_000, item: '입시 응원 단체복 30벌' },
    ],
  },
];

const CATEGORY_COLORS: Record<TeamCategory, string> = {
  학교: 'bg-blue-100 text-blue-800',
  기업: 'bg-purple-100 text-purple-800',
  동호회: 'bg-green-100 text-green-800',
  매장: 'bg-orange-100 text-orange-800',
  댄스: 'bg-pink-100 text-pink-800',
};

const formatLastOrder = (days: number) => {
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 ${Math.floor((days % 365) / 30)}개월 전`;
};

const getReorderDaysLeft = (t: Team) => {
  const cycleDays = t.reorderCycleMonths * 30;
  return cycleDays - t.lastOrderDays;
};

function StatusBadge({ status }: { status: TeamStatus }) {
  const map: Record<TeamStatus, { label: string; cls: string }> = {
    new: { label: '신규', cls: 'bg-blue-500 text-white' },
    active: { label: '활성', cls: 'bg-green-500 text-white' },
    reorder_due: { label: '재발주 임박', cls: 'bg-orange-500 text-white animate-pulse' },
    dormant: { label: '휴면', cls: 'bg-gray-400 text-white' },
  };
  const m = map[status];
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${m.cls}`}>{m.label}</span>;
}

type MobileTab = 'home' | 'teams' | 'pipeline' | 'more';
type FilterKey = 'all' | 'reorder_due' | 'active' | 'dormant';
type SortKey = 'reorder' | 'last_order' | 'total_revenue' | 'name';

function Ch15SalespersonDashboard() {
  const [tab, setTab] = useState<MobileTab>('teams');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('reorder');
  const [expandedId, setExpandedId] = useState<string | null>('t1');

  const counts = {
    all: TEAMS.length,
    reorder_due: TEAMS.filter((t) => t.status === 'reorder_due').length,
    active: TEAMS.filter((t) => t.status === 'active' || t.status === 'new').length,
    dormant: TEAMS.filter((t) => t.status === 'dormant').length,
  };

  const filteredTeams = TEAMS.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'reorder_due') return t.status === 'reorder_due';
    if (filter === 'active') return t.status === 'active' || t.status === 'new';
    if (filter === 'dormant') return t.status === 'dormant';
    return true;
  }).sort((a, b) => {
    if (sort === 'reorder') {
      const aLeft = getReorderDaysLeft(a);
      const bLeft = getReorderDaysLeft(b);
      return aLeft - bLeft;
    }
    if (sort === 'last_order') return a.lastOrderDays - b.lastOrderDays;
    if (sort === 'total_revenue') return b.totalRevenue - a.totalRevenue;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        <span className="font-bold">목적: </span>
        영업사원이 모바일에서 본인이 관리하는 단체를 한눈에 — 마지막 주문, 재발주 임박, 누적 매출, 즉시 연락. <strong>재발주 사이클을 놓치지 않는 것이 핵심.</strong>
      </div>

      {/* Phone Frame */}
      <div className="bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg p-6 flex justify-center">
        <div className="bg-gray-900 rounded-[2.5rem] p-2 shadow-2xl" style={{ width: '380px' }}>
          <div className="bg-white rounded-[2rem] overflow-hidden flex flex-col" style={{ height: '760px' }}>
            {/* Status Bar */}
            <div className="bg-white px-5 py-1 flex justify-between items-center text-[10px] font-bold text-gray-900">
              <span>9:41</span>
              <span className="font-mono">📶 100%</span>
            </div>

            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-[10px] opacity-80">SR-A1B2C3 · Gold</div>
                  <div className="text-base font-bold">김민지님</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] opacity-80">이번달 매출</div>
                  <div className="text-base font-bold font-mono">₩9.2M</div>
                </div>
              </div>
            </div>

            {/* Main Content (scroll area) */}
            <div className="flex-1 overflow-hidden bg-gray-50">
              {tab === 'home' && <HomeTab />}
              {tab === 'teams' && (
                <TeamsTab
                  filter={filter}
                  setFilter={setFilter}
                  sort={sort}
                  setSort={setSort}
                  counts={counts}
                  teams={filteredTeams}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                />
              )}
              {tab === 'pipeline' && <PipelineTab />}
              {tab === 'more' && <MoreTab />}
            </div>

            {/* Bottom Nav */}
            <div className="bg-white border-t border-gray-200 grid grid-cols-4">
              {[
                { k: 'home' as const, label: '홈', icon: '🏠' },
                { k: 'teams' as const, label: '내 단체', icon: '👥', badge: counts.reorder_due },
                { k: 'pipeline' as const, label: '진행', icon: '📋' },
                { k: 'more' as const, label: '더보기', icon: '⋯' },
              ].map((n) => (
                <button
                  key={n.k}
                  onClick={() => setTab(n.k)}
                  className={`relative py-2 flex flex-col items-center text-[10px] ${
                    tab === n.k ? 'text-orange-600 font-bold' : 'text-gray-500'
                  }`}
                >
                  <span className="text-base">{n.icon}</span>
                  <span>{n.label}</span>
                  {n.badge && n.badge > 0 ? (
                    <span className="absolute top-1 right-6 bg-red-500 text-white text-[8px] font-bold rounded-full px-1.5 py-0.5">
                      {n.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-[10px] text-gray-500 -mt-2">
        ↑ 영업사원 모바일 앱 (실제 인터랙션 가능 — 탭/필터/정렬/카드 클릭)
      </div>

      {/* 화면 명세 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-bold text-gray-900">📱 단체 관리 화면 명세</div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">기능</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">동작</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">자동화</th>
            </tr>
          </thead>
          <tbody>
            {[
              { f: '재발주 임박 자동 검출', a: 'lastOrder + cycle ≥ 80% 시 status=reorder_due', auto: '일 1회 Cron' },
              { f: '필터 칩 (전체/임박/활성/휴면)', a: '터치 시 해당 status만 표시 + 카운트 뱃지', auto: '실시간' },
              { f: '정렬 (임박순/최근/매출/이름)', a: '드롭다운 선택', auto: '실시간' },
              { f: '카드 펼치기', a: '주문 이력·메모·연락처 확장', auto: '실시간' },
              { f: '연락 액션', a: '📞 전화 / 💬 카톡 / 📋 견적 — 각각 native intent 호출', auto: 'Deep link' },
              { f: '하단 탭 빨간 뱃지', a: 'reorder_due 단체 수 표시', auto: '실시간' },
              { f: '재발주 푸시 알림', a: '임박 7일 전 / 사이클 도달일 푸시', auto: 'FCM' },
              { f: '메모 자동 저장', a: '통화 후 메모 입력 시 즉시 동기화', auto: 'CRM API' },
            ].map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-semibold text-gray-900">{r.f}</td>
                <td className="px-3 py-1.5 text-gray-700">{r.a}</td>
                <td className="px-3 py-1.5 text-gray-500 font-mono text-[10px]">{r.auto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HomeTab() {
  return (
    <div className="overflow-y-auto h-full p-3 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <MockCard label="이번달 매출" value="₩9.2M" sub="목표 ₩10M" tone="orange" />
        <MockCard label="이번달 수수료" value="₩1,656K" sub="실수령 ₩1,601K" tone="blue" />
        <MockCard label="다음 등급" value="₩5.8M" sub="Platinum까지" tone="sky" />
      </div>
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <div className="text-[11px] font-bold text-gray-700 mb-2">등급 게이지 (3M 평균 ₩9.2M)</div>
        <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-amber-300" style={{ width: '8%' }} />
          <div className="absolute inset-y-0 bg-slate-400" style={{ left: '8%', width: '13%' }} />
          <div className="absolute inset-y-0 bg-yellow-400" style={{ left: '21%', width: '21%' }} />
          <div className="absolute inset-y-0 bg-sky-400" style={{ left: '42%', width: '21%' }} />
          <div className="absolute inset-y-0 bg-purple-400" style={{ left: '63%', width: '37%' }} />
          <div className="absolute top-0 bottom-0 bg-gray-900 w-1" style={{ left: '30%' }} />
        </div>
        <div className="flex justify-between text-[8px] font-mono text-gray-500 mt-1">
          <span>B</span><span>S</span><span>G</span><span>P</span><span>D</span>
        </div>
      </div>

      <div className="bg-orange-100 border-2 border-orange-300 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">🔔</span>
          <span className="text-xs font-bold text-orange-900">재발주 임박 4팀</span>
        </div>
        <div className="text-[10px] text-orange-800 leading-relaxed">
          한빛고 댄스부 · ABC주식회사 · 성북마라톤 · 자이언트제약. 지금 연락 → 다음달 매출 +₩12M
        </div>
      </div>

      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <div className="text-[11px] font-bold text-gray-700 mb-2">본사 배정 리드 3건</div>
        <div className="space-y-1">
          {[
            { name: '○○대학교 댄스동아리', size: '40벌', age: '오늘' },
            { name: '○○카페 직원 유니폼', size: '12벌', age: '어제' },
          ].map((l, i) => (
            <div key={i} className="bg-blue-50 rounded p-2 text-[10px] flex justify-between">
              <div>
                <div className="font-bold text-gray-900">{l.name}</div>
                <div className="text-gray-600">{l.size}</div>
              </div>
              <div className="text-blue-700 font-mono text-[9px]">{l.age}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamsTab({
  filter, setFilter, sort, setSort, counts, teams, expandedId, setExpandedId,
}: {
  filter: FilterKey;
  setFilter: (f: FilterKey) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  counts: { all: number; reorder_due: number; active: number; dormant: number };
  teams: Team[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  return (
    <div className="overflow-y-auto h-full">
      {/* Title */}
      <div className="px-3 py-2 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex justify-between items-baseline mb-2">
          <div className="text-sm font-bold text-gray-900">내 단체 ({counts.all})</div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="text-[10px] border border-gray-300 rounded px-1 py-0.5"
          >
            <option value="reorder">재발주 임박순</option>
            <option value="last_order">최근 주문순</option>
            <option value="total_revenue">누적 매출순</option>
            <option value="name">이름순</option>
          </select>
        </div>
        {/* Filter chips */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {([
            { k: 'all' as const, label: '전체', n: counts.all },
            { k: 'reorder_due' as const, label: '재발주 임박', n: counts.reorder_due, hot: true },
            { k: 'active' as const, label: '활성', n: counts.active },
            { k: 'dormant' as const, label: '휴면', n: counts.dormant },
          ]).map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${
                filter === f.k
                  ? f.hot
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {f.label} {f.n > 0 && `(${f.n})`}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2">
        {teams.map((t) => {
          const expanded = expandedId === t.id;
          const daysLeft = getReorderDaysLeft(t);
          return (
            <div
              key={t.id}
              className={`bg-white rounded-lg border-2 ${
                t.status === 'reorder_due' ? 'border-orange-400' : 'border-gray-200'
              } overflow-hidden`}
            >
              <button
                onClick={() => setExpandedId(expanded ? null : t.id)}
                className="w-full p-3 text-left"
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1 mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${CATEGORY_COLORS[t.category]}`}>{t.category}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="text-sm font-bold text-gray-900 leading-tight">{t.name}</div>
                    <div className="text-[10px] text-gray-500">{t.size}명 · {t.decisionMaker}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div className="bg-gray-50 rounded p-1.5">
                    <div className="text-gray-500 text-[9px]">📅 마지막 주문</div>
                    <div className="font-bold text-gray-900">{formatLastOrder(t.lastOrderDays)}</div>
                    <div className="font-mono text-gray-700">{fmt(t.lastOrderAmount)}</div>
                  </div>
                  <div className="bg-gray-50 rounded p-1.5">
                    <div className="text-gray-500 text-[9px]">📊 누적</div>
                    <div className="font-bold text-gray-900">{t.totalOrders}건</div>
                    <div className="font-mono text-gray-700">{fmt(t.totalRevenue)}</div>
                  </div>
                </div>

                {t.status === 'reorder_due' && (
                  <div className="mt-2 bg-orange-50 border border-orange-200 rounded p-1.5 text-[10px] text-orange-900">
                    ⏰ 재발주 사이클 {t.reorderCycleMonths}개월 — {daysLeft <= 0 ? `이미 ${Math.abs(daysLeft)}일 지남` : `${daysLeft}일 남음`}. 지금 연락 권장.
                  </div>
                )}
                {t.status === 'dormant' && (
                  <div className="mt-2 bg-gray-100 rounded p-1.5 text-[10px] text-gray-700">
                    💤 {Math.floor(t.lastOrderDays / 30)}개월 무연락. 휴면 큐 포함.
                  </div>
                )}
              </button>

              {expanded && (
                <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3">
                  {t.note && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-[10px]">
                      <div className="text-[9px] font-bold text-yellow-900 mb-0.5">📝 메모</div>
                      <div className="text-yellow-900">{t.note}</div>
                    </div>
                  )}

                  <div>
                    <div className="text-[10px] font-bold text-gray-700 mb-1">📜 주문 이력 ({t.history.length}건)</div>
                    <div className="space-y-1">
                      {t.history.map((h, i) => (
                        <div key={i} className="bg-white rounded p-2 text-[10px] border border-gray-200">
                          <div className="flex justify-between mb-0.5">
                            <span className="font-mono text-gray-600">{h.date}</span>
                            <span className="font-mono font-bold text-gray-900">{fmt(h.amount)}</span>
                          </div>
                          <div className="text-gray-700">{h.item}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-gray-700 mb-1">📞 연락처</div>
                    <div className="text-[10px] text-gray-700 font-mono">{t.contact}</div>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    <button className="bg-green-500 text-white text-[10px] font-bold py-2 rounded">📞 전화</button>
                    <button className="bg-yellow-400 text-yellow-900 text-[10px] font-bold py-2 rounded">💬 카톡</button>
                    <button className="bg-orange-500 text-white text-[10px] font-bold py-2 rounded">📋 견적</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineTab() {
  return (
    <div className="overflow-y-auto h-full p-3 space-y-3">
      <div className="text-sm font-bold text-gray-900 mb-2">진행 중 거래 (15건)</div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { stage: '탐색', n: 3, amount: '₩6.0M' },
          { stage: '제안', n: 2, amount: '₩4.8M' },
          { stage: '시안', n: 4, amount: '₩9.2M' },
          { stage: '계약', n: 1, amount: '₩2.5M' },
          { stage: '생산', n: 0, amount: '-' },
          { stage: '추천', n: 5, amount: '신규' },
        ].map((s) => (
          <div key={s.stage} className="bg-white border border-gray-200 rounded p-3 text-center">
            <div className="text-[9px] text-gray-500">{s.stage}</div>
            <div className="text-xl font-bold text-orange-600">{s.n}</div>
            <div className="text-[10px] font-mono text-gray-700">{s.amount}</div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-gray-500">탭 시 단계별 거래 목록</div>
    </div>
  );
}

function MoreTab() {
  return (
    <div className="overflow-y-auto h-full p-3 space-y-2">
      {[
        { icon: '📊', label: '내 매출 통계' },
        { icon: '🏆', label: '동료 랭킹' },
        { icon: '📅', label: '월간 컨벤션' },
        { icon: '📚', label: 'e-Learning 50개' },
        { icon: '💬', label: '본사 채널' },
        { icon: '⚙️', label: '설정' },
        { icon: '❓', label: 'FAQ' },
      ].map((m) => (
        <div key={m.label} className="bg-white border border-gray-200 rounded p-3 flex items-center gap-3">
          <span className="text-base">{m.icon}</span>
          <span className="text-xs text-gray-900">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

function MockCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  const map: Record<string, string> = {
    orange: 'bg-orange-100 text-orange-900',
    blue: 'bg-blue-100 text-blue-900',
    sky: 'bg-sky-100 text-sky-900',
  };
  return (
    <div className={`rounded p-2 ${map[tone]}`}>
      <div className="text-[8px] font-semibold opacity-70">{label}</div>
      <div className="text-xs font-bold font-mono">{value}</div>
      <div className="text-[8px] opacity-70">{sub}</div>
    </div>
  );
}

// ==========================================================
// Ch.16 본사 운영 대시보드 (Mockup)
// ==========================================================
function Ch16AdminDashboard() {
  const ranking = [
    { rank: 1, name: '김민지', grade: 'PLATINUM', rev: 18_500_000, comm: 4_070_000, deals: 12 },
    { rank: 2, name: '이서연', grade: 'GOLD', rev: 14_200_000, comm: 2_556_000, deals: 9 },
    { rank: 3, name: '박지호', grade: 'GOLD', rev: 12_800_000, comm: 2_304_000, deals: 11 },
    { rank: 4, name: '정하늘', grade: 'GOLD', rev: 9_500_000, comm: 1_710_000, deals: 8 },
    { rank: 5, name: '최유나', grade: 'SILVER', rev: 7_200_000, comm: 1_080_000, deals: 6 },
    { rank: 6, name: '한지우', grade: 'SILVER', rev: 6_800_000, comm: 1_020_000, deals: 7 },
    { rank: 7, name: '강도윤', grade: 'SILVER', rev: 5_500_000, comm: 825_000, deals: 5 },
    { rank: 8, name: '윤서아', grade: 'BRONZE', rev: 2_800_000, comm: 280_000, deals: 4 },
  ];

  const distribution = [
    { grade: 'BRONZE', count: 12, color: 'bg-amber-300' },
    { grade: 'SILVER', count: 10, color: 'bg-slate-400' },
    { grade: 'GOLD', count: 5, color: 'bg-yellow-400' },
    { grade: 'PLATINUM', count: 2, color: 'bg-sky-400' },
    { grade: 'DIAMOND', count: 0, color: 'bg-purple-400' },
  ];
  const total = distribution.reduce((s, d) => s + d.count, 0);

  const risks = [
    { name: '안유진', grade: 'SILVER', last: '3주 전', issue: '3주 비활동 — 코칭 필요' },
    { name: '노지민', grade: 'BRONZE', last: '5주 전', issue: '5주 비활동 — 이탈 위험' },
    { name: '오시우', grade: 'BRONZE', last: '2주 전', issue: '입사 75일째 첫수주 미발생' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        <span className="font-bold">목적: </span>
        본사 사업주·운영팀이 전체 영업조직 헬스를 한눈에. 등급 분포·랭킹·이탈위험·매출원천 모니터링.
      </div>

      {/* 상단 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <MockKPI label="이번달 총매출" value="₩523M" delta="+12%" />
        <MockKPI label="활성 영업사원" value="29명" delta="+3" />
        <MockKPI label="평균 등급" value="Silver" delta="—" />
        <MockKPI label="신규 가입" value="5명" delta="이번달" />
        <MockKPI label="이탈 위험" value="3명" delta="알림" tone="red" />
      </div>

      {/* 영업사원 랭킹 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-bold text-gray-900">📊 영업사원 매출 랭킹 (이번달)</div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">#</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">이름</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-700">등급</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-700">본인 매출</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-700">수수료</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-700">거래 수</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-700">매출/거래</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r) => {
              const g = GRADES.find((x) => x.code === r.grade)!;
              return (
                <tr key={r.rank} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono font-bold text-gray-700">{r.rank}</td>
                  <td className="px-3 py-1.5 font-bold text-gray-900">{r.name}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${g.bg} ${g.color}`}>{g.name}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-800">{fmt(r.rev)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-orange-700">{fmt(r.comm)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">{r.deals}건</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">{fmt(Math.round(r.rev / r.deals))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 등급 분포 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-bold text-gray-900 mb-3">📈 등급 분포 (총 {total}명)</div>
          <div className="flex h-8 rounded-md overflow-hidden ring-1 ring-gray-200 mb-3">
            {distribution.map((d) => (
              <div key={d.grade} className={`${d.color} flex items-center justify-center text-[10px] font-bold text-gray-900`} style={{ width: `${(d.count / total) * 100}%` }}>
                {d.count > 0 ? d.count : ''}
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {distribution.map((d) => {
              const g = GRADES.find((x) => x.code === d.grade)!;
              return (
                <div key={d.grade} className="flex items-center gap-2 text-xs">
                  <div className={`w-3 h-3 rounded ${d.color}`} />
                  <div className="flex-1 font-semibold text-gray-700">{g.name}</div>
                  <div className="font-mono text-gray-900">{d.count}명 ({((d.count / total) * 100).toFixed(0)}%)</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 text-[10px] text-gray-500">
            목표: Silver+ 비중 60%. 현재 {(((distribution[1].count + distribution[2].count + distribution[3].count + distribution[4].count) / total) * 100).toFixed(0)}%.
          </div>
        </div>

        {/* 이탈 위험 */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-bold text-gray-900 mb-3">⚠️ 이탈 위험 영업사원</div>
          <div className="space-y-2">
            {risks.map((r) => (
              <div key={r.name} className="bg-red-50 border border-red-200 rounded p-2 text-xs">
                <div className="flex justify-between mb-1">
                  <div className="font-bold text-gray-900">{r.name} <span className="text-gray-500 font-normal">({r.grade})</span></div>
                  <div className="text-red-700 font-mono text-[10px]">{r.last}</div>
                </div>
                <div className="text-red-800">{r.issue}</div>
                <div className="mt-1 text-[10px]">
                  <button className="bg-red-600 text-white px-2 py-0.5 rounded mr-1">코칭 배정</button>
                  <button className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded">직접 연락</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 매출 원천 분석 */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm font-bold text-gray-900 mb-3">📍 매출 원천 분석 (이번달 ₩523M)</div>
        <div className="flex h-8 rounded-md overflow-hidden ring-1 ring-gray-200 mb-3">
          <div className="bg-blue-400 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: '60%' }}>온라인 견적 60%</div>
          <div className="bg-orange-400 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: '25%' }}>오프라인 25%</div>
          <div className="bg-yellow-400 flex items-center justify-center text-[10px] font-bold text-gray-900" style={{ width: '10%' }}>카카오 10%</div>
          <div className="bg-purple-400 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: '5%' }}>본사 5%</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {[
            { ch: '온라인 견적', val: 313_800_000, color: 'bg-blue-100 text-blue-900' },
            { ch: '오프라인 견적', val: 130_750_000, color: 'bg-orange-100 text-orange-900' },
            { ch: '카카오 추천', val: 52_300_000, color: 'bg-yellow-100 text-yellow-900' },
            { ch: '본사 인바운드', val: 26_150_000, color: 'bg-purple-100 text-purple-900' },
          ].map((c) => (
            <div key={c.ch} className={`rounded p-2 ${c.color}`}>
              <div className="text-[10px] opacity-80">{c.ch}</div>
              <div className="font-mono font-bold">{fmt(c.val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 화면 명세 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-bold text-gray-900">화면 구성 명세</div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">화면 블록</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">목적</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">액션</th>
            </tr>
          </thead>
          <tbody>
            {[
              { block: '상단 KPI 5종', purpose: '월매출/활성수/평균등급/신규/이탈위험 한눈에', action: '클릭 시 상세' },
              { block: '영업사원 랭킹', purpose: '월별 본인매출 순위 + 거래수', action: '이름 클릭 → 개인 상세 페이지' },
              { block: '등급 분포', purpose: '조직 성숙도 측정', action: 'Silver+ 비중 60% 미달 시 알림' },
              { block: '이탈 위험', purpose: '14일+ 비활동 영업사원 자동 검출', action: '코칭 배정 / 직접 연락 / 라인 인계' },
              { block: '매출 원천', purpose: '4채널 비중 측정 — 본사 마케팅 효과 검증', action: '본사 인바운드 비중 ↓시 광고 재검토' },
              { block: '단가 분포', purpose: '소액(₩15만) vs 중간 vs 대형 비중', action: '대형 비중 ↑ → 영업사원 위임 검토' },
              { block: '월간 트렌드 차트', purpose: '6개월 매출/조직 추이', action: 'Phase 게이트 진행 추적' },
            ].map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-semibold text-gray-900">{r.block}</td>
                <td className="px-3 py-1.5 text-gray-700">{r.purpose}</td>
                <td className="px-3 py-1.5 text-gray-600">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MockKPI({ label, value, delta, tone }: { label: string; value: string; delta: string; tone?: string }) {
  return (
    <div className={`bg-white border ${tone === 'red' ? 'border-red-300' : 'border-gray-200'} rounded-lg p-3`}>
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-lg font-bold font-mono ${tone === 'red' ? 'text-red-700' : 'text-gray-900'}`}>{value}</div>
      <div className={`text-[10px] ${tone === 'red' ? 'text-red-600' : 'text-green-600'} font-mono`}>{delta}</div>
    </div>
  );
}

// ==========================================================
// Ch.17 시스템·자동화 요건
// ==========================================================
function Ch17SystemSpec() {
  const dataModel = [
    { table: 'salespersons', fields: 'id, code(SR-XXX), name, grade, joined_at, mentor_id, status', purpose: '영업사원 마스터' },
    { table: 'salesperson_grades_history', fields: 'salesperson_id, grade, effective_from, calculated_avg', purpose: '등급 이력 (감사 추적)' },
    { table: 'leads', fields: 'id, source, customer_info, assigned_to, assigned_at, status', purpose: '잠재고객 + 본사 배정 추적' },
    { table: 'deals', fields: 'id, salesperson_id, customer_id, stage, expected_amount, created_at', purpose: '진행 중 거래 (파이프라인)' },
    { table: 'orders', fields: 'id, salesperson_id, amount, attribution_channel, status, refunded_at', purpose: '확정 매출 (수수료 산정 원본)' },
    { table: 'commissions', fields: 'order_id, salesperson_id, rate, amount, paid_at, clawback_at', purpose: '수수료 지급/회수 이력' },
    { table: 'co_sales', fields: 'order_id, salesperson_id, share_ratio', purpose: '공동영업 사전 분배' },
  ];

  const automations = [
    { trigger: '주문 결제 완료', action: '영업사원 코드 매칭 → orders 생성 → 수수료 자동 계산 → commissions 등록 (선지급 30%)' },
    { trigger: '납품 완료 + 잔금 입금', action: '수수료 잔여 70% 지급 예약. D+7 후 정산 확정.' },
    { trigger: '환불 발생', action: '환불 사유 분류 → 수수료 회수 룰 적용 (단순변심 100%, UC 귀책 50%, 본사 귀책 0%)' },
    { trigger: '매월 1일 00:00', action: '전 영업사원 3개월 평균 매출 집계 → 등급 자동 갱신 → 강등 시 grace 알림' },
    { trigger: '14일 비활동 감지', action: '본사 운영팀 알림 → 코칭 배정' },
    { trigger: '90일 비활동 감지', action: '고아계약 처리 시작 → 직속 라인 자동 통보 + 인계 큐 등록' },
    { trigger: '신규 인바운드 리드', action: '권역·전문분야 매칭 → 활성 영업사원 후보 산출 → Gold+ 우선 → 자동 배정 + 알림' },
    { trigger: 'Bronze 가입 90일 첫수주 없음', action: 'Trainee 보호기간 만료 알림 → 본사 1on1 면담 예약' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        <span className="font-bold">개발 우선순위: </span>
        등급 자동산정 (Cron) → 견적코드 박힘 → 매출 귀속 자동매칭 → 수수료 자동계산 → 대시보드 (영업사원/본사) → 분쟁 룰 자동화 → 이탈위험 자동검출.
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-bold text-gray-900">📦 핵심 데이터 모델 (7개 테이블)</div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">테이블</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">주요 필드</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">용도</th>
            </tr>
          </thead>
          <tbody>
            {dataModel.map((d) => (
              <tr key={d.table} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-mono font-bold text-purple-700">{d.table}</td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-gray-600">{d.fields}</td>
                <td className="px-3 py-1.5 text-gray-700">{d.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-bold text-gray-900">⚙️ 자동화 룰 8종</div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-700 w-1/4">트리거</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-700">자동 실행</th>
            </tr>
          </thead>
          <tbody>
            {automations.map((a, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-semibold text-orange-700">{a.trigger}</td>
                <td className="px-3 py-1.5 text-gray-700 leading-relaxed">{a.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-4 text-xs leading-relaxed text-orange-900">
        <div className="font-bold mb-2">시스템 구축 단계 (Phase별)</div>
        <ol className="space-y-1 list-decimal pl-4">
          <li><strong>Stage 0 (M1~M3)</strong>: 엑셀 + 카카오 단톡으로 시작 가능. 매뉴얼 산정. 5~10명까지는 충분.</li>
          <li><strong>Stage 0 후반 (M3)</strong>: 영업사원 코드 발급 + 견적서 PDF 자동생성 도입. 첫 자동화 진입.</li>
          <li><strong>Stage 1 (M4~M9)</strong>: 본격 CRM/대시보드 구축. 등급 자동산정 Cron. 본사 운영팀 1~2명 배치.</li>
          <li><strong>Stage 2 (M10~)</strong>: 모바일앱 (PWA) + 본사 인바운드 자동배정 + 분쟁 룰 자동화.</li>
          <li><strong>Stage 3 (M19~)</strong>: 권역별 멀티테넌시 + 통계/BI. 데이터 기반 마케팅 ROI 분석.</li>
        </ol>
        <div className="mt-2 pt-2 border-t border-orange-200">
          <strong>⚠️ 주의: </strong>Stage 0~1에서 시스템 과개발 금지. 5명한테 SaaS 구축은 낭비. 엑셀로 시작해서 페인포인트 검증 후 시스템화.
        </div>
      </div>
    </div>
  );
}

// ==========================================================
// Ch.18 FAQ
// ==========================================================
function Ch13FAQ() {
  const faqs = [
    { q: '왜 후원수당 구조가 아닌가요?', a: '단순함과 합법성. 후원수당이 있으면 다단계 등록 필요·관리 복잡·라인 분쟁 발생. 단일 등급제는 본인 매출=본인 수수료라 영업사원도 본사도 명확.' },
    { q: '등급은 어떻게 자동 산정되나요?', a: '매월 1일에 직전 3개월 평균 본인매출 계산 → 등급 임계치와 비교 → 등급 자동 갱신. 사람 판단 없음. 휴면 1개월(매출 0) 허용 — 분모 3 유지.' },
    { q: '등급이 떨어질 수도 있나요?', a: '네. 3개월 평균이 낮은 등급 임계치로 떨어지면 자동 강등. 단, 1차 강등 시 1개월 grace + 멘토 코칭 제공. 2개월 연속 미달 시 확정 강등.' },
    { q: '팀장은 언제 도입하나요?', a: 'Stage 2 (M10~M18, 영업사원 30~80명)부터. Gold+ 우수자 중 지원 → 본사 인터뷰 → 직책 부여. 팀장은 본인 영업도 계속하며 직책급 + 팀 매출 인센티브 별도 받음.' },
    { q: '대형 거래(₩3,000만+)도 영업사원이 처리하나요?', a: '아니요. ₩3,000만+는 본사/사업주 직접 클로징 권장. 협상·법무·납기 리스크가 크고, 클레임 시 손실이 영업사원 수당으로 회수 안 됨. 발견자에게는 추천 보너스(고정금)만.' },
    { q: '환불 발생 시 수수료 회수는?', a: 'D+7 이내 단순변심 환불 → 수수료 100% 회수. 영업사원 귀책(사이즈 오기재) → 50% 회수. 본사 귀책(생산불량) → 회수 없음. 위촉계약서에 명문화.' },
    { q: '소액 단가(₩15만)도 등급 산정에 포함되나요?', a: '네 매출 합산. 단, 소액 거래 비중이 너무 높으면 시간 대비 비효율 → 영업사원 본인이 자율 판단. 본사는 ₩100만+ 거래 우선 코칭.' },
    { q: '초기 6개월 적자 가능성은?', a: '높음. 영업사원 모집·교육·시스템·본사 인건비가 선행투자. Stage 0~1 (M1~M9) 누적 적자 1.5~2.5억 예상. Stage 2부터 흑자 전환 목표.' },
  ];
  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
      {faqs.map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
    </div>
  );
}
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50">
        <span className="text-sm font-bold text-gray-900 pr-4">Q. {q}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 text-sm text-gray-700 leading-relaxed"><span className="font-bold text-orange-700">A. </span>{a}</div>}
    </div>
  );
}

// ==========================================================
// Main Guide
// ==========================================================
export default function SalespersonsGuide() {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-lg p-6">
        <div className="text-[11px] font-mono text-orange-400 tracking-wider mb-1">BUSINESS MODEL EXPLAINER · v2.0</div>
        <h1 className="text-2xl font-bold mb-2">사업 구조 이해 가이드</h1>
        <p className="text-sm text-gray-300 leading-relaxed">
          모두의 유니폼 영업조직 운영 모델. <strong className="text-white">5등급 누진 수수료제 + 단계별 조직 진화</strong>.
          후원수당·라인구조 없음. 본인 매출 → 본인 수수료의 단순 모델.
        </p>
        <div className="mt-3 flex items-start gap-2 bg-orange-500/10 border border-orange-500/30 rounded-md p-3">
          <Info className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-orange-100">
            v1 (후원수당 28% 모델)에서 <strong>단일 등급제 모델</strong>로 전면 개편. 영업사원이 이해하기 쉽고 본사 관리도 단순.
          </div>
        </div>
      </div>

      <GuideSection num="01" title="한눈에 보기" subtitle="이 사업을 4가지 질문으로 요약하면">
        <Ch1Overview />
      </GuideSection>

      <GuideSection num="02" title="영업사원 등급표 — 5등급 누진제" subtitle="Bronze 10% → Silver 15% → Gold 18% → Platinum 22% → Diamond 25%. 본인 매출만 보고 자동 산정.">
        <Ch2GradeTable />
      </GuideSection>

      <GuideSection num="03" title="조직 진화 4단계 — Stage 0 → 3" subtitle="처음엔 영업사원 단일 트랙. 30명+ 도달 후 팀장. 80명+ 후 지점장.">
        <Ch3OrgEvolution />
      </GuideSection>

      <GuideSection num="04" title="단가별 9가지 시나리오" subtitle="₩15만 ~ ₩1억까지 — 영업사원이 마주칠 모든 단가대">
        <Ch4RevenueScenarios />
      </GuideSection>

      <GuideSection num="05" title="단일 거래 시뮬레이터" subtitle="주문금액과 영업사원 등급을 골라 수수료·실수령·본사마진 즉시 확인">
        <Ch5Simulator />
      </GuideSection>

      <GuideSection num="06" title="영업 6단계 표준 프로세스" subtitle="탐색 → 제안 → 시안 → 계약 → 납품 → 추천. 첫 컨택 → 수주 16.8%">
        <Ch6SalesPipeline />
      </GuideSection>

      <GuideSection num="07" title="영업사원 페르소나 4종" subtitle="누가 영업사원으로 잘 맞나">
        <Ch7Personas />
      </GuideSection>

      <GuideSection num="08" title="한 사람의 18개월 여정 — Bronze → Platinum" subtitle="가상 인물 김민지가 등급별로 어떻게 성장하나">
        <Ch8Journey />
      </GuideSection>

      <GuideSection num="09" title="본사 BEP 시뮬레이터" subtitle="월매출 + 평균 수수료율 슬라이더로 영업이익 실시간 계산">
        <Ch9BEP />
      </GuideSection>

      <GuideSection num="10" title="모집 깔때기" subtitle="월 1,000만원 광고 → 활성 영업사원 9명. CPA 약 111만">
        <Ch10Funnel />
      </GuideSection>

      <GuideSection num="11" title="핵심 KPI 7개" subtitle="조직 헬스 측정 지표">
        <Ch11KPI />
      </GuideSection>

      <GuideSection num="12" title="세금과 본사 손익 구조" subtitle="영업사원 3.3% 원천징수 + 본사 매출 1건당 분배">
        <Ch12Tax />
      </GuideSection>

      <div className="border-t-4 border-orange-500 pt-6 mt-8">
        <div className="bg-orange-500 text-white inline-block px-3 py-1 rounded-md text-xs font-bold mb-2">SYSTEM SPEC · 운영 시스템</div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">매출 귀속 + 영업사원/본사 대시보드 + 시스템 명세</h2>
        <p className="text-xs text-gray-600">매출이 어떻게 영업사원에게 귀속되는지, 어떤 대시보드가 필요한지, 시스템은 어떻게 구축할지.</p>
      </div>

      <GuideSection num="14" title="매출 귀속 메커니즘 (Attribution)" subtitle="모든 매출은 영업사원 코드가 박혀야 인정. 4채널 + 분쟁 룰 + CRM 자동화">
        <Ch14Attribution />
      </GuideSection>

      <GuideSection num="15" title="영업사원 본인 대시보드 (목업)" subtitle="모바일/PC에서 본인 실적·등급·파이프라인 자율 확인">
        <Ch15SalespersonDashboard />
      </GuideSection>

      <GuideSection num="16" title="본사 운영 대시보드 (목업)" subtitle="전체 영업조직 헬스 모니터링 — 랭킹/등급분포/이탈위험/매출원천">
        <Ch16AdminDashboard />
      </GuideSection>

      <GuideSection num="17" title="시스템·자동화 요건" subtitle="7개 데이터 테이블 + 8개 자동화 룰 + Phase별 구축 단계">
        <Ch17SystemSpec />
      </GuideSection>

      <GuideSection num="18" title="자주 묻는 질문" subtitle="사업주 관점 8가지 우려 정리">
        <Ch13FAQ />
      </GuideSection>

      <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-5 mt-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-orange-900 mb-1">다음 단계</div>
            <ol className="text-xs text-orange-900 space-y-1 list-decimal pl-4">
              <li>등급 임계치/수수료율 최종 확정 (현재안: 10/15/18/22/25%)</li>
              <li>Stage 0 시드 영업사원 5~10명 모집 — 연고 영업으로 시작</li>
              <li>3개월 시장 검증 (단가 분포·성공 패턴·이탈 원인)</li>
              <li>Stage 1 진입 시 5등급제 본격 도입 + 등급 자동 산정 시스템 개발</li>
              <li>BEP 모델링 — 평균 수수료 분포 가정 검증</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
