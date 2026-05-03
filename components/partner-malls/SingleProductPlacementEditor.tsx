'use client';

import { useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { X, RotateCcw, Check, Loader2 } from 'lucide-react';
import { PartnerMallProduct, ProductSide, LogoPlacement } from '@/types/types';
import SingleSideCanvas from '@/components/canvas/SingleSideCanvas';
import ColorSelector, { SelectedColor } from './ColorSelector';

interface SingleProductPlacementEditorProps {
  mallProduct: PartnerMallProduct;
  logoUrl: string;
  partnerMallName: string;
  onClose: () => void;
  onSave: () => void;
}

// Get only the first side of a product (front side)
const getFirstSide = (mallProduct: PartnerMallProduct): ProductSide | null => {
  const product = mallProduct.product;
  if (!product) return null;
  const sides = (product.configuration || []) as ProductSide[];
  return sides.length > 0 ? sides[0] : null;
};

export default function SingleProductPlacementEditor({
  mallProduct,
  logoUrl,
  partnerMallName,
  onClose,
  onSave,
}: SingleProductPlacementEditorProps) {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const logoRef = useRef<fabric.FabricImage | null>(null);
  const scaleRef = useRef<number>(1);

  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Color state
  const [selectedColor, setSelectedColor] = useState<SelectedColor | null>(
    mallProduct.manufacturer_color_id && mallProduct.color_hex
      ? {
          id: mallProduct.manufacturer_color_id,
          hex: mallProduct.color_hex,
          name: mallProduct.color_name || '',
          color_code: mallProduct.color_code || '',
        }
      : null
  );

  // Display name state
  const [displayName, setDisplayName] = useState(
    mallProduct.display_name || ''
  );

  // Price state
  const [price, setPrice] = useState<number | null>(
    mallProduct.price ?? null
  );

  // Canvas key to force re-render when color changes
  const [canvasKey, setCanvasKey] = useState(0);

  const canvasWidth = 400;
  const canvasHeight = 500;

  const currentSide = getFirstSide(mallProduct);
  const product = mallProduct.product;

  // Auto-generate display name when color changes
  const handleColorSelect = (color: SelectedColor | null) => {
    setSelectedColor(color);
    // Auto-generate display name
    const productTitle = product?.title || '';
    const newName = color
      ? `${partnerMallName} ${productTitle} (${color.name})`
      : `${partnerMallName} ${productTitle}`;
    setDisplayName(newName);
    // Re-render canvas with new color
    setCanvasKey((prev) => prev + 1);
  };

  // Get current placement state
  const getCurrentPlacement = useCallback((): LogoPlacement | null => {
    if (!canvasRef.current || !logoRef.current || !currentSide) return null;

    const canvas = canvasRef.current;
    const logo = logoRef.current;
    const canvasScale = scaleRef.current;

    // @ts-expect-error - Custom property
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property
    const printAreaTop = canvas.printAreaTop || 0;

    const logoLeft = logo.left || 0;
    const logoTop = logo.top || 0;
    const logoWidth = (logo.width || 100) * (logo.scaleX || 1);
    const logoHeight = (logo.height || 100) * (logo.scaleY || 1);

    return {
      x: Math.round((logoLeft - printAreaLeft) / canvasScale),
      y: Math.round((logoTop - printAreaTop) / canvasScale),
      width: Math.round(logoWidth / canvasScale),
      height: Math.round(logoHeight / canvasScale),
    };
  }, [currentSide]);

  // Reset logo to center position
  const resetToCenter = useCallback(() => {
    if (!canvasRef.current || !logoRef.current || !currentSide) return;

    const canvas = canvasRef.current;
    const logo = logoRef.current;
    const canvasScale = scaleRef.current;

    // @ts-expect-error - Custom property
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property
    const printAreaTop = canvas.printAreaTop || 0;

    const centerX = currentSide.printArea.width / 2;
    const centerY = currentSide.printArea.height / 2;

    const maxLogoWidth = currentSide.printArea.width * 0.2;
    const maxLogoHeight = currentSide.printArea.height * 0.2;
    const logoScale = Math.min(
      maxLogoWidth / (logo.width || 100),
      maxLogoHeight / (logo.height || 100)
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
  }, [currentSide]);

  // Handle canvas ready callback
  const handleCanvasReady = useCallback((canvas: fabric.Canvas, sideId: string, canvasScale: number) => {
    canvasRef.current = canvas;
    scaleRef.current = canvasScale;

    if (!currentSide) return;

    // @ts-expect-error - Custom property
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property
    const printAreaTop = canvas.printAreaTop || 0;

    // Load logo image
    fabric.FabricImage.fromURL(logoUrl, { crossOrigin: 'anonymous' })
      .then((logoImg) => {
        const existingPlacement = mallProduct.logo_placements?.[sideId];

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
          const centerX = currentSide.printArea.width / 2;
          const centerY = currentSide.printArea.height / 2;

          const maxLogoWidth = currentSide.printArea.width * 0.2;
          const maxLogoHeight = currentSide.printArea.height * 0.2;
          const logoScale = Math.min(
            maxLogoWidth / (logoImg.width || 100),
            maxLogoHeight / (logoImg.height || 100)
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
        canvas.add(logoImg);
        canvas.setActiveObject(logoImg);
        canvas.renderAll();

        setIsCanvasReady(true);
      })
      .catch((err) => {
        console.error('Error loading logo:', err);
        setError('로고를 불러오는데 실패했습니다.');
        setIsCanvasReady(true);
      });
  }, [logoUrl, mallProduct.logo_placements, currentSide]);

  // Generate preview image from canvas
  const generatePreviewImage = useCallback((): string | null => {
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;

    // Deselect all objects to remove selection border
    canvas.discardActiveObject();
    canvas.renderAll();

    // Generate preview as data URL with higher resolution
    return canvas.toDataURL({
      format: 'png',
      quality: 0.9,
      multiplier: 2,
    });
  }, []);

  // Serialize canvas state (user objects only, matching editor format)
  const serializeCanvasState = useCallback((): Record<string, string> => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSide) return {};

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

    return { [currentSide.id]: JSON.stringify(canvasData) };
  }, [currentSide]);

  // Handle save
  const handleSave = async () => {
    if (!currentSide) return;

    const placement = getCurrentPlacement();
    if (!placement) {
      setError('배치 정보를 가져오는데 실패했습니다.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Generate preview image
      const previewUrl = generatePreviewImage();

      // Serialize the full canvas state including the logo object
      const canvasState = serializeCanvasState();

      const response = await fetch('/api/admin/partner-malls/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mallProduct.id,
          logo_placements: {
            ...mallProduct.logo_placements,
            [currentSide.id]: placement,
          },
          canvas_state: canvasState,
          preview_url: previewUrl,
          display_name: displayName || null,
          manufacturer_color_id: selectedColor?.id ?? null,
          color_hex: selectedColor?.hex ?? null,
          color_name: selectedColor?.name ?? null,
          color_code: selectedColor?.color_code ?? null,
          price: price,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || '저장에 실패했습니다.');
      }

      onSave();
    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentSide || !product) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <p className="text-gray-500">제품 정보를 불러올 수 없습니다.</p>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-xl sm:rounded-xl sm:max-w-lg w-full sm:mx-4 overflow-hidden h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800">제품 편집</h3>
            <p className="text-xs sm:text-sm text-gray-500 truncate">{product.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1">
          {error && (
            <div className="mb-3 sm:mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Display name input */}
          <div className="mb-3 sm:mb-4">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              제품명
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={`${partnerMallName} ${product.title}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Color selector */}
          <div className="mb-3 sm:mb-4">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              색상
            </label>
            <ColorSelector
              productId={mallProduct.product_id}
              selectedColorId={selectedColor?.id ?? null}
              onColorSelect={handleColorSelect}
            />
          </div>

          {/* Price input */}
          <div className="mb-3 sm:mb-4">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              가격 (원)
            </label>
            <input
              type="number"
              value={price ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setPrice(val === '' ? null : parseFloat(val));
              }}
              placeholder="가격 입력"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <p className="text-xs text-gray-500 mb-3 sm:mb-4">
            로고를 드래그하여 위치를 조정하세요.
          </p>

          {/* Canvas container */}
          <div className="relative bg-gray-100 rounded-lg overflow-hidden flex justify-center">
            {!isCanvasReady && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            )}
            <div className="w-full overflow-auto flex justify-center">
              <SingleSideCanvas
                key={`${mallProduct.id}-${currentSide.id}-${canvasKey}`}
                side={currentSide}
                width={canvasWidth}
                height={canvasHeight}
                isEdit={true}
                canvasState={{ objects: [] }}
                productColor={selectedColor?.hex}
                onCanvasReady={handleCanvasReady}
                showScaleBox={false}
              />
            </div>
          </div>

          {/* Reset button */}
          <div className="mt-3 sm:mt-4">
            <button
              onClick={resetToCenter}
              disabled={!isCanvasReady}
              className="flex items-center gap-2 py-2 px-3 sm:px-4 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              중앙으로 초기화
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 sm:py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !isCanvasReady}
            className="flex-1 py-2.5 sm:py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                저장
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
