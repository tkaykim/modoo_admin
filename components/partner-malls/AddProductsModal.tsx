'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as fabric from 'fabric';
import { X, Loader2, ChevronLeft, Plus, Trash2, Edit2, RotateCcw, Check, Package, ExternalLink } from 'lucide-react';
import { Product, LogoPlacement, ProductSide, PartnerMallPreset } from '@/types/types';
import ProductMultiSelect from './ProductMultiSelect';
import ColorSelector, { SelectedColor } from './ColorSelector';
import SingleSideCanvas from '@/components/canvas/SingleSideCanvas';

interface AddProductsModalProps {
  partnerMallId: string;
  partnerMallName: string;
  logoUrl: string;
  onClose: () => void;
  onProductsAdded: () => void;
}

const DEFAULT_PLACEMENT: LogoPlacement = {
  x: 50,
  y: 50,
  width: 100,
  height: 100,
};

const getFirstSide = (product: Product): ProductSide | null => {
  const sides = (product.configuration || []) as ProductSide[];
  return sides.length > 0 ? sides[0] : null;
};

interface ProductConfig {
  key: string;
  productId: string;
  product: Product;
  color: SelectedColor | null;
  displayName: string;
  logoPlacement: Record<string, LogoPlacement>;
  previewUrl: string | null;
  canvasState: Record<string, string>;
}

