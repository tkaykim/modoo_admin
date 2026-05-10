'use client';

import { useState } from 'react';
import { UserPlus, UserCheck } from 'lucide-react';
import PromoteForm from './PromoteForm';
import InviteForm from './InviteForm';

type Mode = 'promote' | 'invite';

export default function SalesmanInviteOrPromote({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<Mode>('promote');

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <ModeButton active={mode === 'promote'} onClick={() => setMode('promote')} icon={UserCheck}>
          기존 사용자 승격
        </ModeButton>
        <ModeButton active={mode === 'invite'} onClick={() => setMode('invite')} icon={UserPlus}>
          신규 이메일 초대
        </ModeButton>
      </div>

      <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
        {mode === 'promote' ? (
          <PromoteForm onSuccess={onSuccess} />
        ) : (
          <InviteForm onSuccess={onSuccess} />
        )}
      </div>
    </div>
  );
}

function ModeButton({
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
      className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? 'bg-orange-500 text-white'
          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}
