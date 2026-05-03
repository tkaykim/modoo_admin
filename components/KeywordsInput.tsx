'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';

interface KeywordsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

let suggestionsCache: { ranked: string[]; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadSuggestions(): Promise<string[]> {
  if (suggestionsCache && Date.now() - suggestionsCache.loadedAt < CACHE_TTL_MS) {
    return suggestionsCache.ranked;
  }
  const supabase = createClient();
  const { data, error } = await supabase.from('products').select('keywords');
  if (error || !data) {
    return suggestionsCache?.ranked ?? [];
  }
  const counts = new Map<string, number>();
  for (const row of data as Array<{ keywords: string[] | null }>) {
    for (const kw of row.keywords ?? []) {
      const trimmed = (kw ?? '').trim();
      if (!trimmed) continue;
      counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kw]) => kw);
  suggestionsCache = { ranked, loadedAt: Date.now() };
  return ranked;
}

export default function KeywordsInput({ value, onChange, placeholder }: KeywordsInputProps) {
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSuggestions().then((s) => {
      if (!cancelled) setSuggestions(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalized = draft.trim();
  const filtered = useMemo(() => {
    const exclude = new Set(value);
    const list = suggestions.filter((s) => !exclude.has(s));
    if (!normalized) return list.slice(0, 8);
    const lower = normalized.toLowerCase();
    return list.filter((s) => s.toLowerCase().includes(lower)).slice(0, 8);
  }, [suggestions, value, normalized]);

  const canAddNew =
    normalized.length > 0 &&
    !value.includes(normalized) &&
    !filtered.some((s) => s.toLowerCase() === normalized.toLowerCase());

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...value, trimmed]);
    setDraft('');
    setFocusedIndex(-1);
  };

  const removeAt = (idx: number) => {
    const next = value.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    const options = canAddNew ? [...filtered, `__new__:${normalized}`] : filtered;

    if (e.key === 'Enter' || e.key === ',' || (e.key === ' ' && normalized.length > 0)) {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < options.length) {
        const choice = options[focusedIndex];
        commit(choice.startsWith('__new__:') ? choice.slice('__new__:'.length) : choice);
      } else if (normalized) {
        commit(normalized);
      }
      return;
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setFocusedIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(-1, i - 1));
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setFocusedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[42px] px-2 py-1.5 rounded-md border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500"
        onClick={() => {
          const input = containerRef.current?.querySelector('input');
          (input as HTMLInputElement | null)?.focus();
        }}
      >
        {value.map((kw, idx) => (
          <span
            key={`${kw}-${idx}`}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
          >
            #{kw}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(idx);
              }}
              className="hover:bg-blue-200 rounded-full p-0.5"
              aria-label={`${kw} 삭제`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setFocusedIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder ?? '키워드를 입력하고 Enter (예: 단체티, 행사용)' : ''}
          className="flex-1 min-w-[120px] outline-none text-sm py-1"
        />
      </div>

      {open && (filtered.length > 0 || canAddNew) && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
          {filtered.map((s, idx) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(s);
              }}
              onMouseEnter={() => setFocusedIndex(idx)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                focusedIndex === idx ? 'bg-blue-50' : ''
              }`}
            >
              #{s}
            </button>
          ))}
          {canAddNew && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(normalized);
              }}
              onMouseEnter={() => setFocusedIndex(filtered.length)}
              className={`w-full text-left px-3 py-2 text-sm border-t border-gray-100 hover:bg-green-50 ${
                focusedIndex === filtered.length ? 'bg-green-50' : ''
              }`}
            >
              <span className="text-green-700 font-medium">+ 신규 추가</span>{' '}
              <span className="text-gray-700">#{normalized}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
