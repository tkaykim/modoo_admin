'use client';

import { useEffect, useState } from 'react';
import { Search, Check } from 'lucide-react';

interface Candidate {
  id: string;
  email: string | null;
  name: string | null;
  phone_number: string | null;
  role: string | null;
}

export default function PromoteForm({ onSuccess }: { onSuccess: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/salesmen/candidates?q=${encodeURIComponent(q.trim())}`
        );
        if (!res.ok) {
          const p = await res.json().catch(() => ({}));
          throw new Error(p?.error || '검색 실패');
        }
        const data = await res.json();
        setResults(data.data ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : '검색 실패');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const handlePromote = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/salesmen/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selected.id }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p?.error || '승격 실패');
      }
      setDone(`${selected.name ?? selected.email}님을 영업사원으로 지정했습니다.`);
      setSelected(null);
      setQ('');
      setResults([]);
      setTimeout(onSuccess, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : '승격 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">사용자 검색</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이메일·이름·전화로 검색 (최소 2자)"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      {done && (
        <div className="bg-green-50 border border-green-200 rounded-md p-2 text-xs text-green-800">
          {done}
        </div>
      )}

      {searching && <div className="text-xs text-gray-500">검색 중...</div>}

      {!searching && q.trim().length >= 2 && results.length === 0 && (
        <div className="text-xs text-gray-500">결과 없음 (이미 영업사원인 사용자는 제외됩니다).</div>
      )}

      {results.length > 0 && (
        <ul className="border border-gray-200 rounded-md divide-y max-h-80 overflow-y-auto">
          {results.map((u) => {
            const isSelected = selected?.id === u.id;
            return (
              <li
                key={u.id}
                onClick={() => setSelected(u)}
                className={`px-3 py-2 cursor-pointer text-xs flex items-center gap-2 ${
                  isSelected ? 'bg-orange-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{u.name || '(이름 없음)'}</div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {u.email} · {u.phone_number || '-'} · {u.role ?? '-'}
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-orange-600" />}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={handlePromote}
          disabled={!selected || submitting}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-md disabled:opacity-50"
        >
          {submitting ? '처리 중...' : '영업사원으로 지정'}
        </button>
      </div>
    </div>
  );
}
