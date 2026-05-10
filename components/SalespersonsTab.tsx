'use client';

import { useState } from 'react';
import { Users, UserPlus, Award } from 'lucide-react';
import SalesmenList from './salesmen/SalesmenList';
import SalesmanInviteOrPromote from './salesmen/SalesmanInviteOrPromote';
import GradeLevelTable from './salesmen/GradeLevelTable';

type View = 'list' | 'invite' | 'grades';

export default function SalespersonsTab() {
  const [view, setView] = useState<View>('list');

  return (
    <div className="space-y-4 max-w-[1400px]">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">영업사원 관리</h1>
        <p className="text-sm text-gray-600 mt-1">
          영업사원 지정·등급·실적·정산 관리. modoo_salesman 앱은 active 상태 영업사원만 접근 가능.
        </p>
      </header>

      <div className="flex gap-1 border-b border-gray-200 -mt-1 overflow-x-auto">
        <TabButton active={view === 'list'} onClick={() => setView('list')} icon={Users}>
          영업사원 목록
        </TabButton>
        <TabButton active={view === 'invite'} onClick={() => setView('invite')} icon={UserPlus}>
          지정·초대
        </TabButton>
        <TabButton active={view === 'grades'} onClick={() => setView('grades')} icon={Award}>
          등급 정책
        </TabButton>
      </div>

      <div className="pt-2">
        {view === 'list' && <SalesmenList />}
        {view === 'invite' && <SalesmanInviteOrPromote onSuccess={() => setView('list')} />}
        {view === 'grades' && <GradeLevelTable />}
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
