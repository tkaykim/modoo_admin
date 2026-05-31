'use client';

import { useState } from 'react';
import { X, Upload, Loader2, Package, Search, Check } from 'lucide-react';
import { Product } from '@/types/types';
import { createClient } from '@/lib/supabase-client';
import { uploadFileToStorage } from '@/lib/supabase-storage';
import type { OrderItemDraft } from './AdminOrderCreator';

interface QuickImageItemModalProps {
  products: Product[];
  onAdd: (item: OrderItemDraft) => void;
  onClose: () => void;
}

// 간이주문 항목 추가: 디자인(목업) 없이 "완성 이미지 + 제품"만으로 주문 항목을 만든다.
// 사이즈/수량/단가/할인은 추가 후 기존 주문 항목 UI에서 그대로 편집한다. 목업은 결제 후 에디터에서 채운다.
export default function QuickImageItemModal({ products, onAdd, onClose }: QuickImageItemModalProps) {
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = products.find((p) => p.id === selectedProductId) || null;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? products.filter((p) => p.title.toLowerCase().includes(q))
    : products;

  const selectedKeywords =
    ((selected as unknown as { keywords?: string[] } | null)?.keywords) || [];
  const selectedSizes = selected?.size_options || [];

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const res = await uploadFileToStorage(supabase, file, 'products', 'quick-order-images');
      if (!res.success || !res.url) throw new Error(res.error || '이미지 업로드에 실패했습니다.');
      setImageUrl(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleAdd = () => {
    if (!selected) {
      setError('제품을 선택해주세요.');
      return;
    }
    if (!imageUrl) {
      setError('완성 이미지를 업로드해주세요.');
      return;
    }
    const sizeOpts = selected.size_options || [];
    const item: OrderItemDraft = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_quick`,
      productId: selected.id,
      productTitle: selected.title,
      productThumbnail: selected.thumbnail_image_link?.[0] || null,
      designId: '',
      quickImage: true,
      designTitle: '',
      designPreviewUrl: imageUrl,
      basePrice: selected.base_price,
      sizeOptions: sizeOpts,
      variants: sizeOpts.map((o) => ({ sizeLabel: o.label, sizeCode: o.size_code, quantity: 0 })),
      pricingMode: 'auto',
      customUnitPrice: '',
      designPricePerItem: null,
    };
    onAdd(item);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900">간이 이미지 주문 추가</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <p className="text-xs text-gray-500">
            완성 이미지와 제품만으로 결제용 항목을 만듭니다. 사이즈·수량·단가·할인은 추가 후 주문 항목에서 조정하고, 실제 목업/면별 아트워크는 결제 후 에디터에서 채웁니다.
          </p>

          {/* 1) 제품 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">1. 제품 선택 (사이즈표·특징 참고)</label>
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="제품명으로 검색"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-400">제품이 없습니다</div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProductId(p.id)}
                    className={`w-full flex items-center gap-3 p-2.5 text-left hover:bg-gray-50 ${selectedProductId === p.id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden shrink-0 flex items-center justify-center">
                      {p.thumbnail_image_link?.[0]
                        ? <img src={p.thumbnail_image_link[0]} alt={p.title} className="w-full h-full object-cover" />
                        : <Package className="w-5 h-5 text-gray-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                      <p className="text-xs text-gray-500">{(p.base_price ?? 0).toLocaleString()}원</p>
                    </div>
                    {selectedProductId === p.id && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                ))
              )}
            </div>
            {selected && (
              <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 space-y-1">
                {selectedSizes.length > 0 && (
                  <p><span className="text-gray-400">사이즈:</span> {selectedSizes.map((s) => s.label).join(' · ')}</p>
                )}
                {selectedKeywords.length > 0 && (
                  <p><span className="text-gray-400">특징:</span> {selectedKeywords.map((k) => `#${k.replace(/^#/, '')}`).join(' ')}</p>
                )}
              </div>
            )}
          </div>

          {/* 2) 이미지 업로드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">2. 완성 이미지 업로드</label>
            {imageUrl ? (
              <div className="flex items-center gap-3">
                <img src={imageUrl} alt="업로드 이미지" className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
                <button onClick={() => setImageUrl(null)} className="text-sm text-red-500 hover:underline">이미지 변경</button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400">
                {uploading ? <Loader2 className="w-6 h-6 animate-spin text-blue-500" /> : <Upload className="w-6 h-6 text-gray-400" />}
                <span className="text-sm text-gray-500">{uploading ? '업로드 중...' : '이미지 선택 (jpg, png 등)'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => { void handleUpload(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}
                />
              </label>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
          <button
            onClick={handleAdd}
            disabled={uploading || !selected || !imageUrl}
            className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            항목 추가
          </button>
        </div>
      </div>
    </div>
  );
}
