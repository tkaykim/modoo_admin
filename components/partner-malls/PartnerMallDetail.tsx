'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  Building2,
  Package,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Edit2,
  Plus,
  Trash2,
  Calendar,
  ImageOff,
  Link2,
  Copy,
  Check,
} from 'lucide-react';
import { PartnerMall, PartnerMallProduct } from '@/types/types';
import PartnerMallInfoEditor from './PartnerMallInfoEditor';
import SingleProductPlacementEditor from './SingleProductPlacementEditor';
import AddProductsModal from './AddProductsModal';
import { formatKstDateLong } from '@/lib/kst';

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://modoouniform.com';

// Product preview card - renders preview_url image
function ProductPreviewCard({
  mallProduct,
  onEdit,
  onRemove,
  isDeleting,
}: {
  mallProduct: PartnerMallProduct;
  onEdit: () => void;
  onRemove: () => void;
  isDeleting: boolean;
}) {
  const product = mallProduct.product;
  const previewUrl = mallProduct.preview_url;

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden group">
      <div className="relative aspect-4/5 bg-white">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={mallProduct.display_name || product?.title || 'Product preview'}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <ImageOff className="w-8 h-8 mb-1" />
            <span className="text-xs">미리보기 없음</span>
          </div>
        )}

        {/* Actions - hover overlay on desktop only */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex items-center justify-center gap-2 z-20">
          <button
            onClick={onEdit}
            className="p-2 bg-white rounded-lg hover:bg-gray-100 transition-colors"
            title="편집"
          >
            <Edit2 className="w-4 h-4 text-gray-700" />
          </button>
          <button
            onClick={onRemove}
            disabled={isDeleting}
            className="p-2 bg-white rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            title="제거"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-600" />
            ) : (
              <Trash2 className="w-4 h-4 text-red-600" />
            )}
          </button>
        </div>
      </div>

      {/* Product Info */}
      <div className="p-2 sm:p-3">
        <p className="text-xs sm:text-sm font-medium text-gray-800 truncate">
          {mallProduct.display_name || product?.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {mallProduct.color_hex && (
            <span
              className="w-3 h-3 rounded-full border border-gray-300 shrink-0"
              style={{ backgroundColor: mallProduct.color_hex }}
            />
          )}
          <p className="text-xs text-gray-500 truncate">
            {mallProduct.color_name || product?.product_code || ''}
          </p>
        </div>
        {mallProduct.price !== null && mallProduct.price !== undefined && (
          <p className="text-xs sm:text-sm font-semibold text-blue-600 mt-1">
            {mallProduct.price.toLocaleString()}원
          </p>
        )}
        {/* Mobile action buttons */}
        <div className="flex items-center gap-2 mt-2 sm:hidden">
          <button
            onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            <Edit2 className="w-3 h-3" />
            편집
          </button>
          <button
            onClick={onRemove}
            disabled={isDeleting}
            className="flex items-center justify-center gap-1 py-1.5 px-2.5 text-xs text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PartnerMallDetailProps {
  partnerMall: PartnerMall;
  onBack: () => void;
  onUpdate: () => void;
  onMallUpdate: (mall: PartnerMall) => void;
}

