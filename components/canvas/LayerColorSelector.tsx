'use client'
import React, { useRef } from 'react';
import { ProductLayer } from '@/types/types';
import { useCanvasStore } from '@/store/useCanvasStore';
import { Plus } from 'lucide-react';

interface LayerColorSelectorProps {
  sideId: string;
  layers: ProductLayer[];
  compact?: boolean;
}

const LayerColorSelector: React.FC<LayerColorSelectorProps> = ({ sideId, layers, compact = false }) => {
  const { layerColors, setLayerColor } = useCanvasStore();
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Sort layers by zIndex for consistent display
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  const handleColorChange = (layerId: string, color: string) => {
    setLayerColor(sideId, layerId, color);
  };

  const handlePickerClick = (layerId: string) => {
    colorInputRefs.current[layerId]?.click();
  };

  return (
    <div className={`w-full bg-white rounded-lg shadow-sm border border-gray-200 ${compact ? 'p-2.5' : 'p-4'}`}>
      <h3 className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-gray-700 ${compact ? 'mb-2' : 'mb-3'}`}>Product Colors</h3>
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {sortedLayers.map((layer) => {
          const currentColor = layerColors[sideId]?.[layer.id] || layer.colorOptions[0]?.hex || '#FFFFFF';

          return (
            <div key={layer.id} className="space-y-2">
              <label className="text-xs font-medium text-gray-600">
                {layer.name}
              </label>
              <div className="flex gap-2 flex-wrap items-center">
                {layer.colorOptions.map((color) => (
                  <button
                    key={`${layer.id}-${color.hex}`}
                    onClick={() => handleColorChange(layer.id, color.hex)}
                    className={`
                      ${compact ? 'w-7 h-7' : 'w-10 h-10'} rounded-full border-2 transition-all duration-200
                      ${currentColor === color.hex
                        ? 'border-blue-500 scale-110 shadow-md'
                        : 'border-gray-300 hover:border-gray-400 hover:scale-105'
                      }
                    `}
                    style={{ backgroundColor: color.hex }}
                    aria-label={`Select ${color.colorCode || color.hex} for ${layer.name}`}
                  >
                    {currentColor === color.hex && (
                      <svg
                        className="w-full h-full p-2"
                        fill="none"
                        stroke={getContrastColor(color.hex)}
                        strokeWidth="3"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                ))}
                {/* Custom color picker */}
                <button
                  onClick={() => handlePickerClick(layer.id)}
                  className={`
                    ${compact ? 'w-7 h-7' : 'w-10 h-10'} rounded-full border-2 border-dashed border-gray-300
                    hover:border-gray-400 hover:scale-105 transition-all duration-200
                    flex items-center justify-center bg-gray-50
                  `}
                  aria-label={`Pick custom color for ${layer.name}`}
                >
                  <Plus className={compact ? 'w-3 h-3' : 'w-4 h-4'} strokeWidth={2} color="#9ca3af" />
                </button>
                <input
                  ref={(el) => { colorInputRefs.current[layer.id] = el; }}
                  type="color"
                  value={currentColor}
                  onChange={(e) => handleColorChange(layer.id, e.target.value)}
                  className="sr-only"
                  aria-label={`Color picker for ${layer.name}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Helper function to determine if we should use white or black for the checkmark
function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');

  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return white for dark colors, black for light colors
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

export default LayerColorSelector;
