'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Check, AlertCircle, CheckCircle } from 'lucide-react';
import { Product, LogoPlacement, ProductSide, PartnerMallPreset } from '@/types/types';
import LogoCapture from './LogoCapture';
import ProductMultiSelect from './ProductMultiSelect';
import ProductPreviewGrid from './ProductPreviewGrid';
import LogoPlacementEditor from './LogoPlacementEditor';
import ColorSelector, { SelectedColor } from './ColorSelector';

type Step = 'logo' | 'products' | 'preview' | 'save';

const DEFAULT_PLACEMENT: LogoPlacement = {
  x: 50,
  y: 50,
  width: 100,
  height: 100,
};

// Get first side of a product
const getFirstSide = (product: Product): ProductSide | null => {
  const sides = (product.configuration || []) as ProductSide[];
  return sides.length > 0 ? sides[0] : null;
};

interface ProductPlacement {
  productId: string;
  placements: Record<string, LogoPlacement>;
  canvasStates: Record<string, unknown>;
}

interface PartnerMallCreatorProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function PartnerMallCreator({ onClose, onCreated }: PartnerMallCreatorProps) {
  const [currentStep, setCurrentStep] = useState<Step>('logo');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [originalLogoUrl, setOriginalLogoUrl] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [placements, setPlacements] = useState<ProductPlacement[]>([]);
  const [partnerMallName, setPartnerMallName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [slugMessage, setSlugMessage] = useState('');
  const slugCheckTimeout = useRef<NodeJS.Timeout | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProductIndex, setEditingProductIndex] = useState<number | null>(null);
  const previewImagesRef = useRef<Record<string, string>>({});

  // Per-product color selection
  const [productColorSelections, setProductColorSelections] = useState<
    Record<string, SelectedColor | null>
  >({});

  // Slug validation with debounce
  const checkSlugAvailability = useCallback(async (value: string) => {
    if (!value) {
      setSlugStatus('idle');
      setSlugMessage('');
      return;
    }

    const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
    if (!slugRegex.test(value)) {
      setSlugStatus('invalid');
      setSlugMessage('영문 소문자, 숫자, 하이픈(-)만 가능하며 하이픈으로 시작/끝 불가');
      return;
    }
    if (value.length < 2) {
      setSlugStatus('invalid');
      setSlugMessage('2자 이상 입력해주세요');
      return;
    }

    setSlugStatus('checking');
    try {
      const res = await fetch(`/api/admin/partner-malls/check-slug?slug=${encodeURIComponent(value)}`);
      const result = await res.json();
      if (result.available) {
        setSlugStatus('available');
        setSlugMessage('사용 가능');
      } else {
        setSlugStatus('taken');
        setSlugMessage(result.message || '이미 사용 중');
      }
    } catch {
      setSlugStatus('invalid');
      setSlugMessage('확인 실패');
    }
  }, []);

  const handleSlugChange = (value: string) => {
    const formatted = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(formatted);
    setSlugStatus('idle');
    setSlugMessage('');

    if (slugCheckTimeout.current) clearTimeout(slugCheckTimeout.current);
    if (formatted) {
      slugCheckTimeout.current = setTimeout(() => checkSlugAvailability(formatted), 400);
    }
  };

  // Fetch products when IDs are selected
  useEffect(() => {
    if (selectedProductIds.length === 0) {
      setProducts([]);
      return;
    }

    const fetchProducts = async () => {
      try {
        const response = await fetch('/api/admin/products');
        if (!response.ok) throw new Error('Failed to fetch products');
        const result = await response.json();
        const allProducts = result.data || [];
        const selected = allProducts.filter((p: Product) =>
          selectedProductIds.includes(p.id)
        );
        setProducts(selected);
      } catch (err) {
        console.error('Error fetching products:', err);
      }
    };

    fetchProducts();
  }, [selectedProductIds]);

  // Handle logo ready
  const handleLogoReady = (processedUrl: string, originalUrl: string) => {
    setLogoUrl(processedUrl);
    setOriginalLogoUrl(originalUrl);
    setCurrentStep('products');
  };

  // Handle product selection confirm - fetch presets and auto-generate placements
  const handleProductsConfirm = async () => {
    // Fetch presets for all selected products in one batch
    let allPresets: PartnerMallPreset[] = [];
    try {
      const productIds = products.map((p) => p.id).join(',');
      const response = await fetch(`/api/admin/partner-mall-presets?product_ids=${productIds}`);
      if (response.ok) {
        const result = await response.json();
        allPresets = result.data || [];
      }
    } catch (err) {
      console.error('Error fetching presets:', err);
    }

    const autoPlacments: ProductPlacement[] = products.map((product) => {
      const firstSide = getFirstSide(product);
      if (!firstSide) {
        return { productId: product.id, placements: {}, canvasStates: {} };
      }

      // Use first available preset for this product, or fall back to default
      const productPresets = allPresets.filter((p) => p.product_id === product.id);
      const placement = productPresets.length > 0 ? productPresets[0].placement : DEFAULT_PLACEMENT;

      return {
        productId: product.id,
        placements: { [firstSide.id]: placement },
        canvasStates: {},
      };
    });

    setPlacements(autoPlacments);
    setCurrentStep('preview');
  };

