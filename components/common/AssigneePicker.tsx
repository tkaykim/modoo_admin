'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Briefcase, X, Check, Loader2, ChevronDown } from 'lucide-react';

interface SalesmanRow {
  id: string;
  display_name: string | null;
  salesman_code: string | null;
  status: string | null;
}
interface StaffResponse {
  salesmen: SalesmanRow[];
}

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error('Failed to load staff');
  return r.json();
});

export interface AssigneePickerValue {
  id: string;
  label: string;
  sub?: string | null;
}

interface AssigneePickerProps {
  value: AssigneePickerValue | null;
  onChange: (next: string | null) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}

export default function AssigneePicker({
  value,
  onChange,
  disabled = false,
  placeholder = '+ 영업담당자 지정',
}: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useSWR<StaffResponse>(
    open ? '/api/admin/assignable-staff' : null,
    fetcher,
  );

  const items = useMemo(() => {
    if (!data?.salesmen) return [];
    return data.salesmen.map((s) => ({
      id: s.id,
      label: s.display_name || s.salesman_code || s.id.slice(0, 8),
      sub: s.salesman_code,
    }));
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        (it.sub ?? '').toLowerCase().includes(q),
    );
  }, [items, query]);

  const handleSelect = async (id: string | null) => {
    if (saving) return;
    setSaving(true);
    try {
      await onChange(id);
      setOpen(false);
      setQuery('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative inline-block text-sm">
      {value ? (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200">
          <Briefcase className="w-3.5 h-3.5 text-emerald-700" />
          <span className="font-medium text-emerald-900">{value.label}</span>
          {value.sub ? (
            <span className="text-[11px] text-emerald-700/70">{value.sub}</span>
          ) : null}
          {!disabled && (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="ml-1 text-[11px] text-emerald-700 hover:text-emerald-900 underline"
              >
                변경
              </button>
              <button
                type="button"
                onClick={() => handleSelect(null)}
                disabled={saving}
                className="ml-1 text-[11px] text-red-600 hover:text-red-800 disabled:opacity-50"
                title="영업담당자 해제"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              </button>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>{placeholder}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1 z-30 w-64 bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="영업사원 검색..."
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-emerald-400"
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {isLoading ? (
              <div className="p-3 text-center text-xs text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> 불러오는 중...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-500">결과 없음</div>
            ) : (
              filtered.map((it) => {
                const selected = value?.id === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handleSelect(it.id)}
                    disabled={saving}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50 disabled:opacity-50 ${
                      selected ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{it.label}</div>
                      {it.sub ? (
                        <div className="text-[11px] text-gray-500 truncate">{it.sub}</div>
                      ) : null}
                    </div>
                    {selected && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          <div className="p-2 border-t border-gray-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              disabled={saving || !value}
              className="text-xs text-red-600 hover:text-red-800 disabled:text-gray-400"
            >
              지정 해제
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
