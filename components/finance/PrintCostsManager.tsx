'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Printer } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';

type CostRow = {
  id: string;
  print_method_id: string;
  product_id: string | null;
  placement: string | null;
  color_count: number | null;
  size_class: string | null;
  unit_cost: number;
  setup_cost: number;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
};
type Method = { id: string; name: string };

export default function PrintCostsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [methods, setMethods] = useState<Method[]>([]);
  const [methodId, setMethodId] = useState('');
  const [rows, setRows] = useState<CostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ placement: '', color_count: '', size_class: '', unit_cost: '', setup_cost: '0', effective_from: new Date().toISOString().slice(0, 10), note: '' });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('print_methods').select('id, name').eq('is_active', true).order('sort_order');
      setMethods((data || []) as Method[]);
    })();
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!methodId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('print_method_costs').select('*').eq('print_method_id', methodId).order('effective_from', { ascending: false });
      if (error) throw error;
      setRows((data || []) as CostRow[]);
    } catch (e: any) {
      setError(e?.message || '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, methodId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async () => {
    if (!methodId || !draft.unit_cost) {
      setError('인쇄방법·단가 필수');
      return;
    }
    setError(null);
    try {
      const { error: insErr } = await supabase.from('print_method_costs').insert({
        print_method_id: methodId,
        product_id: null,
        placement: draft.placement || null,
        color_count: draft.color_count ? Number(draft.color_count) : null,
        size_class: draft.size_class || null,
        unit_cost: Number(draft.unit_cost),
        setup_cost: Number(draft.setup_cost || 0),
        effective_from: new Date(draft.effective_from).toISOString(),
        note: draft.note || null,
      });
      if (insErr) throw insErr;
      setDraft({ ...draft, unit_cost: '', note: '' });
      refresh();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('삭제?')) return;
    const { error } = await supabase.from('print_method_costs').delete().eq('id', id);
    if (error) setError(error.message);
    else refresh();
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-4">
        <Printer className="w-6 h-6 text-amber-700" />
        <h1 className="text-xl font-bold">인쇄비 시세표</h1>
      </div>

      <div className="bg-white border rounded p-3 mb-3">
        <label className="text-sm font-medium">인쇄 방법</label>
        <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className="ml-2 border rounded px-2 py-1">
          <option value="">-- 선택 --</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}

      {methodId && (
        <div className="bg-white border rounded p-3">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr><th>placement</th><th>색상수</th><th>면적</th><th className="text-right">단가</th><th className="text-right">판비</th><th>유효시작</th><th>유효종료</th><th>메모</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td>{r.placement || '-'}</td>
                    <td>{r.color_count ?? '-'}</td>
                    <td>{r.size_class || '-'}</td>
                    <td className="text-right">{Number(r.unit_cost).toLocaleString('ko-KR')}</td>
                    <td className="text-right">{Number(r.setup_cost).toLocaleString('ko-KR')}</td>
                    <td>{new Date(r.effective_from).toLocaleDateString('ko-KR')}</td>
                    <td>{r.effective_to ? new Date(r.effective_to).toLocaleDateString('ko-KR') : '진행중'}</td>
                    <td className="text-gray-500 truncate">{r.note}</td>
                    <td><button onClick={() => remove(r.id)} className="text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} className="text-gray-500 py-2">없음</td></tr>}
              </tbody>
            </table>
          )}

          <div className="mt-3 border-t pt-3 grid grid-cols-8 gap-1 text-xs items-center">
            <input placeholder="placement" value={draft.placement} onChange={(e) => setDraft({ ...draft, placement: e.target.value })} className="border rounded px-1 py-1" />
            <input type="number" placeholder="색상수" value={draft.color_count} onChange={(e) => setDraft({ ...draft, color_count: e.target.value })} className="border rounded px-1 py-1 text-right" />
            <input placeholder="면적" value={draft.size_class} onChange={(e) => setDraft({ ...draft, size_class: e.target.value })} className="border rounded px-1 py-1" />
            <input type="number" placeholder="단가" value={draft.unit_cost} onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value })} className="border rounded px-1 py-1 text-right" />
            <input type="number" placeholder="판비" value={draft.setup_cost} onChange={(e) => setDraft({ ...draft, setup_cost: e.target.value })} className="border rounded px-1 py-1 text-right" />
            <input type="date" value={draft.effective_from} onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })} className="border rounded px-1 py-1" />
            <input placeholder="메모" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="border rounded px-1 py-1" />
            <button onClick={add} className="bg-amber-600 text-white rounded px-2 py-1 hover:bg-amber-700"><Plus className="w-3 h-3 inline" /> 추가</button>
          </div>
        </div>
      )}
    </div>
  );
}