// Inline placement editor for a single product
function InlinePlacementEditor({
  product,
  logoUrl,
  productColor,
  initialPlacement,
  onDone,
  onCancel,
}: {
  product: Product;
  logoUrl: string;
  productColor?: string;
  initialPlacement: Record<string, LogoPlacement>;
  onDone: (placement: Record<string, LogoPlacement>, previewUrl: string | null, canvasState: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const logoRef = useRef<fabric.FabricImage | null>(null);
  const scaleRef = useRef<number>(1);
  const sideIdRef = useRef<string>('');
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [hasLogo, setHasLogo] = useState(false);

  // Store initialPlacement in a ref to keep handleCanvasReady deps stable
  const initialPlacementRef = useRef(initialPlacement);
  initialPlacementRef.current = initialPlacement;

  const firstSide = getFirstSide(product);

  // Helper to place logo on canvas (used by both handleCanvasReady and manual retry)
  const placeLogoOnCanvas = useCallback((
    canvas: fabric.Canvas,
    sideId: string,
    canvasScale: number,
  ) => {
    if (!firstSide || !logoUrl) return;

    setLogoError(null);

    // @ts-expect-error - Custom property
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property
    const printAreaTop = canvas.printAreaTop || 0;

    // Remove existing logo if any
    const existing = canvas.getObjects().find(
      (obj) => (obj as fabric.FabricObject & { data?: { id?: string } }).data?.id === 'partner-mall-logo'
    );
    if (existing) canvas.remove(existing);

    const existingPlacement = initialPlacementRef.current[sideId];

    fabric.FabricImage.fromURL(logoUrl, { crossOrigin: 'anonymous' })
      .then((logoImg) => {
        if (!canvasRef.current) return;

        if (existingPlacement) {
          const logoScale = Math.min(
            existingPlacement.width / (logoImg.width || 100),
            existingPlacement.height / (logoImg.height || 100)
          );
          logoImg.set({
            left: printAreaLeft + existingPlacement.x * canvasScale,
            top: printAreaTop + existingPlacement.y * canvasScale,
            scaleX: logoScale * canvasScale,
            scaleY: logoScale * canvasScale,
            originX: 'left',
            originY: 'top',
            data: { id: 'partner-mall-logo' },
          });
        } else {
          const centerX = firstSide.printArea.width / 2;
          const centerY = firstSide.printArea.height / 2;
          const maxWidth = firstSide.printArea.width * 0.2;
          const maxHeight = firstSide.printArea.height * 0.2;
          const logoScale = Math.min(
            maxWidth / (logoImg.width || 100),
            maxHeight / (logoImg.height || 100)
          );
          logoImg.set({
            left: printAreaLeft + centerX * canvasScale,
            top: printAreaTop + centerY * canvasScale,
            scaleX: logoScale * canvasScale,
            scaleY: logoScale * canvasScale,
            originX: 'center',
            originY: 'center',
            data: { id: 'partner-mall-logo' },
          });
        }

        logoRef.current = logoImg;
        canvasRef.current!.add(logoImg);
        canvasRef.current!.setActiveObject(logoImg);
        canvasRef.current!.renderAll();
        setHasLogo(true);
        setIsCanvasReady(true);
      })
      .catch((err) => {
        console.error('Error loading logo:', err, 'URL:', logoUrl);
        setLogoError('로고를 불러오는데 실패했습니다.');
        setIsCanvasReady(true);
      });
  }, [logoUrl, firstSide]);

  // Manual retry button handler
  const handleRetryLogo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    placeLogoOnCanvas(canvas, sideIdRef.current, scaleRef.current);
  }, [placeLogoOnCanvas]);

  // Load logo directly in onCanvasReady (matches SingleProductPlacementEditor pattern)
  const handleCanvasReady = useCallback(
    (canvas: fabric.Canvas, sideId: string, canvasScale: number) => {
      canvasRef.current = canvas;
      scaleRef.current = canvasScale;
      sideIdRef.current = sideId;

      if (!firstSide) {
        setIsCanvasReady(true);
        return;
      }

      placeLogoOnCanvas(canvas, sideId, canvasScale);
    },
    [firstSide, placeLogoOnCanvas]
  );

  // Serialize canvas state (user objects only, matching editor format)
  const serializeCanvasState = (): Record<string, string> => {
    const canvas = canvasRef.current;
    if (!canvas || !firstSide) return {};

    const userObjects = canvas.getObjects().filter(obj => {
      if (obj.excludeFromExport) return false;
      // @ts-expect-error - Checking custom data property
      if (obj.data?.id === 'background-product-image') return false;
      return true;
    });

    const canvasData = {
      version: canvas.toJSON().version,
      objects: userObjects.map(obj => {
        const json = obj.toObject(['data']);
        if (obj.type === 'image') {
          const imgObj = obj as fabric.FabricImage;
          json.src = imgObj.getSrc();
        }
        return json;
      }),
    };

    return { [firstSide.id]: JSON.stringify(canvasData) };
  };

  const handleDone = () => {
    const canvas = canvasRef.current;
    const logo = logoRef.current;
    if (!canvas || !firstSide) return;

    // If no logo was placed, still save with the default placement
    if (!logo) {
      onDone(initialPlacement, null, {});
      return;
    }

    const canvasScale = scaleRef.current;
    // @ts-expect-error - Custom property
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property
    const printAreaTop = canvas.printAreaTop || 0;

    const logoLeft = logo.left || 0;
    const logoTop = logo.top || 0;
    const logoWidth = (logo.width || 100) * (logo.scaleX || 1);
    const logoHeight = (logo.height || 100) * (logo.scaleY || 1);

    const placement: LogoPlacement = {
      x: Math.round((logoLeft - printAreaLeft) / canvasScale),
      y: Math.round((logoTop - printAreaTop) / canvasScale),
      width: Math.round(logoWidth / canvasScale),
      height: Math.round(logoHeight / canvasScale),
    };

    canvas.discardActiveObject();
    canvas.renderAll();

    let previewUrl: string | null = null;
    try {
      previewUrl = canvas.toDataURL({ format: 'png', quality: 0.8, multiplier: 1 });
    } catch (err) {
      console.error('Error capturing preview:', err);
    }

    const canvasState = serializeCanvasState();
    onDone({ [firstSide.id]: placement }, previewUrl, canvasState);
  };

  const resetToCenter = () => {
    if (!canvasRef.current || !logoRef.current || !firstSide) return;

    const canvas = canvasRef.current;
    const logo = logoRef.current;
    const canvasScale = scaleRef.current;
    // @ts-expect-error - Custom property
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property
    const printAreaTop = canvas.printAreaTop || 0;

    const centerX = firstSide.printArea.width / 2;
    const centerY = firstSide.printArea.height / 2;
    const maxWidth = firstSide.printArea.width * 0.2;
    const maxHeight = firstSide.printArea.height * 0.2;
    const logoScale = Math.min(
      maxWidth / (logo.width || 100),
      maxHeight / (logo.height || 100)
    );

    logo.set({
      left: printAreaLeft + centerX * canvasScale,
      top: printAreaTop + centerY * canvasScale,
      scaleX: logoScale * canvasScale,
      scaleY: logoScale * canvasScale,
      angle: 0,
      originX: 'center',
      originY: 'center',
    });
    canvas.renderAll();
  };

  if (!firstSide) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        이 제품은 편집할 수 없습니다.
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4">
      <div className="mb-3">
        <h4 className="text-sm font-medium text-gray-800">{product.title}</h4>
        <p className="text-xs text-gray-500">로고를 드래그하여 위치를 조정하세요.</p>
      </div>

      {logoError && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{logoError}</span>
          <button
            onClick={handleRetryLogo}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium ml-3 shrink-0"
          >
            다시 시도
          </button>
        </div>
      )}

      <div className="relative bg-gray-100 rounded-lg overflow-hidden flex justify-center">
        {!isCanvasReady && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}
        <div className="w-full overflow-auto flex justify-center">
          <SingleSideCanvas
            side={firstSide}
            width={400}
            height={500}
            isEdit={true}
            canvasState={{ objects: [] }}
            productColor={productColor}
            onCanvasReady={handleCanvasReady}
            showScaleBox={false}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          <button
            onClick={resetToCenter}
            disabled={!isCanvasReady || !hasLogo}
            className="flex items-center gap-1.5 py-2 px-3 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            중앙으로
          </button>
          {isCanvasReady && !hasLogo && (
            <button
              onClick={handleRetryLogo}
              className="flex items-center gap-1.5 py-2 px-3 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              로고 추가
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            취소
          </button>
          <button
            onClick={handleDone}
            disabled={!isCanvasReady}
            className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AddProductsModal({
  partnerMallId,
  partnerMallName,
  logoUrl,
  onClose,
  onProductsAdded,
}: AddProductsModalProps) {
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'configure'>('select');
  const [productConfigs, setProductConfigs] = useState<ProductConfig[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const router = useRouter();

  // Open full editor for a product config
  const handleOpenEditor = (config: ProductConfig) => {
    sessionStorage.setItem('adminPartnerMallAddData', JSON.stringify({
      partnerMallId,
      partnerMallName,
      logoUrl,
      displayName: config.displayName,
      manufacturerColorId: config.color?.id ?? null,
      colorHex: config.color?.hex ?? null,
      colorName: config.color?.name ?? null,
      colorCode: config.color?.color_code ?? null,
    }));

    router.push(`/editor/${config.productId}?mode=design&partnerMallAdd=true&returnUrl=/partner_malls/${partnerMallId}`);
  };

  // Handle moving from product selection to configuration
  const handleSelectionConfirm = useCallback(async () => {
    if (selectedProductIds.length === 0) {
      setError('최소 1개의 제품을 선택해주세요.');
      return;
    }

    setError(null);

    try {
      // Fetch selected products
      const response = await fetch('/api/admin/products');
      if (!response.ok) {
        throw new Error('제품 정보를 불러오지 못했습니다.');
      }
      const result = await response.json();
      const allProducts: Product[] = result.data || [];
      const selectedProducts = allProducts.filter((p) => selectedProductIds.includes(p.id));

      // Fetch presets for auto-placement
      let allPresets: PartnerMallPreset[] = [];
      try {
        const productIds = selectedProducts.map((p) => p.id).join(',');
        const presetsRes = await fetch(`/api/admin/partner-mall-presets?product_ids=${productIds}`);
        if (presetsRes.ok) {
          const presetsResult = await presetsRes.json();
          allPresets = presetsResult.data || [];
        }
      } catch (err) {
        console.error('Error fetching presets:', err);
      }

      // Create initial configs with auto-generated placements
      const configs: ProductConfig[] = selectedProducts.map((product) => {
        const firstSide = getFirstSide(product);
        const productPresets = allPresets.filter((p) => p.product_id === product.id);
        const placement = productPresets.length > 0 ? productPresets[0].placement : DEFAULT_PLACEMENT;

        return {
          key: `${product.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          productId: product.id,
          product,
          color: null,
          displayName: `${partnerMallName} ${product.title}`,
          logoPlacement: firstSide ? { [firstSide.id]: placement } : {},
          previewUrl: null,
          canvasState: {},
        };
      });

      setProductConfigs(configs);
      setStep('configure');
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : '제품 정보를 불러오지 못했습니다.');
    }
  }, [selectedProductIds, partnerMallName]);

  // Add a variant (duplicate) of a product
  const addVariant = (config: ProductConfig) => {
    const newConfig: ProductConfig = {
      key: `${config.productId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: config.productId,
      product: config.product,
      color: null,
      displayName: `${partnerMallName} ${config.product.title}`,
      logoPlacement: { ...config.logoPlacement },
      previewUrl: null,
      canvasState: { ...config.canvasState },
    };
    setProductConfigs((prev) => [...prev, newConfig]);
  };

  // Remove a product config
  const removeConfig = (key: string) => {
    setProductConfigs((prev) => prev.filter((c) => c.key !== key));
  };

  // Update color for a config (clears preview since color changed)
  const updateColor = (key: string, color: SelectedColor | null) => {
    setProductConfigs((prev) =>
      prev.map((c) => {
        if (c.key !== key) return c;
        const newName = color
          ? `${partnerMallName} ${c.product.title} (${color.name})`
          : `${partnerMallName} ${c.product.title}`;
        return { ...c, color, displayName: newName, previewUrl: null };
      })
    );
  };

  // Update display name for a config
  const updateDisplayName = (key: string, displayName: string) => {
    setProductConfigs((prev) =>
      prev.map((c) => (c.key === key ? { ...c, displayName } : c))
    );
  };

  // Handle placement editor done
  const handlePlacementDone = (
    key: string,
    placement: Record<string, LogoPlacement>,
    previewUrl: string | null,
    canvasState: Record<string, string>
  ) => {
    setProductConfigs((prev) =>
      prev.map((c) =>
        c.key === key ? { ...c, logoPlacement: placement, previewUrl, canvasState } : c
      )
    );
    setEditingKey(null);
  };

  // Handle final save
  const handleSave = useCallback(async () => {
    if (productConfigs.length === 0) {
      setError('최소 1개의 제품이 필요합니다.');
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const productsData = productConfigs.map((config) => ({
        product_id: config.productId,
        logo_placements: config.logoPlacement,
        canvas_state: config.canvasState || {},
        preview_url: config.previewUrl || null,
        display_name: config.displayName || null,
        manufacturer_color_id: config.color?.id ?? null,
        color_hex: config.color?.hex ?? null,
        color_name: config.color?.name ?? null,
        color_code: config.color?.color_code ?? null,
      }));

      const saveResponse = await fetch('/api/admin/partner-malls/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_mall_id: partnerMallId,
          products: productsData,
        }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json().catch(() => ({}));
        throw new Error(errorData?.error || '제품 추가에 실패했습니다.');
      }

      onProductsAdded();
    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : '제품 추가에 실패했습니다.');
      setIsSaving(false);
    }
  }, [productConfigs, partnerMallId, onProductsAdded]);

  if (isSaving) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-sm w-full mx-4">
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
            <p className="text-gray-600">제품을 추가하는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  // Find the config being edited
  const editingConfig = editingKey
    ? productConfigs.find((c) => c.key === editingKey)
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-xl sm:rounded-xl sm:max-w-4xl w-full sm:mx-4 h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {(step === 'configure' && !editingKey) && (
              <button
                onClick={() => setStep('select')}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              </button>
            )}
            {editingKey && (
              <button
                onClick={() => setEditingKey(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              </button>
            )}
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                {editingKey
                  ? '로고 배치'
                  : step === 'select'
                    ? '제품 선택'
                    : '제품 설정'}
              </h3>
              <p className="text-xs sm:text-sm text-gray-500">
                {editingKey
                  ? '로고 위치를 조정하세요.'
                  : step === 'select'
                    ? '추가할 제품을 선택하세요.'
                    : '각 제품의 색상과 로고 배치를 설정하세요.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 sm:p-4 bg-red-50 border-b border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'select' && (
            <ProductMultiSelect
              selectedProductIds={selectedProductIds}
              onSelectionChange={setSelectedProductIds}
              onConfirm={handleSelectionConfirm}
              onBack={onClose}
            />
          )}

          {step === 'configure' && editingConfig && (
            <InlinePlacementEditor
              key={`${editingConfig.key}-${editingConfig.color?.hex || ''}`}
              product={editingConfig.product}
              logoUrl={logoUrl}
              productColor={editingConfig.color?.hex}
              initialPlacement={editingConfig.logoPlacement}
              onDone={(placement, previewUrl, canvasState) =>
                handlePlacementDone(editingConfig.key, placement, previewUrl, canvasState)
              }
              onCancel={() => setEditingKey(null)}
            />
          )}

          {step === 'configure' && !editingKey && (
            <div className="p-3 sm:p-4 space-y-4">
              {productConfigs.map((config) => (
                <div
                  key={config.key}
                  className="bg-gray-50 rounded-lg border border-gray-200 p-3 sm:p-4"
                >
                  <div className="flex gap-3">
                    {/* Preview area - clickable to edit */}
                    <button
                      onClick={() => setEditingKey(config.key)}
                      className="w-20 h-24 sm:w-24 sm:h-28 bg-white rounded-lg border border-gray-200 overflow-hidden shrink-0 relative group"
                    >
                      {config.previewUrl ? (
                        <img
                          src={config.previewUrl}
                          alt={config.product.title}
                          className="w-full h-full object-contain"
                        />
                      ) : config.product.thumbnail_image_link?.[0] ? (
                        <img
                          src={config.product.thumbnail_image_link[0]}
                          alt={config.product.title}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-6 h-6 text-gray-300" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                        <Edit2 className="w-4 h-4 text-white" />
                      </div>
                      {!config.previewUrl && (
                        <span className="absolute bottom-1 left-1 right-1 text-[9px] text-center text-blue-600 bg-blue-50 rounded px-1 py-0.5">
                          편집
                        </span>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      {/* Product title */}
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {config.product.title}
                      </p>

                      {/* Display name input */}
                      <input
                        type="text"
                        value={config.displayName}
                        onChange={(e) => updateDisplayName(config.key, e.target.value)}
                        placeholder="제품 표시명"
                        className="mt-2 w-full px-2.5 py-1.5 border border-gray-300 rounded text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />

                      {/* Color selector */}
                      <div className="mt-2">
                        <ColorSelector
                          productId={config.productId}
                          selectedColorId={config.color?.id ?? null}
                          onColorSelect={(color) => updateColor(config.key, color)}
                        />
                      </div>

                      {/* Open in full editor */}
                      <button
                        onClick={() => handleOpenEditor(config)}
                        className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        편집기에서 열기
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => addVariant(config)}
                        className="p-1.5 hover:bg-blue-50 rounded transition-colors"
                        title="변형 추가"
                      >
                        <Plus className="w-4 h-4 text-blue-600" />
                      </button>
                      {productConfigs.length > 1 && (
                        <button
                          onClick={() => removeConfig(config.key)}
                          className="p-1.5 hover:bg-red-50 rounded transition-colors"
                          title="제거"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Save button */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('select')}
                  className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  이전
                </button>
                <button
                  onClick={handleSave}
                  disabled={productConfigs.length === 0}
                  className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
                >
                  {productConfigs.length}개 제품 추가
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