export default function PartnerMallDetail({
  partnerMall,
  onBack,
  onUpdate,
  onMallUpdate,
}: PartnerMallDetailProps) {
  const [togglingActive, setTogglingActive] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [editingProduct, setEditingProduct] = useState<PartnerMallProduct | null>(null);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const products = partnerMall.partner_mall_products || [];

  // Toggle active status
  const toggleActive = async () => {
    try {
      setTogglingActive(true);

      const response = await fetch('/api/admin/partner-malls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: partnerMall.id,
          is_active: !partnerMall.is_active,
        }),
      });

      if (!response.ok) {
        throw new Error('상태 변경에 실패했습니다.');
      }

      const result = await response.json();
      onMallUpdate(result.data);
    } catch (err) {
      console.error('Toggle active error:', err);
      alert(err instanceof Error ? err.message : '상태 변경에 실패했습니다.');
    } finally {
      setTogglingActive(false);
    }
  };

  // Remove product from partner mall
  const removeProduct = async (mallProduct: PartnerMallProduct) => {
    if (!confirm('이 제품을 파트너몰에서 제거하시겠습니까?')) {
      return;
    }

    try {
      setDeletingProductId(mallProduct.id);

      const response = await fetch(`/api/admin/partner-malls/products?id=${mallProduct.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('제품 제거에 실패했습니다.');
      }

      // Refresh the data
      onUpdate();
    } catch (err) {
      console.error('Remove product error:', err);
      alert(err instanceof Error ? err.message : '제품 제거에 실패했습니다.');
    } finally {
      setDeletingProductId(null);
    }
  };

  // Generate share link
  const generateShareLink = async () => {
    try {
      setGeneratingLink(true);

      const response = await fetch('/api/admin/partner-malls/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: partnerMall.id }),
      });

      if (!response.ok) {
        throw new Error('링크 생성에 실패했습니다.');
      }

      const result = await response.json();
      onMallUpdate({ ...partnerMall, share_token: result.data.share_token });
    } catch (err) {
      console.error('Generate link error:', err);
      alert(err instanceof Error ? err.message : '링크 생성에 실패했습니다.');
    } finally {
      setGeneratingLink(false);
    }
  };

  // Copy share link
  const copyShareLink = async () => {
    if (!partnerMall.slug && !partnerMall.share_token) return;
    const url = `${APP_BASE_URL}/mall/${partnerMall.slug || partnerMall.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  return (
    <div className="p-2 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-6">
        <button
          onClick={onBack}
          className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <div>
          <h1 className="text-base sm:text-2xl font-bold text-gray-800">파트너몰 상세</h1>
          <p className="text-[11px] sm:text-base text-gray-600">파트너몰 정보를 확인하고 제품을 관리하세요.</p>
        </div>
      </div>

      {/* On mobile: Info first (summary), then products. On desktop: products left, info right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
        {/* Mall Info Section - Shows first on mobile (order-first), right on desktop (order-last) */}
        <div className="space-y-3 sm:space-y-4 order-first lg:order-last">
          <div className="bg-white rounded-lg border border-gray-200 p-2.5 sm:p-6">
            <div className="flex items-center justify-between mb-2.5 sm:mb-4">
              <h2 className="text-xs sm:text-lg font-semibold text-gray-800">파트너몰 정보</h2>
              <button
                onClick={() => setShowEditInfo(true)}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="편집"
              >
                <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
              </button>
            </div>

            {/* Mobile: horizontal layout. Desktop: vertical layout */}
            <div className="flex items-center gap-3 sm:gap-4 lg:flex-col lg:items-stretch">
              {/* Logo */}
              <div className="flex justify-center">
                <div className="w-14 h-14 sm:w-24 sm:h-24 lg:w-32 lg:h-32 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                  {partnerMall.logo_url ? (
                    <img
                      src={partnerMall.logo_url}
                      alt={partnerMall.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <Building2 className="w-6 h-6 sm:w-12 sm:h-12 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Info fields - horizontal on mobile, vertical on desktop */}
              <div className="flex-1 lg:mt-4 space-y-2 sm:space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-[10px] sm:text-sm font-medium text-gray-500 mb-0.5 sm:mb-1">
                    파트너몰명
                  </label>
                  <p className="text-sm sm:text-lg font-semibold text-gray-800">{partnerMall.name}</p>
                </div>

                {/* Slug */}
                {partnerMall.slug && (
                  <div>
                    <label className="block text-[10px] sm:text-sm font-medium text-gray-500 mb-0.5 sm:mb-1">
                      슬러그
                    </label>
                    <p className="text-xs sm:text-sm text-gray-700 font-mono">{partnerMall.slug}</p>
                  </div>
                )}

                {/* Status */}
                <div>
                  <label className="block text-[10px] sm:text-sm font-medium text-gray-500 mb-0.5 sm:mb-1">
                    상태
                  </label>
                  <button
                    onClick={toggleActive}
                    disabled={togglingActive}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      partnerMall.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {togglingActive ? (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : partnerMall.is_active ? (
                      <ToggleRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    ) : (
                      <ToggleLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                    {partnerMall.is_active ? '활성' : '비활성'}
                  </button>
                </div>
              </div>
            </div>

            {/* Share Link */}
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100">
              <label className="block text-[10px] sm:text-sm font-medium text-gray-500 mb-1 sm:mb-1.5">
                <Link2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 inline mr-0.5 sm:mr-1" />
                공유 링크
              </label>
              {(partnerMall.slug || partnerMall.share_token) ? (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <input
                    readOnly
                    value={`${APP_BASE_URL}/mall/${partnerMall.slug || partnerMall.share_token}`}
                    className="flex-1 text-[10px] sm:text-xs px-2 sm:px-2.5 py-1.5 sm:py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 truncate"
                  />
                  <button
                    onClick={copyShareLink}
                    className="shrink-0 p-1.5 sm:p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                    title="복사"
                  >
                    {linkCopied ? (
                      <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={generateShareLink}
                  disabled={generatingLink}
                  className="w-full flex items-center justify-center gap-1.5 sm:gap-2 py-1.5 sm:py-2 px-2.5 sm:px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-xs sm:text-sm"
                >
                  {generatingLink ? (
                    <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                  링크 생성
                </button>
              )}
            </div>

            {/* Extra details - grid on mobile for compact layout */}
            <div className="grid grid-cols-3 lg:grid-cols-1 gap-2 sm:gap-3 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 lg:border-0 lg:pt-0">
              <div>
                <label className="block text-[10px] sm:text-sm font-medium text-gray-500 mb-0.5 sm:mb-1">
                  등록 제품
                </label>
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-gray-800">
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{products.length}개</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] sm:text-sm font-medium text-gray-500 mb-0.5 sm:mb-1">
                  생성일
                </label>
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-gray-800">
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{formatKstDateLong(partnerMall.created_at)}</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] sm:text-sm font-medium text-gray-500 mb-0.5 sm:mb-1">
                  수정일
                </label>
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm text-gray-800">
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>{formatKstDateLong(partnerMall.updated_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Products Section */}
        <div className="lg:col-span-2 space-y-3 sm:space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-2.5 sm:p-6">
            <div className="flex items-center justify-between mb-2.5 sm:mb-4">
              <h2 className="text-xs sm:text-lg font-semibold text-gray-800">
                제품 목록
                <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-sm font-normal text-gray-500">
                  ({products.length}개)
                </span>
              </h2>
              <button
                onClick={() => setShowAddProducts(true)}
                className="flex items-center gap-1 sm:gap-2 py-1.5 sm:py-2 px-2.5 sm:px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-[11px] sm:text-sm"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                제품 추가
              </button>
            </div>

            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 sm:py-12 bg-gray-50 rounded-lg">
                <Package className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300 mb-2 sm:mb-3" />
                <p className="text-xs sm:text-base text-gray-500 mb-3 sm:mb-4">등록된 제품이 없습니다.</p>
                <button
                  onClick={() => setShowAddProducts(true)}
                  className="flex items-center gap-1.5 sm:gap-2 py-1.5 sm:py-2 px-3 sm:px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  제품 추가하기
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                {products.map((mallProduct) => {
                  if (!mallProduct.product) return null;

                  return (
                    <ProductPreviewCard
                      key={mallProduct.id}
                      mallProduct={mallProduct}
                      onEdit={() => setEditingProduct(mallProduct)}
                      onRemove={() => removeProduct(mallProduct)}
                      isDeleting={deletingProductId === mallProduct.id}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Info Modal */}
      {showEditInfo && (
        <PartnerMallInfoEditor
          partnerMall={partnerMall}
          onClose={() => setShowEditInfo(false)}
          onSave={(updated) => {
            onMallUpdate(updated);
            setShowEditInfo(false);
          }}
        />
      )}

      {/* Add Products Modal */}
      {showAddProducts && (
        <AddProductsModal
          partnerMallId={partnerMall.id}
          partnerMallName={partnerMall.name}
          logoUrl={partnerMall.logo_url}
          onClose={() => setShowAddProducts(false)}
          onProductsAdded={() => {
            setShowAddProducts(false);
            onUpdate();
          }}
        />
      )}

      {/* Edit Placement Modal */}
      {editingProduct && (
        <SingleProductPlacementEditor
          mallProduct={editingProduct}
          logoUrl={partnerMall.logo_url}
          partnerMallName={partnerMall.name}
          onClose={() => setEditingProduct(null)}
          onSave={() => {
            setEditingProduct(null);
            onUpdate();
          }}
        />
      )}
    </div>
  );
}
