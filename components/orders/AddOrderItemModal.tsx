'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Loader2, Package, Plus, Minus, ChevronDown, ChevronUp, ExternalLink, Check } from 'lucide-react';
import type { OrderItem, SizeOption } from '@/types/types';

interface DesignEntry {
  id: string;
  title: string | null;
  preview_url: string | null;
  product_id: string;
  price_per_item: number | null;
  product?: { title?: string } | null;
}

interface VariantInput {
  sizeLabel: string;
  sizeCode: string;
  quantity: number;
}

interface AddOrderItemModalProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
  initialDesignId?: string | null;
  editingItem?: OrderItem | null;
}

export default function AddOrderItemModal({ orderId, isOpen, onClose, onAdded, initialDesignId, editingItem }: AddOrderItemModalProps) {
  const isEditMode = !!editingItem;
  const [tab, setTab] = useState<'existing' | 'new'>('existing');

  const [searchQuery, setSearchQuery] = useState('');
  const [designs, setDesigns] = useState<DesignEntry[]>([]);
  const [designsLoading, setDesignsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedDesign, setSelectedDesign] = useState<DesignEntry | null>(null);
  const [sizeOptions, setSizeOptions] = useState<SizeOption[]>([]);
  const [variants, setVariants] = useState<VariantInput[]>([]);
  const [showVariants, setShowVariants] = useState(true);
  const [pricingMode, setPricingMode] = useState<'auto' | 'custom_unit_price'>('auto');
  const [customUnitPrice, setCustomUnitPrice] = useState('');

  const [products, setProducts] = useState<Array<{ id: string; title: string; thumbnail_image_link?: string[]; category?: string }>>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDesigns = useCallback(async (p: number, query: string) => {
    setDesignsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '12' });
      if (query.trim()) params.set('search', query.trim());
      const res = await fetch(`/api/admin/designs?${params}`);
      const json = await res.json();
      setDesigns(json.data || []);
      setTotalPages(json.pagination?.totalPages || 1);
    } catch {
      setDesigns([]);
    } finally {
      setDesignsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchDesigns(1, '');
    setPage(1);
    setSearchQuery('');
    setSelectedDesign(null);
    setError(null);
    setPricingMode('auto');
    setCustomUnitPrice('');

    if (editingItem) {
      const designEntry: DesignEntry = {
        id: editingItem.design_id || '',
        title: editingItem.design_title || editingItem.product_title,
        preview_url: editingItem.thumbnail_url,
        product_id: editingItem.product_id,
        price_per_item: editingItem.price_per_item,
      };
      setSelectedDesign(designEntry);
      setPricingMode('custom_unit_price');
      setCustomUnitPrice(String(editingItem.price_per_item));

      (async () => {
        try {
          const res = await fetch('/api/admin/products');
          const json = await res.json();
          const allProducts: Array<{ id: string; size_options?: SizeOption[] }> = json.data || [];
          const product = allProducts.find(p => p.id === editingItem.product_id);
          if (product?.size_options) {
            setSizeOptions(product.size_options);
            const existingVariants = editingItem.item_options?.variants;
            if (existingVariants && Array.isArray(existingVariants)) {
              setVariants(product.size_options.map(o => {
                const existing = existingVariants.find((ev: { size_id?: string }) => ev.size_id === o.size_code);
                return { sizeLabel: o.label, sizeCode: o.size_code, quantity: existing?.quantity ?? 0 };
              }));
            } else {
              setVariants(product.size_options.map(o => ({ sizeLabel: o.label, sizeCode: o.size_code, quantity: 0 })));
            }
          }
        } catch { /* noop */ }
      })();
      return;
    }

    if (initialDesignId) {
      (async () => {
        try {
          const res = await fetch(`/api/admin/designs/${initialDesignId}`);
          if (res.ok) {
            const d = await res.json();
            if (d.data) handleSelectDesign(d.data);
          }
        } catch { /* noop */ }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
    fetchDesigns(1, value);
  };

  const handleSelectDesign = async (design: DesignEntry) => {
    setSelectedDesign(design);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products`);
      const json = await res.json();
      const allProducts: Array<{ id: string; title: string; size_options?: SizeOption[]; thumbnail_image_link?: string[]; category?: string }> = json.data || [];
      const product = allProducts.find(p => p.id === design.product_id);
      if (product?.size_options) {
        setSizeOptions(product.size_options);
        setVariants(product.size_options.map(o => ({ sizeLabel: o.label, sizeCode: o.size_code, quantity: 0 })));
      } else {
        setSizeOptions([]);
        setVariants([]);
      }
    } catch {
      setSizeOptions([]);
      setVariants([]);
    }
  };

  const handleVariantQty = (idx: number, delta: number) => {
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, quantity: Math.max(0, v.quantity + delta) } : v));
  };

  const handleVariantInput = (idx: number, value: string) => {
    const q = parseInt(value, 10);
    if (isNaN(q) || q < 0) return;
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, quantity: q } : v));
  };

  const totalQty = variants.reduce((s, v) => s + v.quantity, 0);

  const unitPrice = pricingMode === 'custom_unit_price' && parseFloat(customUnitPrice) > 0
    ? parseFloat(customUnitPrice)
    : (selectedDesign?.price_per_item && selectedDesign.price_per_item > 0 ? selectedDesign.price_per_item : 0);

  const handleSubmit = async () => {
    if (!selectedDesign) return;
    if (totalQty <= 0) { setError('수량을 선택해주세요.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      if (isEditMode && editingItem) {
        const designChanged = selectedDesign.id !== editingItem.design_id;
        const body: Record<string, unknown> = {
          orderItemId: editingItem.id,
          updateMode: 'admin_edit',
          variants: variants.filter(v => v.quantity > 0),
          pricePerItem: pricingMode === 'custom_unit_price' ? parseFloat(customUnitPrice) : undefined,
        };
        if (designChanged) {
          body.designId = selectedDesign.id;
          body.productId = selectedDesign.product_id;
        }
        const res = await fetch('/api/admin/orders/items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || '수정에 실패했습니다.'); return; }
      } else {
        const res = await fetch('/api/admin/orders/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            designId: selectedDesign.id,
            productId: selectedDesign.product_id,
            variants: variants.filter(v => v.quantity > 0),
            pricingMode,
            customUnitPrice: pricingMode === 'custom_unit_price' ? parseFloat(customUnitPrice) : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || '추가에 실패했습니다.'); return; }
      }
      onAdded();
      onClose();
    } catch {
      setError(isEditMode ? '수정 중 오류가 발생했습니다.' : '추가 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen || tab !== 'new' || products.length > 0) return;
    setProductsLoading(true);
    fetch('/api/admin/products')
      .then(r => r.json())
      .then(json => setProducts(json.data || []))
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [isOpen, tab, products.length]);

  const filteredProducts = products.filter(p =>
    !productSearch.trim() || p.title.toLowerCase().includes(productSearch.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">{isEditMode ? '주문 상품 수정' : '주문 상품 추가'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {/* Tabs - hidden in edit mode */}
        {!isEditMode && (
          <div className="flex border-b">
            <button
              onClick={() => { setTab('existing'); setSelectedDesign(null); }}
              className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${tab === 'existing' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              기존 디자인 선택
            </button>
            <button
              onClick={() => { setTab('new'); setSelectedDesign(null); }}
              className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${tab === 'new' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              새 디자인 만들기
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'existing' && !selectedDesign && !isEditMode && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="디자인 검색..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {designsLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
              ) : designs.length === 0 ? (
                <div className="text-center py-12 text-gray-400">디자인이 없습니다</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {designs.map(d => (
                      <button
                        key={d.id}
                        onClick={() => handleSelectDesign(d)}
                        className="border border-gray-200 rounded-lg p-2 hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-left"
                      >
                        <div className="aspect-square bg-gray-100 rounded overflow-hidden mb-2">
                          {d.preview_url ? (
                            <img src={d.preview_url} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-gray-300" /></div>
                          )}
                        </div>
                        <p className="text-xs font-medium text-gray-900 truncate">{d.title || '무제'}</p>
                        <p className="text-xs text-gray-400 truncate">{d.product?.title || ''}</p>
                      </button>
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex justify-center gap-2 pt-2">
                      <button onClick={() => { setPage(p => Math.max(1, p - 1)); fetchDesigns(Math.max(1, page - 1), searchQuery); }} disabled={page <= 1} className="px-3 py-1.5 text-xs border rounded disabled:opacity-40">이전</button>
                      <span className="px-3 py-1.5 text-xs text-gray-500">{page} / {totalPages}</span>
                      <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); fetchDesigns(Math.min(totalPages, page + 1), searchQuery); }} disabled={page >= totalPages} className="px-3 py-1.5 text-xs border rounded disabled:opacity-40">다음</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {(tab === 'existing' || isEditMode) && selectedDesign && (
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                  {selectedDesign.preview_url ? (
                    <img src={selectedDesign.preview_url} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-gray-300" /></div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{selectedDesign.title || '무제'}</h3>
                  <p className="text-sm text-gray-500 mt-1">{selectedDesign.product?.title || ''}</p>
                  <button onClick={() => setSelectedDesign(null)} className="text-xs text-blue-600 hover:text-blue-800 mt-2">다른 디자인 선택</button>
                </div>
              </div>

              {/* Size/Quantity */}
              {variants.length > 0 && (
                <div>
                  <button onClick={() => setShowVariants(!showVariants)} className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                    사이즈별 수량 {showVariants ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showVariants && (
                    <div className="space-y-2">
                      {variants.map((v, i) => (
                        <div key={v.sizeCode} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">{v.sizeLabel}</span>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => handleVariantQty(i, -1)} disabled={v.quantity <= 0} className="p-1.5 rounded bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40">
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number" min="0" value={v.quantity}
                              onChange={e => handleVariantInput(i, e.target.value)}
                              className="w-14 text-center p-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button type="button" onClick={() => handleVariantQty(i, 1)} className="p-1.5 rounded bg-white border border-gray-200 hover:bg-gray-100">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">총 수량: {totalQty}개</p>
                </div>
              )}

              {/* Pricing */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">단가 설정</label>
                <div className="flex gap-3 mb-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" checked={pricingMode === 'auto'} onChange={() => setPricingMode('auto')} className="w-4 h-4 text-blue-600" />
                    자동 ({unitPrice > 0 && pricingMode === 'auto' ? `${unitPrice.toLocaleString()}원` : '기본가'})
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" checked={pricingMode === 'custom_unit_price'} onChange={() => setPricingMode('custom_unit_price')} className="w-4 h-4 text-blue-600" />
                    직접 입력
                  </label>
                </div>
                {pricingMode === 'custom_unit_price' && (
                  <div className="relative">
                    <input
                      type="number" min="0" value={customUnitPrice}
                      onChange={e => setCustomUnitPrice(e.target.value)}
                      placeholder="단가 입력"
                      className="w-full p-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                  </div>
                )}
              </div>

              {totalQty > 0 && unitPrice > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg flex justify-between items-center">
                  <span className="text-sm text-blue-700">소계</span>
                  <span className="text-sm font-bold text-blue-800">{(unitPrice * totalQty).toLocaleString()}원</span>
                </div>
              )}

              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          )}

          {tab === 'new' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">제품을 선택하면 에디터에서 새 디자인을 만들 수 있습니다.</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="제품 검색..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {productsLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {filteredProducts.map(p => (
                    <a
                      key={p.id}
                      href={`/editor/${p.id}?mode=design&returnUrl=${encodeURIComponent(`/orders/${orderId}?addItem=true`)}`}
                      className="border border-gray-200 rounded-lg p-2 hover:border-blue-400 hover:bg-blue-50/50 transition-colors block"
                    >
                      <div className="aspect-square bg-gray-100 rounded overflow-hidden mb-2">
                        {p.thumbnail_image_link?.[0] ? (
                          <img src={p.thumbnail_image_link[0]} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-gray-300" /></div>
                        )}
                      </div>
                      <p className="text-xs font-medium text-gray-900 truncate">{p.title}</p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-blue-600">
                        <ExternalLink className="w-3 h-3" /> 에디터 열기
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(tab === 'existing' || isEditMode) && selectedDesign && (
          <div className="px-6 py-4 border-t flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">취소</button>
            <button
              onClick={handleSubmit}
              disabled={submitting || totalQty <= 0}
              className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : isEditMode ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isEditMode ? '변경 저장' : '상품 추가'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
