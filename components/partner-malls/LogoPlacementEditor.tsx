'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { ChevronLeft, ChevronRight, RotateCcw, Check, Loader2 } from 'lucide-react';
import { Product, ProductSide, LogoPlacement } from '@/types/types';
import SingleSideCanvas from '@/components/canvas/SingleSideCanvas';

interface ProductPlacement {
  productId: string;
  placements: Record<string, LogoPlacement>; // keyed by side.id
  canvasStates: Record<string, unknown>; // keyed by side.id
}

interface LogoPlacementEditorProps {
  products: Product[];
  logoUrl: string;
  placements: ProductPlacement[];
  onPlacementsChange: (placements: ProductPlacement[]) => void;
  onConfirm: () => void;
  onBack: () => void;
  productColor?: string;
}

// Get only the first side of a product (front side)
const getFirstSide = (product: Product): ProductSide | null => {
  const sides = (product.configuration || []) as ProductSide[];
  return sides.length > 0 ? sides[0] : null;
};

export default function LogoPlacementEditor({
  products,
  logoUrl,
  placements,
  onPlacementsChange,
  onConfirm,
  onBack,
  productColor,
}: LogoPlacementEditorProps) {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const logoRef = useRef<fabric.FabricImage | null>(null);

  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [isCanvasReady, setIsCanvasReady] = useState(false);

  const canvasWidth = 400;
  const canvasHeight = 500;

  const currentProduct = products[currentProductIndex];
  const currentSide = currentProduct ? getFirstSide(currentProduct) : null;

  // Get or create placement for current product
  const getProductPlacement = useCallback(
    (productId: string): ProductPlacement => {
      const existing = placements.find((p) => p.productId === productId);
      if (existing) return existing;
      return {
        productId,
        placements: {},
        canvasStates: {},
      };
    },
    [placements]
  );

  // Update placement for current product/side
  const updatePlacement = useCallback(
    (sideId: string, placement: LogoPlacement, canvasState?: unknown) => {
      const productId = currentProduct.id;
      const newPlacements = [...placements];
      const index = newPlacements.findIndex((p) => p.productId === productId);

      if (index >= 0) {
        newPlacements[index] = {
          ...newPlacements[index],
          placements: {
            ...newPlacements[index].placements,
            [sideId]: placement,
          },
          canvasStates: canvasState
            ? {
                ...newPlacements[index].canvasStates,
                [sideId]: canvasState,
              }
            : newPlacements[index].canvasStates,
        };
      } else {
        newPlacements.push({
          productId,
          placements: { [sideId]: placement },
          canvasStates: canvasState ? { [sideId]: canvasState } : {},
        });
      }

      onPlacementsChange(newPlacements);
    },
    [currentProduct, placements, onPlacementsChange]
  );

  // Save current canvas state using print-area-relative coordinates
  const saveCurrentState = useCallback(() => {
    if (!canvasRef.current || !logoRef.current || !currentSide) return;

    const canvas = canvasRef.current;
    const logo = logoRef.current;

    // Get print area position and canvas scale
    // @ts-expect-error - Custom property
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property
    const printAreaTop = canvas.printAreaTop || 0;
    // @ts-expect-error - Custom property
    const scaledImageWidth = canvas.scaledImageWidth || canvasWidth;
    // @ts-expect-error - Custom property
    const originalImageWidth = canvas.originalImageWidth || canvasWidth;
    const canvasScale = originalImageWidth > 0 ? scaledImageWidth / originalImageWidth : 1;

    const logoLeft = logo.left || 0;
    const logoTop = logo.top || 0;
    const logoWidth = (logo.width || 100) * (logo.scaleX || 1);
    const logoHeight = (logo.height || 100) * (logo.scaleY || 1);

    // Convert from canvas coordinates to print-area-relative coordinates (unscaled)
    const placement: LogoPlacement = {
      x: Math.round((logoLeft - printAreaLeft) / canvasScale),
      y: Math.round((logoTop - printAreaTop) / canvasScale),
      width: Math.round(logoWidth / canvasScale),
      height: Math.round(logoHeight / canvasScale),
    };

    // Serialize canvas state in editor-compatible format
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

    const canvasState = JSON.stringify(canvasData);
    updatePlacement(currentSide.id, placement, canvasState);
  }, [currentSide, updatePlacement]);

  // Reset logo to center of print area
  const resetToCenter = useCallback(() => {
    if (!canvasRef.current || !logoRef.current || !currentSide) return;

    const canvas = canvasRef.current;
    const logo = logoRef.current;

    // Get print area position and canvas scale
    // @ts-expect-error - Custom property
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property
    const printAreaTop = canvas.printAreaTop || 0;
    // @ts-expect-error - Custom property
    const scaledImageWidth = canvas.scaledImageWidth || canvasWidth;
    // @ts-expect-error - Custom property
    const originalImageWidth = canvas.originalImageWidth || canvasWidth;
    const canvasScale = originalImageWidth > 0 ? scaledImageWidth / originalImageWidth : 1;

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
    saveCurrentState();
  }, [currentSide, saveCurrentState]);

  // Handle canvas ready callback from SingleSideCanvas
  const handleCanvasReady = useCallback((canvas: fabric.Canvas, sideId: string, canvasScale: number) => {
    canvasRef.current = canvas;

    if (!currentSide) return;

    // Get print area position from canvas
    // @ts-expect-error - Custom property
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property
    const printAreaTop = canvas.printAreaTop || 0;

    // Load logo image
    fabric.FabricImage.fromURL(logoUrl, { crossOrigin: 'anonymous' })
      .then((logoImg) => {
        const productPlacement = getProductPlacement(currentProduct.id);
        const existingPlacement = productPlacement.placements[sideId];

        if (existingPlacement) {
          // Convert from print-area-relative coordinates to canvas coordinates
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
          // Default to center of print area
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

        // Setup modification handler
        canvas.on('object:modified', (e) => {
          const target = e.target as { data?: { id?: string } } | undefined;
          if (target?.data?.id === 'partner-mall-logo') {
            saveCurrentState();
          }
        });
      })
      .catch((err) => {
        console.error('Error loading logo:', err);
        setIsCanvasReady(true);
      });
  }, [logoUrl, currentProduct.id, currentSide, getProductPlacement, saveCurrentState]);

  // Reset canvas ready state when product changes
  useEffect(() => {
    setIsCanvasReady(false);
    logoRef.current = null;
  }, [currentProduct.id, currentSide?.id]);

  // Navigation handlers
  const goToPrevious = () => {
    saveCurrentState();
    if (currentProductIndex > 0) {
      setCurrentProductIndex(currentProductIndex - 1);
    }
  };

  const goToNext = () => {
    saveCurrentState();
    if (currentProductIndex < products.length - 1) {
      setCurrentProductIndex(currentProductIndex + 1);
    }
  };

  const isFirst = currentProductIndex === 0;
  const isLast = currentProductIndex === products.length - 1;

  const handleConfirm = () => {
    saveCurrentState();
    onConfirm();
  };

  const totalItems = products.length;
  const currentItemIndex = currentProductIndex;

  if (!currentSide) {
    return (
      <div className="bg-white rounded-lg p-6">
        <p className="text-gray-500">제품 정보를 불러올 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2">로고 배치 조정</h2>
      <p className="text-sm sm:text-base text-gray-600 mb-3 sm:mb-4">
        로고를 드래그하여 위치를 조정하세요. (앞면만 배치)
      </p>

      {/* Progress indicator */}
      <div className="mb-3 sm:mb-4">
        <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600 mb-1">
          <span className="truncate mr-2">
            {currentProduct?.title} - {currentSide?.name || '앞면'}
          </span>
          <span className="shrink-0">
            {currentItemIndex + 1} / {totalItems}
          </span>
        </div>
        <div className="w-full h-1.5 sm:h-2 bg-gray-200 rounded-full">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${((currentItemIndex + 1) / totalItems) * 100}%` }}
          />
        </div>
      </div>

      {/* Canvas container */}
      <div className="relative bg-gray-100 rounded-lg overflow-hidden mb-3 sm:mb-4 flex justify-center">
        {!isCanvasReady && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}
        <div className="w-full overflow-auto flex justify-center">
          <SingleSideCanvas
            key={`${currentProduct.id}-${currentSide.id}`}
            side={currentSide}
            width={canvasWidth}
            height={canvasHeight}
            isEdit={true}
            canvasState={{ objects: [] }}
            onCanvasReady={handleCanvasReady}
            showScaleBox={false}
            productColor={productColor}
          />
        </div>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <button
          onClick={resetToCenter}
          disabled={!isCanvasReady}
          className="flex items-center gap-1.5 sm:gap-2 py-2 px-3 sm:px-4 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="hidden sm:inline">중앙으로 초기화</span>
          <span className="sm:hidden">초기화</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevious}
            disabled={isFirst}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goToNext}
            disabled={isLast}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Action button */}
      <button
        onClick={handleConfirm}
        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
      >
        <Check className="w-4 h-4 sm:w-5 sm:h-5" />
        완료
      </button>
    </div>
  );
}
