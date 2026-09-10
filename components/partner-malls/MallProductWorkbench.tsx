'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, ImageOff, PackagePlus, Copy, Trash2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
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
  const sectionRef = useRef<HTMLElement>(null);
  valueRef.current = value;
  const changePage = (next: number) => {
    setPage(next);
    const section = sectionRef.current;
    const scroller = section?.closest<HTMLElement>('[data-mall-scroll]');
    if (section && scroller) scroller.scrollTop += section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
  };

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
  const currentPages = source === 'existing' ? pages : Math.max(1, Math.ceil(filtered.length / 12));
  const shown = source === 'existing' ? designs : filtered.slice((page - 1) * 12, page * 12);
  return <section ref={sectionRef} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_272px]">
    <div className="min-w-0 space-y-4">
      <div className="flex w-fit max-w-full gap-1 rounded-lg bg-gray-100 p-1">
        <button type="button" aria-pressed={source === 'new'} onClick={() => { setSource('new'); setPage(1); setQuery(''); }} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${source === 'new' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>새 디자인</button>
        <button type="button" aria-pressed={source === 'existing'} onClick={() => { setSource('existing'); setPage(1); setQuery(''); }} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${source === 'existing' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>기존 디자인 불러오기</button>
      </div>
      <div className="relative"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input aria-label="제품 및 디자인 검색" placeholder={source === 'existing' ? '디자인명, 고객명, 제품명, 주문번호 검색' : '제품명, 제품코드 검색'} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></div>
      <p className="text-xs leading-5 text-gray-500">{source === 'existing' ? '디자인을 선택해 편집한 뒤 진열 목록에 추가하세요.' : '제품을 선택해 새 디자인을 만들어보세요.'}</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />목록을 불러오는 중...</div> : <>
      <div data-design-grid className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map(item => {
          const design = source === 'existing' ? item as SavedDesign : undefined;
          const product = source === 'new' ? item as Product : undefined;
          const preview = design?.preview_url || product?.thumbnail_image_link?.[0];
          return <button type="button" disabled={opening} key={item.id} onClick={() => choose(product, design)} className="group min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition-colors hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60">
            <div className="flex aspect-[4/3] items-center justify-center bg-gray-50 p-3">{preview ? <img src={preview} alt="" className="h-full w-full object-contain transition-transform group-hover:scale-105" /> : <div className="flex flex-col items-center gap-2 text-xs text-gray-400"><ImageOff className="h-6 w-6" />미리보기 없음</div>}</div>
            <div className="space-y-1 p-3"><p className="line-clamp-2 text-sm font-medium leading-5 text-gray-900" title={item.title || undefined}>{item.title || '이름 없는 디자인'}</p>
            <p className="truncate text-xs leading-5 text-gray-500" title={design?.product?.title || product?.product_code || ''}>{design?.product?.title || product?.product_code || '제품'}</p>
            {design?.user?.name && <p className="truncate text-xs text-gray-400">{design.user.name}</p>}</div>
          </button>;
        })}
      </div>
      {shown.length === 0 && <p className="py-12 text-center text-sm text-gray-500">검색 결과가 없습니다.</p>}
      <div className="flex items-center justify-center gap-3 pt-2 text-sm"><button type="button" disabled={page <= 1} onClick={() => changePage(page - 1)} className="flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-gray-600 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />이전</button><span className="min-w-16 text-center text-xs text-gray-500">{page} / {currentPages}</span><button type="button" disabled={page >= currentPages} onClick={() => changePage(page + 1)} className="flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-gray-600 hover:bg-gray-50 disabled:opacity-40">다음<ChevronRight className="h-4 w-4" /></button></div>
    </>}
    </div>
    <aside className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 lg:sticky lg:top-0">
      <h3 className="text-sm font-semibold text-gray-900">진열할 상품 {value.length}개</h3>
      {value.length === 0 && <div className="flex flex-col items-center py-8 text-center"><PackagePlus className="mb-3 h-8 w-8 text-gray-300" /><p className="text-sm text-gray-500">아직 담은 상품이 없습니다.</p><p className="mt-2 text-xs leading-5 text-gray-400">디자인을 선택하고 편집을 완료하면<br />이곳에 상품이 추가됩니다.</p></div>}
      <div className="mt-3 space-y-3">{value.map(item => <div key={item.key} className="rounded-lg bg-gray-50 p-3">
        <div className="flex items-start gap-3">{item.preview_url && <img src={item.preview_url} alt="" className="h-14 w-14 shrink-0 rounded-md bg-white object-contain" />}
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium leading-5">{item.display_name}</p><p className="mt-1 text-xs leading-5 text-gray-500">{Object.keys(item.canvas_state).length}개 면 · {item.price === null ? '기본 가격' : `${item.price.toLocaleString()}원`}</p>{(item.color_name || item.color_hex) && <p className="text-xs text-gray-500">{item.color_name || item.color_hex}</p>}</div></div>
        <div className="mt-3 flex gap-1"><button type="button" onClick={() => setEditing(item)} className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100">전체 면 수정</button>
        <button type="button" aria-label="복제" title="복제" onClick={() => onChange([...value, { ...structuredClone(item), key: crypto.randomUUID(), display_name: `${item.display_name} 복사본` }])} className="rounded-md p-2 text-gray-500 hover:bg-gray-200"><Copy className="h-4 w-4" /></button>
        <button type="button" aria-label="목록에서 빼기" title="목록에서 빼기" onClick={() => onChange(value.filter(v => v.key !== item.key))} className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
      </div>)}</div>
    </aside>
    {editing && <MallProductDesignEditor key={editing.key} draft={editing} logoUrl={logoUrl} onCancel={() => setEditing(null)} onSave={next => {
      const current = valueRef.current;
      onChange(current.some(v => v.key === next.key) ? current.map(v => v.key === next.key ? next : v) : [...current, next]);
      setEditing(null);
    }} />}
  </section>;
}
