'use client';

import { useState } from 'react';
import { Palette, Save } from 'lucide-react';
import { Product, ProductSide, ProductColor, ManufacturerColor } from '@/types/types';
import { useCanvasStore } from '@/store/useCanvasStore';
import TextStylePanel from '@/components/canvas/TextStylePanel';
import LayerColorSelector from '@/components/canvas/LayerColorSelector';

import PricingInfo from '@/components/canvas/PricingInfo';
import { isCurvedText } from '@/lib/curvedText';
import * as fabric from 'fabric';

interface OrderEditPanelProps {
  product: Product;
  productColors: ProductColor[];
  selectedTextObject: fabric.FabricObject | null;
  onSave: () => void;
  isSaving: boolean;
}

export default function OrderEditPanel({
  product,
  productColors,
  selectedTextObject,
  onSave,
  isSaving,
}: OrderEditPanelProps) {
  const {
    activeSideId,
    productColor,
    setProductColor,
    incrementCanvasVersion,
  } = useCanvasStore();

  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

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

      {/* Pricing */}
      <div className="p-2.5 border-b">
        <PricingInfo basePrice={product.base_price} sides={sides} compact />
      </div>

      {/* Save button */}
      <div className="p-2.5 mt-auto">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="w-full py-2 bg-green-600 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              저장 중...
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              저장
            </>
          )}
        </button>
      </div>
    </>
  );
}