  // Handle color change for a product
  const handleProductColorChange = (productId: string, color: SelectedColor | null) => {
    setProductColorSelections((prev) => ({ ...prev, [productId]: color }));
  };

  // Build productColors map for canvas rendering (productId -> hex)
  const productColorsMap: Record<string, string> = {};
  for (const [productId, color] of Object.entries(productColorSelections)) {
    if (color) {
      productColorsMap[productId] = color.hex;
    }
  }

  // Handle save
  const handleSave = async () => {
    if (!partnerMallName.trim()) {
      setError('파트너몰 이름을 입력해주세요.');
      return;
    }

    if (!logoUrl) {
      setError('로고가 필요합니다.');
      return;
    }

    if (slug && slugStatus !== 'available') {
      setError('슬러그를 확인해주세요.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Create partner mall
      const createResponse = await fetch('/api/admin/partner-malls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: partnerMallName.trim(),
          slug: slug || null,
          logo_url: logoUrl,
          original_logo_url: originalLogoUrl,
          is_active: true,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error(errorData?.error || '파트너몰 생성에 실패했습니다.');
      }

      const createResult = await createResponse.json();
      const partnerMallId = createResult.data.id;

      // Add products with placements and color data
      if (placements.length > 0) {
        const productsData = placements.map((p) => {
          const product = products.find((pr) => pr.id === p.productId);
          const color = productColorSelections[p.productId] ?? null;
          const productTitle = product?.title || '';
          const displayName = color
            ? `${partnerMallName.trim()} ${productTitle} (${color.name})`
            : `${partnerMallName.trim()} ${productTitle}`;

          return {
            product_id: p.productId,
            logo_placements: p.placements,
            canvas_state: p.canvasStates,
            preview_url: previewImagesRef.current[p.productId] || null,
            display_name: displayName,
            manufacturer_color_id: color?.id ?? null,
            color_hex: color?.hex ?? null,
            color_name: color?.name ?? null,
            color_code: color?.color_code ?? null,
          };
        });

        const productsResponse = await fetch('/api/admin/partner-malls/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partner_mall_id: partnerMallId,
            products: productsData,
          }),
        });

        if (!productsResponse.ok) {
          const errorData = await productsResponse.json().catch(() => ({}));
          throw new Error(errorData?.error || '제품 추가에 실패했습니다.');
        }
      }

