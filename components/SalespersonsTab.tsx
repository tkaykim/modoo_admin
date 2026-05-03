'use client';

import { useState } from 'react';
import { BookOpen, LayoutDashboard, Wallet } from 'lucide-react';
import SalespersonsDashboard from './SalespersonsDashboard';
import SalespersonsGuide from './SalespersonsGuide';
import SalespersonsSettlements from './SalespersonsSettlements';

type View = 'guide' | 'dashboard' | 'settlements';

export default function SalespersonsTab() {
  const [view, setView] = useState<View>('guide');

  return (
    <div className="space-y-4 max-w-[1400px]">
      <header className="border-b border-gray-200 pb-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold text-gray-900">영업사원 관리</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-semibold">
            PROTOTYPE · 더미 데이터
          </span>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          모두의 유니폼 위촉직 영업조직(RD→BM→TL→UC) · 28% 수당 매트릭스. 실제 DB 미연동.
        </p>
      </header>

      <div className="flex gap-1 border-b border-gray-200 -mt-1 overflow-x-auto">
        <TabButton active={view === 'guide'} onClick={() => setView('guide')} icon={BookOpen}>
          사업 구조 이해 가이드
        </TabButton>
        <TabButton active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={LayoutDashboard}>
          운영 현황 대시보드
        </TabButton>
        <TabButton active={view === 'settlements'} onClick={() => setView('settlements')} icon={Wallet}>
          정산 관리
        </TabButton>
      </div>

      <div className="pt-2">
        {view === 'guide' && <SalespersonsGuide />}
        {view === 'dashboard' && <SalespersonsDashboard />}
        {view === 'settlements' && <SalespersonsSettlements />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
        active
          ? 'border-orange-500 text-gray-900'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}
