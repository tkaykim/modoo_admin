'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export interface SelectedColor {
  id: string;
  hex: string;
  name: string;
  color_code: string;
}

interface ManufacturerColor {
  id: string;
  name: string;
  hex: string;
  color_code: string;
  label: string | null;
}

interface ProductColor {
  id: string;
  manufacturer_color_id: string;
  is_active: boolean;
  manufacturer_colors: ManufacturerColor;
}

interface ColorSelectorProps {
  productId: string;
  selectedColorId: string | null;
  onColorSelect: (color: SelectedColor | null) => void;
}

export default function ColorSelector({
  productId,
  selectedColorId,
  onColorSelect,
}: ColorSelectorProps) {
  const [colors, setColors] = useState<ProductColor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchColors = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/admin/product-colors?product_id=${productId}`);
        if (response.ok) {
          const result = await response.json();
          const activeColors = (result.data || []).filter(
            (c: ProductColor) => c.is_active && c.manufacturer_colors
          );
          setColors(activeColors);

          // Auto-select the first color if none is selected
          if (!selectedColorId && activeColors.length > 0) {
            const mc = activeColors[0].manufacturer_colors;
            onColorSelect({
              id: mc.id,
              hex: mc.hex,
              name: mc.name,
              color_code: mc.color_code,
            });
          }
        }
      } catch (err) {
        console.error('Error fetching product colors:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchColors();
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-xs text-gray-400">색상 불러오는 중...</span>
      </div>
    );
  }

  if (colors.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-1">사용 가능한 색상이 없습니다.</p>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto p-1">
      {colors.map((pc) => {
        const mc = pc.manufacturer_colors;
        const isSelected = selectedColorId === mc.id;
        return (
          <button
            key={pc.id}
            type="button"
            onClick={() => {
              if (isSelected) {
                onColorSelect(null);
              } else {
                onColorSelect({
                  id: mc.id,
                  hex: mc.hex,
                  name: mc.name,
                  color_code: mc.color_code,
                });
              }
            }}
            className={`flex flex-col items-center gap-1 shrink-0 p-1.5 rounded-lg transition-colors ${
              isSelected ? 'bg-blue-50 ring-2 ring-blue-500' : 'hover:bg-gray-50'
            }`}
            title={`${mc.name} (${mc.color_code})`}
          >
            <span
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 ${
                isSelected ? 'border-blue-500' : 'border-gray-200'
              }`}
              style={{ backgroundColor: mc.hex }}
            />
            <span className="text-[10px] sm:text-xs text-gray-600 max-w-[48px] truncate">
              {mc.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
