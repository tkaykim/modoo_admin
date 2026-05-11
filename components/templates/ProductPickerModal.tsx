'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { Product } from '@/types/types';

interface Props {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (productId: string) => void;
}

export default function ProductPickerModal({
  isOpen,
  title = '제품 선택',
  onClose,
  onSelect,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetch('/api/admin/products')
      .then((r) => r.json())
      .then((res) => {
        if (res?.error) throw new Error(res.error);
        setProducts((res?.data || []).filter((p: Product) => p.is_active));
      })
      .catch((e) => setError(e instanceof Error ? e.message : '제품을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) =>
      [p.title, p.manufacturers?.name ?? '', p.product_code ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [products, q]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제품명, 제조사, 코드 검색"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-black"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 text-center py-12">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">제품이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((p) => {
                const thumb = Array.isArray(p.thumbnail_image_link)
                  ? p.thumbnail_image_link[0]
                  : null;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p.id)}
                    className="text-left p-2 rounded-lg border border-gray-200 hover:border-black transition"
                  >
                    <div className="w-full aspect-square rounded-md overflow-hidden bg-gray-100 mb-2">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={p.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full" />
                      )}
                    </div>
                    {p.manufacturers?.name && (
                      <p className="text-[10px] text-gray-400 uppercase truncate">{p.manufacturers?.name}</p>
                    )}
                    <p className="text-xs font-medium text-gray-900 truncate">{p.title}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
