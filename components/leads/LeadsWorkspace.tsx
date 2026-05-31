'use client';

import { useState } from 'react';
import LeadsSection from './LeadsSection';
import LeadsImportSection from './LeadsImportSection';

export default function LeadsWorkspace() {
  const [tab, setTab] = useState<'list' | 'import'>('list');

  return (
    <div>
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <TabBtn active={tab === 'list'} onClick={() => setTab('list')}>리드 목록</TabBtn>
        <TabBtn active={tab === 'import'} onClick={() => setTab('import')}>수집 · 가져오기</TabBtn>
      </div>
      {tab === 'list' ? <LeadsSection /> : <LeadsImportSection onPromoted={() => setTab('list')} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}
