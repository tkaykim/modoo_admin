'use client';

import { useEffect, useRef, useState } from 'react';
import type { Product, SavedDesign } from '@/types/types';
import { createMallDraft, type MallProductDraft } from '@/lib/partner-mall-design';
import MallProductDesignEditor from './MallProductDesignEditor';

export default function MallProductWorkbench({ value, onChange, logoUrl }: {
  value: MallProductDraft[];
  onChange: (items: MallProductDraft[]) => void;
  logoUrl?: string;
}) {
  const [source, setSource] = useState<'new' | 'existing'>('existing');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<MallProductDraft | null>(null);
  const [opening, setOpening] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try {
        const url = source === 'existing'
          ? `/api/admin/designs?limit=12&page=${page}&search=${encodeURIComponent(query)}`
          : '/api/admin/products';
        const r = await fetch(url, { signal: controller.signal });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || '목록을 불러오지 못했습니다.');
        if (controller.signal.aborted) return;
        if (source === 'existing') { setDesigns(data.data || []); setPages(Math.max(1, data.totalPages || 1)); }
        else { setProducts(data.data || []); setPages(1); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '목록 조회 실패'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [source, query, page]);

  const choose = async (product?: Product, design?: SavedDesign) => {
    if (opening) return;
    setOpening(true); setError('');
    try {
      let fullProduct = product;
      if (design) {
        const r = await fetch('/api/admin/products');
        if (!r.ok) throw new Error('제품을 불러오지 못했습니다.');
        const data = await r.json();
        fullProduct = (data.data || []).find((p: Product) => p.id === design.product_id);
      }
      if (!fullProduct?.configuration?.length) throw new Error('이 디자인의 제품 또는 인쇄 면 정보를 찾을 수 없습니다.');
      setEditing(createMallDraft(fullProduct, design));
    } catch (e) { setError(e instanceof Error ? e.message : '디자인을 불러오지 못했습니다.'); }
    finally { setOpening(false); }
  };

  const filtered = products.filter(p => p.is_active !== false && `${p.title} ${p.product_code || ''}`.toLowerCase().includes(query.toLowerCase()));
  const shown = source === 'existing' ? designs : filtered;
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={source === 'new'} onClick={() => { setSource('new'); setPage(1); setQuery(''); }} className={`rounded-lg border px-4 py-2 ${source === 'new' ? 'bg-blue-600 text-white' : 'bg-white'}`}>새 디자인</button>
      <button type="button" aria-pressed={source === 'existing'} onClick={() => { setSource('existing'); setPage(1); setQuery(''); }} className={`rounded-lg border px-4 py-2 ${source === 'existing' ? 'bg-blue-600 text-white' : 'bg-white'}`}>기존 디자인 불러오기</button>
    </div>
    <input aria-label="제품 및 디자인 검색" placeholder={source === 'existing' ? '디자인명, 고객명, 제품명, 주문번호 검색' : '제품명, 제품코드 검색'} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} className="w-full rounded-lg border p-3 text-sm" />
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p className="py-6 text-sm">목록을 불러오는 중...</p> : <>
      <div className="grid max-h-80 grid-cols-2 gap-3 overflow-auto md:grid-cols-4">
        {shown.map(item => {
          const design = source === 'existing' ? item as SavedDesign : undefined;
          const product = source === 'new' ? item as Product : undefined;
          const preview = design?.preview_url || product?.thumbnail_image_link?.[0];
          return <button type="button" disabled={opening} key={item.id} onClick={() => choose(product, design)} className="rounded-lg border bg-white p-3 text-left hover:border-blue-600">
            {preview ? <img src={preview} alt="" className="h-24 w-full object-contain" /> : <div className="flex h-24 items-center justify-center bg-gray-50 text-xs">미리보기 없음</div>}
            <p className="mt-2 text-sm font-medium">{item.title || '이름 없는 디자인'}</p>
            <p className="text-xs text-gray-500">{design?.product?.title || product?.product_code}</p>
            {design?.user?.name && <p className="text-xs text-gray-500">{design.user.name}</p>}
          </button>;
        })}
      </div>
      {shown.length === 0 && <p className="text-sm text-gray-500">검색 결과가 없습니다.</p>}
      {source === 'existing' && <div className="flex items-center justify-center gap-4 text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>다음</button></div>}
    </>}
    <div className="border-t pt-4">
      <h3 className="mb-3 font-semibold">진열할 상품 {value.length}개</h3>
      {value.length === 0 && <p className="text-sm text-gray-500">디자인을 선택하고 전체 면을 확인한 뒤 편집을 완료해주세요.</p>}
      <div className="space-y-2">{value.map(item => <div key={item.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
        {item.preview_url && <img src={item.preview_url} alt="" className="h-16 w-16 object-contain" />}
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.display_name}</p><p className="text-xs text-gray-500">{item.color_name || item.color_hex} · {Object.keys(item.canvas_state).length}개 면 · {item.price === null ? '기본 가격' : `${item.price.toLocaleString()}원`}</p></div>
        <button type="button" onClick={() => setEditing(item)} className="rounded border px-3 py-2 text-sm">전체 면 수정</button>
        <button type="button" onClick={() => onChange([...value, { ...structuredClone(item), key: crypto.randomUUID(), display_name: `${item.display_name} 복사본` }])} className="rounded border px-3 py-2 text-sm">복제</button>
        <button type="button" onClick={() => onChange(value.filter(v => v.key !== item.key))} className="px-2 text-sm text-red-600">목록에서 빼기</button>
      </div>)}</div>
    </div>
    {editing && <MallProductDesignEditor key={editing.key} draft={editing} logoUrl={logoUrl} onCancel={() => setEditing(null)} onSave={next => {
      const current = valueRef.current;
      onChange(current.some(v => v.key === next.key) ? current.map(v => v.key === next.key ? next : v) : [...current, next]);
      setEditing(null);
    }} />}
  </section>;
}
