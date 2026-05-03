'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as fabric from 'fabric';
import { Edit2, Check, Loader2, Package } from 'lucide-react';
import { Product, ProductSide, LogoPlacement } from '@/types/types';
import SingleSideCanvas from '@/components/canvas/SingleSideCanvas';

interface ProductPlacement {
  productId: string;
  placements: Record<string, LogoPlacement>;
  canvasStates: Record<string, unknown>;
}

interface ProductPreviewGridProps {
  products: Product[];
  logoUrl: string;
  placements: ProductPlacement[];
  productColors?: Record<string, string>; // productId -> hex color
  onEditProduct: (productIndex: number, sideIndex: number) => void;
  onConfirm: () => void;
  onBack: () => void;
  onPreviewCaptured?: (productId: string, dataUrl: string) => void;
}

interface PreviewItem {
  productId: string;
  productTitle: string;
  sideId: string;
  sideName: string;
  side: ProductSide;
  placement: LogoPlacement | null;
  productIndex: number;
  sideIndex: number;
}

// Individual preview card component that captures canvas as a static image
function PreviewCard({
  item,
  logoUrl,
  productColor,
  onEdit,
  onPreviewCaptured,
}: {
  item: PreviewItem;
  logoUrl: string;
  productColor?: string;
  onEdit: () => void;
  onPreviewCaptured?: (productId: string, dataUrl: string) => void;
}) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const prevColorRef = useRef(productColor);

  // Re-render canvas when productColor changes
  useEffect(() => {
    if (prevColorRef.current !== productColor) {
      prevColorRef.current = productColor;
      setPreviewImage(null);
      setIsLoading(true);
    }
  }, [productColor]);

  // Preview canvas dimensions (scaled down from editor)
  const previewWidth = 160;
  const previewHeight = 200;

  // Handle canvas ready - add logo and capture as static image
  const handleCanvasReady = useCallback((canvas: fabric.Canvas, _sideId: string, canvasScale: number) => {
    const captureCanvas = () => {
      requestAnimationFrame(() => {
        try {
          const dataUrl = canvas.toDataURL({ format: 'png', quality: 0.9, multiplier: 2 });
          setPreviewImage(dataUrl);
          onPreviewCaptured?.(item.productId, dataUrl);
        } catch (err) {
          console.error('Error capturing preview:', err);
        }
        setIsLoading(false);
      });
    };

    if (!item.placement) {
      captureCanvas();
      return;
    }

    // Get print area offset from canvas (set by SingleSideCanvas)
    // @ts-expect-error - Custom property
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property
    const printAreaTop = canvas.printAreaTop || 0;

    // Load and add logo using print-area-relative coordinates
    fabric.FabricImage.fromURL(logoUrl, { crossOrigin: 'anonymous' })
      .then((logoImg) => {
        const placement = item.placement!;

        // Placement coordinates are now in print-area-relative space (unscaled)
        // Convert to preview canvas coordinates
        const logoScale = Math.min(
          placement.width / (logoImg.width || 100),
          placement.height / (logoImg.height || 100)
        );

        logoImg.set({
          left: printAreaLeft + placement.x * canvasScale,
          top: printAreaTop + placement.y * canvasScale,
          scaleX: logoScale * canvasScale,
          scaleY: logoScale * canvasScale,
          originX: 'left',
          originY: 'top',
          selectable: false,
          evented: false,
          data: { id: 'partner-mall-logo' },
        });

        canvas.add(logoImg);
        canvas.renderAll();
        captureCanvas();
      })
      .catch((err) => {
        console.error('Error loading logo for preview:', err);
        captureCanvas();
      });
  }, [item.placement, item.productId, logoUrl, onPreviewCaptured]);

  return (
    <div className="relative group">
      {/* Preview image or canvas (hidden during capture) */}
      <div className="bg-gray-100 rounded-lg overflow-hidden aspect-4/5">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}
        {previewImage ? (
          <img
            src={previewImage}
            alt={item.productTitle}
            className="w-full h-full object-contain"
          />
        ) : (
          <div style={{ opacity: 0 }}>
            <SingleSideCanvas
              key={`${item.productId}-${item.sideId}-${productColor || ''}`}
              side={item.side}
              width={previewWidth}
              height={previewHeight}
              isEdit={false}
              canvasState={{ objects: [] }}
              productColor={productColor}
              onCanvasReady={handleCanvasReady}
            />
          </div>
        )}
      </div>

      {/* Edit overlay - always visible on mobile, hover on desktop */}
      <button
        onClick={onEdit}
        className="absolute inset-0 bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-end sm:items-center justify-center pb-3 sm:pb-0 rounded-lg"
      >
        <div className="bg-white rounded-full p-2">
          <Edit2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
        </div>
      </button>

      {/* Placement indicator */}
      {item.placement && (
        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Product info */}
      <div className="mt-1.5 sm:mt-2">
        <p className="text-xs sm:text-sm font-medium text-gray-800 truncate">
          {item.productTitle}
        </p>
        <p className="text-xs text-gray-500">{item.sideName}</p>
      </div>
    </div>
  );
}

export default function ProductPreviewGrid({
  products,
  logoUrl,
  placements,
  productColors,
  onEditProduct,
  onConfirm,
  onBack,
  onPreviewCaptured,
}: ProductPreviewGridProps) {
  const [previews, setPreviews] = useState<PreviewItem[]>([]);

  // Generate preview items (first side only for each product)
  useEffect(() => {
    const items: PreviewItem[] = [];

    products.forEach((product, productIndex) => {
      const productPlacement = placements.find((p) => p.productId === product.id);
      const sides = (product.configuration || []) as ProductSide[];

      // Only use the first side (front) of each product
      if (sides.length > 0) {
        const side = sides[0];
        const placement = productPlacement?.placements[side.id] || null;

        items.push({
          productId: product.id,
          productTitle: product.title,
          sideId: side.id,
          sideName: side.name,
          side,
          placement,
          productIndex,
          sideIndex: 0,
        });
      }
    });

    setPreviews(items);
  }, [products, placements]);

  // Handle edit
  const handleEdit = (productIndex: number, sideIndex: number) => {
    onEditProduct(productIndex, sideIndex);
  };

  const placedCount = previews.filter((p) => p.placement).length;

  return (
    <div className="bg-white rounded-lg p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2">미리보기</h2>
      <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
        모든 제품에 로고가 적용된 모습입니다. 수정이 필요하면 해당 제품을 클릭하세요.
      </p>

      {/* Preview grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 max-h-125 overflow-y-auto p-1">
        {previews.length > 0 ? (
          previews.map((item) => (
            <PreviewCard
              key={`${item.productId}-${item.sideId}`}
              item={item}
              logoUrl={logoUrl}
              productColor={productColors?.[item.productId]}
              onEdit={() => handleEdit(item.productIndex, item.sideIndex)}
              onPreviewCaptured={onPreviewCaptured}
            />
          ))
        ) : (
          <div className="col-span-full flex items-center justify-center py-8 sm:py-12">
            <div className="text-center">
              <Package className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm sm:text-base text-gray-500">제품이 없습니다</p>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">
          총 {previews.length}개 제품의 앞면에 로고가 적용됩니다.
          {placedCount}개 완료됨.
        </p>
      </div>

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
          className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
        >
          <Check className="w-4 h-4 sm:w-5 sm:h-5" />
          저장하기
        </button>
      </div>
    </div>
  );
}
