'use client';

import { useState, useRef } from 'react';
import useSWR from 'swr';
import { Product } from '@/types/types';
import { Eye, EyeOff, Plus, Package, Edit2, Trash2, Star, Search, X, GripVertical, ChevronDown } from 'lucide-react';
import ProductEditor from './ProductEditor';
import useSWRImmutable from 'swr/immutable';

const ITEMS_PER_PAGE = 10;

interface CategoryRecord {
  key: string;
  name: string;
}

export default function ProductsTab() {
  const { data: products = [], isLoading: loading, mutate } = useSWR<Product[]>('/api/admin/products');
  const { data: categoriesData } = useSWRImmutable<CategoryRecord[]>(
    '/api/admin/categories',
    (url: string) => fetch(url).then((r) => {
      if (!r.ok) throw new Error('Failed to fetch categories');
      return r.json();
    }).then((j) => j.data || [])
  );
  const categories = categoriesData || [];
  const getCategoryName = (key: string) => categories.find((c) => c.key === key)?.name || key;
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const dragItemIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);
  const dragSection = useRef<'featured' | 'regular' | null>(null);

  const isFiltered = searchQuery !== '' || categoryFilter !== 'all' || statusFilter !== 'all';

  const filteredProducts = products.filter((product) => {
    const matchesSearch = searchQuery === '' ||
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.manufacturers?.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (product.product_code?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? product.is_active : !product.is_active);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const featuredProducts = filteredProducts.filter(p => p.is_featured);
  const regularProducts = filteredProducts.filter(p => !p.is_featured);
  const visibleRegularProducts = regularProducts.slice(0, visibleCount);
  const hasMore = visibleCount < regularProducts.length;

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const reordered = [...products];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const items = reordered.map((p, i) => ({ id: p.id, sort_order: i }));
    const updated = reordered.map((p, i) => ({ ...p, sort_order: i }));

    mutate(updated, { revalidate: false });

    try {
      const response = await fetch('/api/admin/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) {
        mutate();
      }
    } catch {
      mutate();
    }
  };

  const handleDragStart = (index: number, section: 'featured' | 'regular') => {
    dragItemIndex.current = index;
    dragSection.current = section;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverIndex.current = index;
  };

  const handleDrop = (e: React.DragEvent, section: 'featured' | 'regular') => {
    e.preventDefault();
    const from = dragItemIndex.current;
    const to = dragOverIndex.current;
    const fromSection = dragSection.current;
    dragItemIndex.current = null;
    dragOverIndex.current = null;
    dragSection.current = null;
    if (from !== null && to !== null && from !== to && fromSection === section) {
      const sourceList = section === 'featured' ? featuredProducts : visibleRegularProducts;
      const fromProduct = sourceList[from];
      const toProduct = sourceList[to];
      const realFrom = products.findIndex(p => p.id === fromProduct.id);
      const realTo = products.findIndex(p => p.id === toProduct.id);
      if (realFrom !== -1 && realTo !== -1) {
        void handleReorder(realFrom, realTo);
      }
    }
  };

  const toggleProductStatus = async (productId: string, currentStatus: boolean) => {
    try {
      const response = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: productId, is_active: !currentStatus }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '제품 상태 변경에 실패했습니다.');
      }

      const payload = await response.json();
      const updatedProduct = payload?.data as Product;

      mutate(products.map(p =>
        p.id === updatedProduct.id ? updatedProduct : p
      ), { revalidate: false });
    } catch (error) {
      console.error('Error toggling product status:', error);
    }
  };

  const toggleFeatured = async (productId: string, currentFeatured: boolean) => {
    try {
      const response = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, is_featured: !currentFeatured }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '추천 상태 변경에 실패했습니다.');
      }

      const payload = await response.json();
      const updatedProduct = payload?.data as Product;

      mutate(products.map(p =>
        p.id === updatedProduct.id ? updatedProduct : p
      ), { revalidate: false });
    } catch (error) {
      console.error('Error toggling featured status:', error);
    }
  };

  const handleProductSave = (savedProduct: Product) => {
    if (isCreatingNew) {
      mutate([savedProduct, ...products], { revalidate: false });
    } else {
      mutate(products.map(p =>
        p.id === savedProduct.id ? savedProduct : p
      ), { revalidate: false });
    }
    setSelectedProduct(savedProduct);
    setIsCreatingNew(false);
  };

  const handleDeleteProduct = async (productId: string, productTitle: string) => {
    const confirmed = window.confirm(`"${productTitle}" 제품을 삭제할까요?`);
    if (!confirmed) return;

    setDeletingProductId(productId);
    try {
      const response = await fetch(`/api/admin/products?id=${productId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '제품 삭제에 실패했습니다.');
      }

      mutate(products.filter((product) => product.id !== productId), { revalidate: false });
    } catch (error) {
      console.error('Error deleting product:', error);
      alert(error instanceof Error ? error.message : '제품 삭제에 실패했습니다.');
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleCancel = () => {
    setSelectedProduct(null);
    setIsCreatingNew(false);
  };

  const renderDesktopRows = (items: Product[], section: 'featured' | 'regular') =>
    items.map((product, idx) => (
      <tr
        key={product.id}
        className="hover:bg-gray-50 transition-colors"
        draggable
        onDragStart={() => handleDragStart(idx, section)}
        onDragOver={(e) => handleDragOver(e, idx)}
        onDrop={(e) => handleDrop(e, section)}
      >
        <td className="w-8 px-2 py-3">
          <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            {product.thumbnail_image_link?.[0] ? (
              <img src={product.thumbnail_image_link[0]} alt={product.title} className="w-9 h-9 rounded object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded bg-gray-100 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-gray-400" />
              </div>
            )}
            <div className="text-xs font-medium text-gray-900">{product.title}</div>
          </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-xs text-gray-900">{product.category ? getCategoryName(product.category) : '-'}</span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-xs text-gray-900">{product.manufacturers?.name || '-'}</span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-xs text-gray-900">{product.base_price.toLocaleString()}원</span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <button
            onClick={() => toggleProductStatus(product.id, product.is_active)}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              product.is_active
                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
            }`}
          >
            {product.is_active ? (
              <><Eye className="w-3 h-3" />활성</>
            ) : (
              <><EyeOff className="w-3 h-3" />비활성</>
            )}
          </button>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <button
            onClick={() => toggleFeatured(product.id, product.is_featured)}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              product.is_featured
                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <Star className={`w-3 h-3 ${product.is_featured ? 'fill-yellow-500' : ''}`} />
            {product.is_featured ? '추천' : '일반'}
          </button>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right text-xs font-medium">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setSelectedProduct(product)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              편집
            </button>
            <button
              onClick={() => handleDeleteProduct(product.id, product.title)}
              disabled={deletingProductId === product.id}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deletingProductId === product.id ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </td>
      </tr>
    ));

  const renderMobileCards = (items: Product[], section: 'featured' | 'regular') =>
    items.map((product, idx) => (
      <div
        key={product.id}
        className="p-3 space-y-2"
        draggable
        onDragStart={() => handleDragStart(idx, section)}
        onDragOver={(e) => handleDragOver(e, idx)}
        onDrop={(e) => handleDrop(e, section)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <GripVertical className="w-4 h-4 text-gray-400 cursor-grab shrink-0" />
            {product.thumbnail_image_link?.[0] ? (
              <img src={product.thumbnail_image_link[0]} alt={product.title} className="w-8 h-8 rounded object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center shrink-0">
                <Package className="w-3.5 h-3.5 text-gray-400" />
              </div>
            )}
            <div className="text-xs font-semibold text-gray-900 truncate">{product.title}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => toggleFeatured(product.id, product.is_featured)}
              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                product.is_featured
                  ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Star className={`w-2.5 h-2.5 ${product.is_featured ? 'fill-yellow-500' : ''}`} />
              {product.is_featured ? '추천' : '일반'}
            </button>
            <button
              onClick={() => toggleProductStatus(product.id, product.is_active)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                product.is_active
                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              {product.is_active ? (
                <><Eye className="w-3 h-3" /> 활성</>
              ) : (
                <><EyeOff className="w-3 h-3" /> 비활성</>
              )}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
          <span>{product.category ? getCategoryName(product.category) : '-'}</span>
          <span>{product.manufacturers?.name || '-'}</span>
          <span className="font-medium text-gray-700">{product.base_price.toLocaleString()}원</span>
        </div>
        <div className="flex items-center gap-1 pt-1">
          <button
            onClick={() => setSelectedProduct(product)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 rounded transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            편집
          </button>
          <button
            onClick={() => handleDeleteProduct(product.id, product.title)}
            disabled={deletingProductId === product.id}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50 ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deletingProductId === product.id ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>
    ));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Show Product Editor (for editing existing or creating new product)
  if (selectedProduct || isCreatingNew) {
    return (
      <ProductEditor
        product={selectedProduct}
        onSave={handleProductSave}
        onCancel={handleCancel}
      />
    );
  }


  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">제품 관리</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {filteredProducts.length === products.length
              ? `총 ${products.length}개의 제품`
              : `${filteredProducts.length} / ${products.length}개의 제품`}
          </p>
        </div>
        <button
          onClick={() => {
            setIsCreatingNew(true);
            setSelectedProduct(null);
          }}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">새 제품 추가</span>
          <span className="sm:hidden">추가</span>
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="제품명, ID, 제조사, 제품코드 검색..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(ITEMS_PER_PAGE); }}
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as 'all' | 'active' | 'inactive'); setVisibleCount(ITEMS_PER_PAGE); }}
          className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white sm:w-28"
        >
          <option value="all">전체 상태</option>
          <option value="active">활성화</option>
          <option value="inactive">비활성화</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setVisibleCount(ITEMS_PER_PAGE); }}
          className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white sm:w-36"
        >
          <option value="all">전체</option>
          {categories.map((cat) => (
            <option key={cat.key} value={cat.key}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <div className="border border-yellow-200 rounded-md shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border-b border-yellow-200">
            <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
            <span className="text-xs font-semibold text-yellow-800">추천 제품 ({featuredProducts.length})</span>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-yellow-50/50 border-b border-yellow-100">
                <tr>
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제품명</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">카테고리</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제조사</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">기본 가격</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">추천</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-yellow-100">
                {renderDesktopRows(featuredProducts, 'featured')}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-yellow-100">
            {renderMobileCards(featuredProducts, 'featured')}
          </div>
        </div>
      )}

      {/* Regular Products */}
      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-8 px-2 py-2"></th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제품명</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">카테고리</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제조사</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">기본 가격</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">추천</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {renderDesktopRows(visibleRegularProducts, 'regular')}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-gray-200">
          {renderMobileCards(visibleRegularProducts, 'regular')}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <Package className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-sm font-semibold text-gray-900 mb-1 sm:mb-2">
              {products.length === 0 ? '제품이 없습니다' : '검색 결과가 없습니다'}
            </h3>
            <p className="text-xs text-gray-500">
              {products.length === 0 ? '새 제품을 추가해보세요.' : '다른 검색어나 필터를 시도해보세요.'}
            </p>
          </div>
        )}

        {hasMore && (
          <div className="flex items-center justify-center px-4 py-2.5 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setVisibleCount(c => c + ITEMS_PER_PAGE)}
              className="inline-flex items-center gap-1 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-md transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              더 보기 ({visibleCount} / {regularProducts.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
