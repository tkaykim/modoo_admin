'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Package } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';

type CostRow = {
  id: string;
  product_id: string;
  manufacturer_color_id: string | null;
  size: string | null;
  unit_cost: number;
  size_surcharge: number;
  effective_from: string;
  effective_to: string | null;
  source_label: string | null;
  note: string | null;
};

type SizeOption = { label: string; size_code: string };

type Product = {
  id: string;
  title: string;
  product_code: string | null;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  size_options: SizeOption[] | null;
};

type ProductColor = {
  id: string;
  manufacturer_color_id: string;
  color_name: string;
  color_code: string;
  hex: string;
};

export default function ProductCostsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [colors, setColors] = useState<ProductColor[]>([]);
  const [rows, setRows] = useState<CostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    size: '',
    manufacturer_color_id: '',
    unit_cost: '',
    size_surcharge: '0',
    effective_from: new Date().toISOString().slice(0, 10),
    note: '',
  });

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId) || null, [products, productId]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, product_code, manufacturer_id, size_options, manufacturer:manufacturers(name)')
        .eq('is_active', true)
        .order('title');
      if (error) {
        setError(error.message);
        return;
      }
      const list: Product[] = (data || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        product_code: p.product_code,
        manufacturer_id: p.manufacturer_id,
        manufacturer_name: Array.isArray(p.manufacturer) ? p.manufacturer[0]?.name : p.manufacturer?.name,
        size_options: p.size_options,
      }));
      setProducts(list);
    })();
  }, [supabase]);

  // Load colors when product changes
  useEffect(() => {
    if (!productId) {
      setColors([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('product_colors')
        .select('id, manufacturer_color_id, manufacturer_color:manufacturer_colors(id, name, color_code, hex)')
        .eq('product_id', productId)
        .eq('is_active', true)
        .order('sort_order');
      if (error) {
        setError(error.message);
        return;
      }
      const list: ProductColor[] = (data || []).map((row: any) => {
        const mc = Array.isArray(row.manufacturer_color) ? row.manufacturer_color[0] : row.manufacturer_color;
        return {
          id: row.id,
          manufacturer_color_id: row.manufacturer_color_id,
          color_name: mc?.name || '-',
          color_code: mc?.color_code || '',
          hex: mc?.hex || '#cccccc',
        };
      });
      setColors(list);
    })();
  }, [supabase, productId]);

  const refresh = useCallback(async () => {
    if (!productId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_costs')
        .select('*')
        .eq('product_id', productId)
        .order('effective_from', { ascending: false });
      if (error) throw error;
      setRows((data || []) as CostRow[]);
    } catch (e: any) {
      setError(e?.message || '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [supabase, productId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const colorById = useMemo(() => {
    const m = new Map<string, ProductColor>();
    for (const c of colors) m.set(c.manufacturer_color_id, c);
    return m;
  }, [colors]);

  const addCost = async () => {
    if (!productId || !draft.unit_cost) {
      setError('제품·단가 필수');
      return;
    }
    setError(null);
    try {
      const effectiveFromIso = new Date(draft.effective_from).toISOString();
      // close current open rows (same color+size dimension)
      let closeQuery = supabase
        .from('product_costs')
        .update({ effective_to: effectiveFromIso })
        .eq('product_id', productId)
        .is('effective_to', null);
      closeQuery = draft.size ? closeQuery.eq('size', draft.size) : closeQuery.is('size', null);
      closeQuery = draft.manufacturer_color_id
        ? closeQuery.eq('manufacturer_color_id', draft.manufacturer_color_id)
        : closeQuery.is('manufacturer_color_id', null);
      await closeQuery;

      const { error: insErr } = await supabase.from('product_costs').insert({
        product_id: productId,
        manufacturer_color_id: draft.manufacturer_color_id || null,
        size: draft.size || null,
        unit_cost: Number(draft.unit_cost),
        size_surcharge: Number(draft.size_surcharge || 0),
        effective_from: effectiveFromIso,
        note: draft.note || null,
      });
      if (insErr) throw insErr;
      setDraft({ ...draft, unit_cost: '', note: '' });
      refresh();
    } catch (e: any) {
      setError(e?.message || '저장 실패');
    }
  };

  const removeRow = async (id: string) => {
    if (!confirm('삭제할까요?')) return;
    const { error } = await supabase.from('product_costs').delete().eq('id', id);
    if (error) setError(error.message);
    else refresh();
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-4">
        <Package className="w-6 h-6 text-amber-700" />
        <h1 className="text-xl font-bold">제품 원가표</h1>
      </div>

      <div className="bg-white border rounded p-3 mb-3">
        <label className="text-sm font-medium block mb-1">제품 선택</label>
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="border rounded px-2 py-1 w-full max-w-2xl"
        >
          <option value="">-- 선택 --</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              [{p.manufacturer_name || '제조사미상'}] {p.title} ({p.product_code || '코드없음'})
            </option>
          ))}
        </select>

        {selectedProduct && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm bg-gray-50 rounded p-3">
            <div>
              <div className="text-[11px] text-gray-500">제조사</div>
              <div className="font-medium">{selectedProduct.manufacturer_name || '-'}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500">제품 코드</div>
              <div className="font-mono">{selectedProduct.product_code || '-'}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500">제품명</div>
              <div className="font-medium">{selectedProduct.title}</div>
            </div>
            <div className="md:col-span-3">
              <div className="text-[11px] text-gray-500 mb-1">취급 사이즈 ({selectedProduct.size_options?.length || 0})</div>
              <div className="flex flex-wrap gap-1">
                {(selectedProduct.size_options || []).map((s) => (
                  <span key={s.size_code} className="px-2 py-0.5 bg-white border rounded text-xs">{s.label}</span>
                ))}
                {(!selectedProduct.size_options || selectedProduct.size_options.length === 0) && (
                  <span className="text-xs text-gray-400">사이즈 정보 없음</span>
                )}
              </div>
            </div>
            <div className="md:col-span-3">
              <div className="text-[11px] text-gray-500 mb-1">취급 색상 ({colors.length})</div>
              <div className="flex flex-wrap gap-1">
                {colors.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border rounded text-xs">
                    <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: c.hex }} />
                    {c.color_name} <span className="text-gray-400 font-mono">{c.color_code}</span>
                  </span>
                ))}
                {colors.length === 0 && <span className="text-xs text-gray-400">색상 정보 없음</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <div className="text-red-600 mb-2 text-sm">{error}</div>}

      {productId && (
        <div className="bg-white border rounded p-3">
          <div className="text-sm font-semibold mb-2">원가 이력</div>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="text-left p-1">사이즈</th>
                    <th className="text-left p-1">색상</th>
                    <th className="text-right p-1">단가</th>
                    <th className="text-right p-1">사이즈+</th>
                    <th className="text-left p-1">유효시작</th>
                    <th className="text-left p-1">유효종료</th>
                    <th className="text-left p-1">메모</th>
                    <th className="p-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const c = r.manufacturer_color_id ? colorById.get(r.manufacturer_color_id) : null;
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="p-1">{r.size || <span className="text-gray-400">전체</span>}</td>
                        <td className="p-1">
                          {c ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: c.hex }} />
                              {c.color_name}
                            </span>
                          ) : r.manufacturer_color_id ? (
                            <span className="font-mono text-[10px]">{r.manufacturer_color_id.slice(0, 8)}</span>
                          ) : (
                            <span className="text-gray-400">전체</span>
                          )}
                        </td>
                        <td className="p-1 text-right">{Number(r.unit_cost).toLocaleString('ko-KR')}원</td>
                        <td className="p-1 text-right">{Number(r.size_surcharge).toLocaleString('ko-KR')}원</td>
                        <td className="p-1">{new Date(r.effective_from).toLocaleDateString('ko-KR')}</td>
                        <td className="p-1">{r.effective_to ? new Date(r.effective_to).toLocaleDateString('ko-KR') : <span className="text-amber-700 font-semibold">진행중</span>}</td>
                        <td className="p-1 text-gray-500 truncate max-w-[20ch]">{r.note}</td>
                        <td className="p-1 text-right">
                          <button onClick={() => removeRow(r.id)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-gray-500 py-3 text-center">등록된 원가 없음</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 border-t pt-3">
            <div className="text-xs font-semibold mb-1.5">원가 추가 / 인상</div>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2 text-xs items-center">
              <select value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })} className="border rounded px-1 py-1">
                <option value="">사이즈: 전체</option>
                {(selectedProduct?.size_options || []).map((s) => (
                  <option key={s.size_code} value={s.size_code}>{s.label}</option>
                ))}
              </select>
              <select value={draft.manufacturer_color_id} onChange={(e) => setDraft({ ...draft, manufacturer_color_id: e.target.value })} className="border rounded px-1 py-1 md:col-span-2">
                <option value="">색상: 전체</option>
                {colors.map((c) => (
                  <option key={c.id} value={c.manufacturer_color_id}>{c.color_name} ({c.color_code})</option>
                ))}
              </select>
              <input type="number" placeholder="단가" value={draft.unit_cost} onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value })} className="border rounded px-1 py-1 text-right" />
              <input type="number" placeholder="사이즈 추가금" value={draft.size_surcharge} onChange={(e) => setDraft({ ...draft, size_surcharge: e.target.value })} className="border rounded px-1 py-1 text-right" />
              <input type="date" value={draft.effective_from} onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })} className="border rounded px-1 py-1" />
              <button onClick={addCost} className="bg-amber-600 text-white rounded px-2 py-1 hover:bg-amber-700">
                <Plus className="w-3 h-3 inline" /> 추가/인상
              </button>
            </div>
            <input
              placeholder="메모 (예: 2026년 4월 인상)"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              className="border rounded px-2 py-1 mt-2 w-full text-xs"
            />
            <div className="text-[11px] text-gray-500 mt-1">
              "추가/인상": 같은 제품·사이즈·색상의 진행중 행을 자동 마감(effective_to=신규 시작일)하고 새 행을 INSERT.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