      onCreated();
    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // Step indicator
  const steps = [
    { id: 'logo', label: '로고 업로드' },
    { id: 'products', label: '제품 선택' },
    { id: 'preview', label: '미리보기' },
    { id: 'save', label: '저장' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-4xl h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-2 sm:p-4 border-b">
          <h1 className="text-sm sm:text-xl font-semibold">파트너몰 생성</h1>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-2 sm:px-6 py-2 sm:py-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-5 h-5 sm:w-8 sm:h-8 rounded-full text-[10px] sm:text-sm font-medium ${
                    index <= currentStepIndex
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {index < currentStepIndex ? (
                    <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`ml-1 sm:ml-2 text-[10px] sm:text-sm ${
                    index <= currentStepIndex ? 'text-gray-800' : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
                {index < steps.length - 1 && (
                  <div
                    className={`w-3 sm:w-16 h-0.5 mx-0.5 sm:mx-2 ${
                      index < currentStepIndex ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-6">
          {/* Step 1: Logo Capture */}
          {currentStep === 'logo' && (
            <LogoCapture onLogoReady={handleLogoReady} onCancel={onClose} />
          )}

          {/* Step 2: Product Selection */}
          {currentStep === 'products' && (
            <ProductMultiSelect
              selectedProductIds={selectedProductIds}
              onSelectionChange={setSelectedProductIds}
              onConfirm={handleProductsConfirm}
              onBack={() => setCurrentStep('logo')}
            />
          )}

          {/* Step 3: Preview */}
          {currentStep === 'preview' && logoUrl && products.length > 0 && (
            editingProductIndex !== null ? (
              <LogoPlacementEditor
                products={[products[editingProductIndex]]}
                logoUrl={logoUrl}
                placements={placements.filter(p => p.productId === products[editingProductIndex].id)}
                onPlacementsChange={(updatedPlacements) => {
                  setPlacements(prev => {
                    const newPlacements = [...prev];
                    const editedProductId = products[editingProductIndex].id;
                    const index = newPlacements.findIndex(p => p.productId === editedProductId);
                    if (index >= 0 && updatedPlacements.length > 0) {
                      newPlacements[index] = updatedPlacements[0];
                    }
                    return newPlacements;
                  });
                }}
                onConfirm={() => setEditingProductIndex(null)}
                onBack={() => setEditingProductIndex(null)}
                productColor={productColorsMap[products[editingProductIndex].id]}
              />
            ) : (
              <div>
                {/* Color selection per product */}
                <div className="mb-3 sm:mb-6">
                  <h3 className="text-xs sm:text-base font-medium text-gray-800 mb-2 sm:mb-3">제품 색상 선택</h3>
                  <div className="space-y-2 sm:space-y-3">
                    {products.map((product) => (
                      <div key={product.id} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded border border-gray-200 overflow-hidden shrink-0">
                          {product.thumbnail_image_link?.[0] && (
                            <img
                              src={product.thumbnail_image_link[0]}
                              alt={product.title}
                              className="w-full h-full object-contain"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] sm:text-sm font-medium text-gray-800 truncate">{product.title}</p>
                          <ColorSelector
                            productId={product.id}
                            selectedColorId={productColorSelections[product.id]?.id ?? null}
                            onColorSelect={(color) => handleProductColorChange(product.id, color)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <ProductPreviewGrid
                  products={products}
                  logoUrl={logoUrl}
                  placements={placements}
                  productColors={productColorsMap}
                  onEditProduct={(productIndex) => setEditingProductIndex(productIndex)}
                  onConfirm={() => setCurrentStep('save')}
                  onBack={() => setCurrentStep('products')}
                  onPreviewCaptured={(productId, dataUrl) => {
                    previewImagesRef.current[productId] = dataUrl;
                  }}
                />
              </div>
            )
          )}

          {/* Step 4: Save */}
          {currentStep === 'save' && (
            <div className="bg-white rounded-lg p-2 sm:p-6">
              <h2 className="text-sm sm:text-xl font-semibold mb-2 sm:mb-4">파트너몰 저장</h2>
              <p className="text-xs sm:text-base text-gray-600 mb-3 sm:mb-6">
                파트너몰의 이름을 입력하고 저장하세요.
              </p>

              {error && (
                <div className="mb-3 sm:mb-4 p-2 sm:p-4 bg-red-50 border border-red-200 rounded-lg text-xs sm:text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-3 sm:space-y-4">
                {/* Logo preview */}
                <div className="flex items-center gap-2 sm:gap-4 p-2 sm:p-4 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 sm:w-16 sm:h-16 bg-white rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt="Logo"
                        className="max-w-full max-h-full object-contain"
                      />
                    )}
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-800">로고</p>
                    <p className="text-[10px] sm:text-xs text-gray-500">
                      배경이 제거된 로고 이미지
                    </p>
                  </div>
                </div>

                {/* Partner mall name input */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    파트너몰 이름 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={partnerMallName}
                    onChange={(e) => setPartnerMallName(e.target.value)}
                    placeholder="예: 삼성전자, LG생활건강"
                    className="w-full px-2 sm:px-4 py-2 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Slug input */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    슬러그 (URL 주소)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      placeholder="예: samsung, lg-electronics"
                      className={`w-full px-2 sm:px-4 py-2 border rounded-lg text-xs sm:text-base focus:outline-none focus:ring-2 focus:border-transparent ${
                        slugStatus === 'available' ? 'border-green-400 focus:ring-green-500' :
                        slugStatus === 'taken' || slugStatus === 'invalid' ? 'border-red-400 focus:ring-red-500' :
                        'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      {slugStatus === 'checking' && <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-gray-400" />}
                      {slugStatus === 'available' && <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />}
                      {(slugStatus === 'taken' || slugStatus === 'invalid') && <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />}
                    </div>
                  </div>
                  {slugMessage && (
                    <p className={`mt-1 text-[10px] sm:text-xs ${
                      slugStatus === 'available' ? 'text-green-600' :
                      slugStatus === 'taken' || slugStatus === 'invalid' ? 'text-red-600' :
                      'text-gray-500'
                    }`}>
                      {slugMessage}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] sm:text-xs text-gray-400">
                    modoouniform.com/mall/<span className="font-medium">{slug || 'slug'}</span> 으로 접속 가능합니다
                  </p>
                </div>

                {/* Summary */}
                <div className="p-2 sm:p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs sm:text-sm text-blue-800">
                    {products.length}개 제품에 로고가 적용됩니다.
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 sm:gap-4 mt-4 sm:mt-6">
                <button
                  onClick={() => setCurrentStep('preview')}
                  disabled={isSaving}
                  className="flex-1 py-2 sm:py-3 px-3 sm:px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 text-xs sm:text-base"
                >
                  이전
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !partnerMallName.trim() || (!!slug && slugStatus !== 'available')}
                  className="flex-1 py-2 sm:py-3 px-3 sm:px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-base"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                      저장하기
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
