'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Check, Package, Loader2 } from 'lucide-react';
import { Product } from '@/types/types';

interface ProductMultiSelectProps {
  selectedProductIds: string[];
  onSelectionChange: (productIds: string[]) => void;
  onConfirm: () => void;
  onBack: () => void;
  excludeProductIds?: string[];
}

export default function ProductMultiSelect({
  selectedProductIds,
  onSelectionChange,
  onConfirm,
  onBack,
  excludeProductIds = [],
}: ProductMultiSelectProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch('/api/admin/products');
        if (!response.ok) {
          throw new Error('제품 목록을 불러오지 못했습니다.');
        }

        const result = await response.json();
        // Only show active products
        setProducts((result.data || []).filter((p: Product) => p.is_active));
      } catch (err) {
        console.error('Fetch products error:', err);
        setError(err instanceof Error ? err.message : '제품 목록을 불러오지 못했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Filter products by search query and exclude already-added products
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Exclude already-added products
    if (excludeProductIds.length > 0) {
      filtered = filtered.filter((p) => !excludeProductIds.includes(p.id));
    }

    if (!searchQuery.trim()) return filtered;

    const query = searchQuery.toLowerCase();
    return filtered.filter(
      (product) =>
        product.title.toLowerCase().includes(query) ||
        product.product_code?.toLowerCase().includes(query) ||
        product.category?.toLowerCase().includes(query)
    );
  }, [products, searchQuery, excludeProductIds]);

  // Toggle product selection
  const toggleProduct = (productId: string) => {
    if (selectedProductIds.includes(productId)) {
      onSelectionChange(selectedProductIds.filter((id) => id !== productId));
    } else {
      onSelectionChange([...selectedProductIds, productId]);
    }
  };

  // Select all visible products
  const selectAll = () => {
    const allVisibleIds = filteredProducts.map((p) => p.id);
    const newSelected = new Set([...selectedProductIds, ...allVisibleIds]);
    onSelectionChange(Array.from(newSelected));
  };

  // Deselect all visible products
  const deselectAll = () => {
    const visibleIds = new Set(filteredProducts.map((p) => p.id));
    onSelectionChange(selectedProductIds.filter((id) => !visibleIds.has(id)));
  };

  // Check if a product is selected
  const isSelected = (productId: string) => selectedProductIds.includes(productId);

  // Get selected product objects
  const selectedProducts = products.filter((p) => selectedProductIds.includes(p.id));

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-gray-600">제품 목록을 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
        <button
          onClick={onBack}
          className="mt-4 py-2 px-4 text-gray-600 hover:text-gray-800"
        >
          뒤로 가기
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-4">제품 선택</h2>
      <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
        로고를 적용할 제품을 선택해주세요. 여러 개를 선택할 수 있습니다.
      </p>

      {/* Search and actions */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-3 sm:mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          <input
            type="text"
            placeholder="제품명, 제품코드 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 sm:pl-10 pr-4 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="flex-1 sm:flex-none py-2 px-3 sm:px-4 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            전체 선택
          </button>
          <button
            onClick={deselectAll}
            className="flex-1 sm:flex-none py-2 px-3 sm:px-4 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            선택 해제
          </button>
        </div>
      </div>

      {/* Selection count */}
      <div className="mb-3 sm:mb-4 text-xs sm:text-sm text-gray-600">
        {selectedProductIds.length}개 선택됨 / 총 {products.length}개 제품
      </div>

      {/* Product grid */}
      {filteredProducts.length === 0 ? (
        <div className="py-8 sm:py-12 text-center text-gray-500">
          <Package className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 text-gray-300" />
          <p className="text-sm sm:text-base">검색 결과가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-4 max-h-100 overflow-y-auto p-0.5 sm:p-1">
          {filteredProducts.map((product) => {
            const selected = isSelected(product.id);
            return (
              <button
                key={product.id}
                onClick={() => toggleProduct(product.id)}
                className={`relative p-1.5 sm:p-2 rounded-lg border-2 transition-all text-left ${
                  selected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                }`}
              >
                {/* Selection indicator */}
                {selected && (
                  <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 bg-blue-500 rounded-full flex items-center justify-center z-10">
                    <Check className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                  </div>
                )}

                {/* Product image */}
                <div className="aspect-square bg-gray-100 rounded-md overflow-hidden mb-1.5 sm:mb-2">
                  {product.thumbnail_image_link?.[0] ? (
                    <img
                      src={product.thumbnail_image_link[0]}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-6 h-6 sm:w-8 sm:h-8 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Product info */}
                <p className="text-xs sm:text-sm font-medium text-gray-800 truncate">
                  {product.title}
                </p>
                {product.product_code && (
                  <p className="text-xs text-gray-500 truncate">
                    {product.product_code}
                  </p>
                )}
                <p className="text-xs text-gray-600 mt-0.5 sm:mt-1">
                  ₩{product.base_price.toLocaleString('ko-KR')}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected products summary */}
      {selectedProducts.length > 0 && (
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
          <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2">선택된 제품:</p>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {selectedProducts.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 bg-white border border-gray-200 rounded-full text-xs sm:text-sm"
              >
                <span className="truncate max-w-25 sm:max-w-37.5">{product.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleProduct(product.id);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 sm:gap-4 mt-4 sm:mt-6">
        <button
          onClick={onBack}
          className="flex-1 py-3 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base"
        >
          이전
        </button>
        <button
          onClick={onConfirm}
          disabled={selectedProductIds.length === 0}
          className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
        >
          다음 ({selectedProductIds.length}개 선택)
        </button>
      </div>
    </div>
  );
}
