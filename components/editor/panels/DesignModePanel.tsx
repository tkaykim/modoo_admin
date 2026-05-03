'use client';

import { useState } from 'react';
import { Palette, ArrowRight, Send, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Product, ProductSide, ProductColor, ManufacturerColor } from '@/types/types';
import { useCanvasStore } from '@/store/useCanvasStore';
import TextStylePanel from '@/components/canvas/TextStylePanel';
import LayerColorSelector from '@/components/canvas/LayerColorSelector';

import PricingInfo from '@/components/canvas/PricingInfo';
import { isCurvedText } from '@/lib/curvedText';
import * as fabric from 'fabric';

interface DesignModePanelProps {
  product: Product;
  productColors: ProductColor[];
  designTitle: string;
  onDesignTitleChange: (title: string) => void;
  selectedTextObject: fabric.FabricObject | null;
  onSave: () => void;
  isSaving: boolean;
  cobuyRequestId?: string;
  designSaved?: boolean;
  cobuyQuantity?: number | null;
}

export default function DesignModePanel({
  product,
  productColors,
  designTitle,
  onDesignTitleChange,
  selectedTextObject,
  onSave,
  isSaving,
  cobuyRequestId,
  designSaved,
  cobuyQuantity,
}: DesignModePanelProps) {
  const router = useRouter();
  const {
    activeSideId,
    productColor,
    setProductColor,
    incrementCanvasVersion,
  } = useCanvasStore();

  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [isSendingDesign, setIsSendingDesign] = useState(false);
  const [designSent, setDesignSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const sides: ProductSide[] = product.configuration || [];
  const currentSide = sides.find((s) => s.id === activeSideId) || sides[0];
  const hasLayers = currentSide?.layers && currentSide.layers.length > 0;

  const isTextSelected = selectedTextObject && (
    selectedTextObject.type === 'i-text' ||
    selectedTextObject.type === 'text' ||
    isCurvedText(selectedTextObject)
  );

  const handleColorSelect = (color: ManufacturerColor) => {
    setProductColor(color.hex);
    incrementCanvasVersion();
    setIsColorPickerOpen(false);
  };

  const handleSendDesign = async () => {
    const price = Number(priceInput.replace(/,/g, ''));
    if (!price || price <= 0 || !cobuyRequestId) return;

    setIsSendingDesign(true);
    setSendError(null);
    try {
      const res = await fetch('/api/admin/cobuy/requests/send-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: cobuyRequestId, pricePerItem: price }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '발송 실패');
      }
      setDesignSent(true);
      setTimeout(() => router.back(), 1500);
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setIsSendingDesign(false);
    }
  };

  return (
    <>
      {/* Text Style Panel */}
      {isTextSelected && (
        <div className="p-2.5 border-b">
          <TextStylePanel
            selectedObject={selectedTextObject as fabric.IText}
            onClose={() => {}}
            variant="desktop"
            compact
          />
        </div>
      )}

      {/* Product Color */}
      <div className="p-2.5 border-b">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">제품 색상</h3>
        {hasLayers && currentSide?.layers ? (
          <LayerColorSelector sideId={activeSideId || ''} layers={currentSide.layers} compact />
        ) : (
          <div className="relative">
            <button
              onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
              className="w-full p-2 border rounded flex items-center gap-2 hover:bg-gray-50 text-xs"
            >
              <div
                className="w-5 h-5 rounded-full border border-gray-300"
                style={{ backgroundColor: productColor }}
              />
              <span className="text-gray-700 truncate">
                {productColors.find(pc => pc.manufacturer_colors?.hex === productColor)?.manufacturer_colors?.name || '색상 선택'}
              </span>
              <Palette className="w-3 h-3 text-gray-400 ml-auto" />
            </button>

            {isColorPickerOpen && productColors.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow-lg z-10 p-2 max-h-48 overflow-auto">
                <div className="grid grid-cols-6 gap-1.5">
                  {productColors.map((pc) => {
                    const color = pc.manufacturer_colors;
                    if (!color) return null;
                    return (
                      <button
                        key={pc.id}
                        onClick={() => handleColorSelect(color)}
                        className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                          productColor === color.hex ? 'border-blue-500 ring-1 ring-blue-200' : 'border-gray-200'
                        }`}
                        style={{ backgroundColor: color.hex }}
                        title={color.name}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Design Title */}
      <div className="p-2.5 border-b">
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">디자인 제목</h3>
        <input
          type="text"
          value={designTitle}
          onChange={(e) => onDesignTitleChange(e.target.value)}
          placeholder="디자인 제목 입력"
          className="w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Pricing (hide for CoBuy) */}
      {!cobuyRequestId && (
        <div className="p-2.5 border-b">
          <PricingInfo basePrice={product.base_price} sides={sides} compact />
        </div>
      )}

      {/* CoBuy: Quantity + Price + Send */}
      {cobuyRequestId && (
        <div className={`p-2.5 border-b ${designSaved ? 'bg-green-50' : ''}`}>
          {designSaved && (
            <p className="text-[11px] font-semibold text-green-700 mb-2">디자인 저장 완료</p>
          )}
          {cobuyQuantity && (
            <div className="mb-2">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">수량</h3>
              <p className="text-sm font-medium text-gray-900">{cobuyQuantity}벌</p>
            </div>
          )}
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">벌당 단가</h3>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value.replace(/[^0-9,]/g, ''))}
              placeholder="단가 입력 (원)"
              className="flex-1 px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleSendDesign}
              disabled={isSendingDesign || !priceInput || !designSaved}
              title={!designSaved ? '디자인을 먼저 저장해주세요' : ''}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium flex items-center gap-1 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSendingDesign ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              발송
            </button>
          </div>
          {priceInput && cobuyQuantity && (
            <p className="text-[11px] text-gray-500 mt-1.5">
              합계: <span className="font-medium text-gray-800">{(Number(priceInput.replace(/,/g, '')) * cobuyQuantity).toLocaleString('ko-KR')}원</span>
            </p>
          )}
          {!designSaved && (
            <p className="text-[10px] text-gray-400 mt-1">디자인 저장 후 발송 가능합니다</p>
          )}
          {sendError && <p className="text-[10px] text-red-500 mt-1">{sendError}</p>}
        </div>
      )}

      {/* Design sent confirmation */}
      {designSent && (
        <div className="p-2.5 border-b bg-green-50">
          <div className="flex items-center gap-1.5 text-green-700">
            <Check className="w-4 h-4" />
            <p className="text-xs font-medium">견적 이메일이 발송되었습니다.</p>
          </div>
        </div>
      )}

      {/* Save / Back button */}
      <div className="p-2.5 mt-auto">
        {cobuyRequestId && designSaved ? (
          <button
            onClick={() => router.back()}
            className="w-full py-2 bg-gray-600 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-gray-700 transition-colors"
          >
            목록으로 돌아가기
          </button>
        ) : (
          <button
            onClick={onSave}
            disabled={isSaving || !designTitle.trim()}
            className="w-full py-2 bg-blue-600 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <ArrowRight className="w-3.5 h-3.5" />
                다음 단계로
              </>
            )}
          </button>
        )}
      </div>
    </>
  );
}
