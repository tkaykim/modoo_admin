'use client'
import { useCanvasStore } from "@/store/useCanvasStore";
import { ProductSide } from "@/types/types";
import { calculateAllSidesPricing, PricingSummary, SidePricing, ObjectPricing } from "@/app/utils/canvasPricing";
import { getPrintMethodShortName } from "@/lib/printPricingConfig";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface PricingInfoProps {
  basePrice: number;
  sides: ProductSide[];
  quantity?: number;
  compact?: boolean;
}

export default function PricingInfo({ basePrice, sides, quantity = 1, compact = false }: PricingInfoProps) {
  const { canvasMap, canvasVersion } = useCanvasStore();
  const [pricingData, setPricingData] = useState<PricingSummary | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate pricing asynchronously whenever canvases change
  useEffect(() => {
    const calculatePricing = async () => {
      if (Object.keys(canvasMap).length === 0) {
        setPricingData(null);
        return;
      }
      const summary = await calculateAllSidesPricing(canvasMap, sides);
      setPricingData(summary);
    };
    calculatePricing();
    // canvasVersion triggers recalculation when canvas objects change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasMap, sides, canvasVersion]);

  if (!pricingData) {
    return null;
  }

  const totalPrice = basePrice + pricingData.totalAdditionalPrice;

  // Filter only sides that have objects
  const sidesWithObjects = pricingData.sidePricing.filter(sp => sp.hasObjects);

  // Don't show pricing breakdown if no objects added
  if (sidesWithObjects.length === 0) {
    return null;
  }

  const getPrintSizeLabel = (size: string) => {
    const labels: Record<string, string> = {
      '10x10': '10x10cm',
      'A4': 'A4',
      'A3': 'A3'
    };
    return labels[size] || size;
  };

  const getObjectTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'image': '이미지',
      'i-text': '텍스트',
      'text': '텍스트',
      'rect': '사각형',
      'circle': '원형'
    };
    return labels[type] || '오브젝트';
  };

  return (
    <div className="w-full border-t border-gray-200 pt-3 mt-3">
      <div className="flex flex-col gap-2">
        {/* Price Breakdown Header */}
        <div className="flex items-center justify-between">
          <p className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-gray-700`}>가격 상세</p>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            {isExpanded ? (
              <>
                접기 <ChevronUp className="size-3" />
              </>
            ) : (
              <>
                상세보기 <ChevronDown className="size-3" />
              </>
            )}
          </button>
        </div>

        {/* Base Price */}
        <div className={`flex justify-between ${compact ? 'text-[11px]' : 'text-sm'}`}>
          <span className="text-gray-600">기본 가격</span>
          <span className="text-gray-900">{basePrice.toLocaleString('ko-KR')}원</span>
        </div>

        {/* Additional Prices per Side - Collapsed View */}
        {!isExpanded && sidesWithObjects.map((sidePricing: SidePricing) => (
          <div key={sidePricing.sideId} className={`flex justify-between ${compact ? 'text-[11px]' : 'text-sm'}`}>
            <span className="text-gray-600">
              {sidePricing.sideName} 인쇄 ({sidePricing.objects.length}개)
            </span>
            <span className="text-gray-900">
              +{sidePricing.totalPrice.toLocaleString('ko-KR')}원
            </span>
          </div>
        ))}

        {/* Expanded View - Per Object Breakdown */}
        {isExpanded && sidesWithObjects.map((sidePricing: SidePricing) => (
          <div key={sidePricing.sideId} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
            <div className={`flex justify-between ${compact ? 'text-[11px]' : 'text-sm'} font-medium mb-2`}>
              <span className="text-gray-700">{sidePricing.sideName}</span>
              <span className="text-gray-900">
                +{sidePricing.totalPrice.toLocaleString('ko-KR')}원
              </span>
            </div>

            {/* Object-level breakdown */}
            <div className="space-y-2 pl-2 border-l-2 border-gray-200">
              {sidePricing.objects.map((obj: ObjectPricing, idx: number) => (
                <div key={obj.objectId} className="text-xs">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <span className="font-medium text-gray-700">
                        {getObjectTypeLabel(obj.objectType)} {idx + 1}
                      </span>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-gray-500">
                        <span>{getPrintMethodShortName(obj.printMethod)}</span>
                        <span>{getPrintSizeLabel(obj.printSize)}</span>
                        <span>{obj.colorCount}색</span>
                        <span>
                          {obj.dimensionsMm.width.toFixed(0)}×{obj.dimensionsMm.height.toFixed(0)}mm
                        </span>
                      </div>
                    </div>
                    <span className="font-medium text-gray-900 ml-2">
                      {obj.price.toLocaleString('ko-KR')}원
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Divider */}
        <div className="border-t border-gray-200 my-1"></div>

        {/* Print Cost Total */}
        {pricingData.totalAdditionalPrice > 0 && (
          <div className={`flex justify-between ${compact ? 'text-[11px]' : 'text-sm'}`}>
            <span className="text-gray-600">
              인쇄비 합계 ({pricingData.totalObjectCount}개)
            </span>
            <span className="text-green-600 font-medium">
              +{pricingData.totalAdditionalPrice.toLocaleString('ko-KR')}원
            </span>
          </div>
        )}

        {/* Total Price */}
        <div className={`flex justify-between ${compact ? 'text-xs' : 'text-base'} font-bold pt-1`}>
          <span className="text-gray-900">총 가격</span>
          <span className="text-black">{totalPrice.toLocaleString('ko-KR')}원</span>
        </div>

        {/* Per Item Note */}
        <p className="text-xs text-gray-500">* 1개당 가격입니다</p>

        {/* Bulk Order Note for screen_printing/embroidery/applique */}
        {sidesWithObjects.some(side =>
          side.objects.some(obj =>
            ['screen_printing', 'embroidery', 'applique'].includes(obj.printMethod)
          )
        ) && (
          <p className="text-xs text-amber-600 mt-1">
            * 나염/자수/아플리케는 대량 주문 시 가격이 달라질 수 있습니다
          </p>
        )}
      </div>
    </div>
  );
}
