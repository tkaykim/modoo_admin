'use client'

import React, { useMemo, useState, useEffect } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '@/store/useCanvasStore';
import { ProductSide, PrintMethod } from '@/types/types';
import { Image as ImageIcon, Type, Square, HelpCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { getPrintMethodShortName } from '@/lib/printPricingConfig';
import { calculateAllSidesPricing, ObjectPricing, PricingSummary } from '@/app/utils/canvasPricing';

interface ObjectPreviewPanelProps {
  sides: ProductSide[];
  quantity?: number;
  compact?: boolean;
}

interface CanvasObjectInfo {
  objectId: string;
  type: string;
  sideId: string;
  sideName: string;
  widthMm: number;
  heightMm: number;
  printMethod?: PrintMethod;
  preview: string;
  object: fabric.FabricObject;
  pricing?: ObjectPricing;
}

const PRINT_METHODS: { method: PrintMethod; label: string; shortLabel: string; description: string }[] = [
  { method: 'dtf', label: 'DTF 전사', shortLabel: 'DTF', description: '다양한 색상과 그라데이션에 적합' },
  { method: 'dtg', label: 'DTG 전사', shortLabel: 'DTG', description: '고품질 디지털 프린팅' },
  { method: 'screen_printing', label: '나염', shortLabel: '나염', description: '대량 주문에 경제적' },
  { method: 'embroidery', label: '자수', shortLabel: '자수', description: '고급스러운 느낌, 내구성 우수' },
  { method: 'applique', label: '아플리케', shortLabel: '아플리케', description: '입체감 있는 디자인' },
];

const ObjectPreviewPanel: React.FC<ObjectPreviewPanelProps> = ({ sides, quantity = 1, compact = false }) => {
  const { canvasMap, canvasVersion, setObjectPrintMethod, getObjectPrintMethod } = useCanvasStore();
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());
  const [pricingSummary, setPricingSummary] = useState<PricingSummary | null>(null);

  // Calculate pricing whenever canvas changes
  useEffect(() => {
    const calculatePricing = async () => {
      if (Object.keys(canvasMap).length === 0) return;
      const summary = await calculateAllSidesPricing(canvasMap, sides);
      setPricingSummary(summary);
    };
    calculatePricing();
  }, [canvasMap, sides, canvasVersion]);

  // Extract all user objects from all canvases
  const allObjects = useMemo(() => {
    const objects: CanvasObjectInfo[] = [];

    sides.forEach((side) => {
      const canvas = canvasMap[side.id];
      if (!canvas) return;

      const realWorldProductWidth = side.realLifeDimensions?.productWidthMm || 500;
      // @ts-expect-error - Custom property
      const scaledImageWidth = canvas.scaledImageWidth;
      // @ts-expect-error - Custom property
      const calibrationNative = (canvas.calibrationNativeMmPerPx as number | undefined) ?? 0;
      // @ts-expect-error - Custom property
      const originalImageWidth = canvas.originalImageWidth as number | undefined;
      const calibratedRatio =
        calibrationNative > 0 && originalImageWidth && scaledImageWidth
          ? calibrationNative / (scaledImageWidth / originalImageWidth)
          : 0;
      const pixelToMmRatio = calibratedRatio > 0
        ? calibratedRatio
        : (scaledImageWidth ? realWorldProductWidth / scaledImageWidth : 0.25);

      const userObjects = canvas.getObjects().filter(obj => {
        if (obj.excludeFromExport) return false;
        // @ts-expect-error - Checking custom data property
        if (obj.data?.id === 'background-product-image') return false;
        return true;
      });

      userObjects.forEach((obj) => {
        // @ts-expect-error - Accessing custom data property
        const objectId = obj.data?.objectId;
        if (!objectId) return;

        const boundingRect = obj.getBoundingRect();
        const widthMm = boundingRect.width * pixelToMmRatio;
        const heightMm = boundingRect.height * pixelToMmRatio;
        const printMethod = getObjectPrintMethod(obj);

        // Find pricing info for this object
        const objectPricing = pricingSummary?.sidePricing
          .find(sp => sp.sideId === side.id)?.objects
          .find(op => op.objectId === objectId);

        let preview = '';
        try {
          const bounds = obj.getBoundingRect();
          const padding = 20;
          const left = Math.max(0, bounds.left - padding);
          const top = Math.max(0, bounds.top - padding);
          const width = bounds.width + (padding * 2);
          const height = bounds.height + (padding * 2);

          preview = canvas.toDataURL({
            format: 'png',
            quality: 0.8,
            multiplier: 1,
            left,
            top,
            width,
            height,
          });
        } catch (error) {
          console.error('[ObjectPreviewPanel] Failed to generate preview:', error);
        }

        objects.push({
          objectId,
          type: obj.type || 'unknown',
          sideId: side.id,
          sideName: side.name,
          widthMm,
          heightMm,
          printMethod: printMethod || undefined,
          preview,
          object: obj,
          pricing: objectPricing,
        });
      });
    });

    return objects;
    // canvasVersion triggers recalculation when canvas objects change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasMap, sides, canvasVersion, getObjectPrintMethod, pricingSummary]);

  const handlePrintMethodChange = (objectId: string, method: PrintMethod) => {
    setObjectPrintMethod(objectId, method);
  };

  const toggleObjectExpanded = (objectId: string) => {
    setExpandedObjects(prev => {
      const next = new Set(prev);
      if (next.has(objectId)) {
        next.delete(objectId);
      } else {
        next.add(objectId);
      }
      return next;
    });
  };

  const getObjectIcon = (type: string) => {
    if (type === 'image') return <ImageIcon className="size-4" />;
    if (type === 'i-text' || type === 'text') return <Type className="size-4" />;
    return <Square className="size-4" />;
  };

  const getObjectTypeName = (type: string) => {
    if (type === 'image') return '이미지';
    if (type === 'i-text' || type === 'text') return '텍스트';
    if (type === 'rect') return '사각형';
    if (type === 'circle') return '원형';
    return '오브젝트';
  };

  const getPrintSizeLabel = (size: string) => {
    const labels: Record<string, string> = {
      '10x10': '10x10cm',
      'A4': 'A4',
      'A3': 'A3'
    };
    return labels[size] || size;
  };

  if (allObjects.length === 0) {
    return null;
  }

  const totalPrice = pricingSummary?.totalAdditionalPrice || 0;

  return (
    <div className={`bg-white ${compact ? 'p-2.5 mb-2.5' : 'p-4 mb-4'} rounded-lg border border-gray-200`}>
      <div className={`flex items-center justify-between ${compact ? 'mb-2' : 'mb-3'}`}>
        <h3 className={`${compact ? 'text-[11px]' : 'text-sm'} font-bold text-gray-800`}>인쇄 옵션 설정</h3>
        <button
          onClick={() => setIsPricingModalOpen(true)}
          className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
          title="인쇄방법 가격 안내"
        >
          <HelpCircle className="size-4" />
        </button>
      </div>

      {/* Pricing Info Modal */}
      {isPricingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h4 className="text-lg font-bold text-gray-800">인쇄방법별 가격 안내</h4>
              <button
                onClick={() => setIsPricingModalOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Transfer Methods */}
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <h5 className="font-bold text-blue-800 mb-2">전사 방식 (DTF/DTG)</h5>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• 크기 기준 고정 가격</li>
                  <li>• 10x10cm: DTF 4,000원 / DTG 6,000원</li>
                  <li>• A4: DTF 5,000원 / DTG 7,000원</li>
                  <li>• A3: DTF 7,000원 / DTG 9,000원</li>
                </ul>
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-xs text-blue-700 font-medium">
                    적합한 용도: 복잡한 그래픽, 사진, 그라데이션, 소량 주문
                  </p>
                </div>
              </div>

              {/* Screen Printing */}
              <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                <h5 className="font-bold text-green-800 mb-2">나염 (Screen Printing)</h5>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• 색상 수 × 기본가격으로 책정</li>
                  <li>• 100개 이하: 색상당 60,000~100,000원</li>
                  <li>• 100개 초과 시 개당 추가 비용</li>
                </ul>
                <div className="mt-3 pt-3 border-t border-green-200">
                  <p className="text-xs text-green-700 font-medium">
                    적합한 용도: 대량 주문, 단색 또는 소수 색상 디자인
                  </p>
                </div>
              </div>

              {/* Embroidery */}
              <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                <h5 className="font-bold text-purple-800 mb-2">자수 (Embroidery)</h5>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• 색상 수 × 기본가격으로 책정</li>
                  <li>• 100개 이하: 색상당 60,000~100,000원</li>
                  <li>• 고급스러운 입체감</li>
                </ul>
                <div className="mt-3 pt-3 border-t border-purple-200">
                  <p className="text-xs text-purple-700 font-medium">
                    적합한 용도: 로고, 텍스트, 고급 의류
                  </p>
                </div>
              </div>

              {/* Applique */}
              <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                <h5 className="font-bold text-orange-800 mb-2">아플리케 (Applique)</h5>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• 색상 수 × 기본가격으로 책정</li>
                  <li>• 원단을 덧대어 입체감 표현</li>
                  <li>• 독특한 질감과 디자인</li>
                </ul>
                <div className="mt-3 pt-3 border-t border-orange-200">
                  <p className="text-xs text-orange-700 font-medium">
                    적합한 용도: 스포츠웨어, 유니폼, 특수 디자인
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => setIsPricingModalOpen(false)}
                className="w-full py-2 px-4 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {allObjects.map((objInfo) => {
          const isExpanded = expandedObjects.has(objInfo.objectId);
          const currentMethod = objInfo.printMethod || 'dtf';

          return (
            <div
              key={objInfo.objectId}
              className="border border-gray-200 rounded-lg bg-gray-50 overflow-hidden"
            >
              {/* Object Header - Always Visible */}
              <button
                onClick={() => toggleObjectExpanded(objInfo.objectId)}
                className={`w-full ${compact ? 'p-2' : 'p-3'} flex items-center gap-3 hover:bg-gray-100 transition-colors`}
              >
                {/* Preview Thumbnail */}
                <div className={`${compact ? 'w-9 h-9' : 'w-12 h-12'} bg-white border border-gray-200 rounded flex items-center justify-center shrink-0 overflow-hidden`}>
                  {objInfo.preview ? (
                    <img
                      src={objInfo.preview}
                      alt={getObjectTypeName(objInfo.type)}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="text-gray-400">
                      {getObjectIcon(objInfo.type)}
                    </div>
                  )}
                </div>

                {/* Object Info */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    {getObjectIcon(objInfo.type)}
                    <span className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-gray-700`}>
                      {getObjectTypeName(objInfo.type)}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({objInfo.sideName})
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-500">
                      {objInfo.widthMm.toFixed(0)}×{objInfo.heightMm.toFixed(0)}mm
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                      {getPrintMethodShortName(currentMethod)}
                    </span>
                    {objInfo.pricing && (
                      <span className="text-xs font-semibold text-green-600">
                        {objInfo.pricing.price.toLocaleString('ko-KR')}원
                      </span>
                    )}
                  </div>
                </div>

                {/* Expand Icon */}
                {isExpanded ? (
                  <ChevronUp className={`${compact ? 'size-4' : 'size-5'} text-gray-400`} />
                ) : (
                  <ChevronDown className={`${compact ? 'size-4' : 'size-5'} text-gray-400`} />
                )}
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-gray-200 bg-white">
                  {/* Size and Color Info */}
                  <div className="py-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">크기:</span>
                      <span className="ml-1 font-medium">
                        {objInfo.widthMm.toFixed(1)} × {objInfo.heightMm.toFixed(1)}mm
                      </span>
                    </div>
                    {objInfo.pricing && (
                      <>
                        <div>
                          <span className="text-gray-500">인쇄 사이즈:</span>
                          <span className="ml-1 font-medium">
                            {getPrintSizeLabel(objInfo.pricing.printSize)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">색상 수:</span>
                          <span className="ml-1 font-medium">{objInfo.pricing.colorCount}색</span>
                        </div>
                        <div>
                          <span className="text-gray-500">예상 가격:</span>
                          <span className="ml-1 font-semibold text-green-600">
                            {objInfo.pricing.price.toLocaleString('ko-KR')}원
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Print Method Selector */}
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-700 mb-2">인쇄 방식 선택</p>
                    <div className="flex flex-wrap gap-2">
                      {PRINT_METHODS.map(({ method, shortLabel }) => (
                        <button
                          key={method}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrintMethodChange(objInfo.objectId, method);
                          }}
                          className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                            currentMethod === method
                              ? 'border-blue-500 bg-blue-500 text-white'
                              : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:bg-blue-50'
                          }`}
                        >
                          {shortLabel}
                        </button>
                      ))}
                    </div>
                    {/* Method Description */}
                    <p className="mt-2 text-xs text-gray-500">
                      {PRINT_METHODS.find(m => m.method === currentMethod)?.description}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <p className="text-xs text-gray-600">
            총 <span className="font-semibold text-gray-800">{allObjects.length}개</span>의 인쇄 요소
          </p>
          {totalPrice > 0 && (
            <p className={`${compact ? 'text-[11px]' : 'text-sm'} font-bold text-green-600`}>
              인쇄비: {totalPrice.toLocaleString('ko-KR')}원
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ObjectPreviewPanel;
