'use client'

import { useCanvasStore } from "@/store/useCanvasStore";
import { useEffect, useState } from "react";
import { Settings } from "lucide-react";

interface ColorInfoProps {
  className?: string;
}

export default function ColorInfo({ className = "" }: ColorInfoProps) {
  const { canvasMap, canvasVersion } = useCanvasStore();
  const [colorData, setColorData] = useState<{ colors: string[]; count: number }>({ colors: [], count: 0 });
  const [sensitivity, setSensitivity] = useState(30); // Default sensitivity: 30
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Extract colors when canvas changes or sensitivity changes
  useEffect(() => {
    const extractColors = async () => {
      setIsLoading(true);
      try {
        const { getCanvasColors } = useCanvasStore.getState();
        const data = await getCanvasColors(sensitivity);
        setColorData(data);
      } catch (error) {
        console.error('Failed to extract colors:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Only extract if there are canvases
    if (Object.keys(canvasMap).length > 0) {
      extractColors();
    }
  }, [canvasMap, canvasVersion, sensitivity]);

  if (colorData.count === 0 && !isLoading) {
    return null;
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">디자인 색상</h3>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {isLoading ? '...' : `${colorData.count}개`}
          </span>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-1 hover:bg-gray-100 rounded transition"
          title="색상 감도 설정"
        >
          <Settings className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Sensitivity Settings */}
      {showSettings && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">
              색상 병합 감도
            </label>
            <span className="text-xs text-gray-500 font-mono">
              {sensitivity}
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />

          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-500">더 민감 (더 많은 색상)</span>
            <span className="text-xs text-gray-500">덜 민감 (더 적은 색상)</span>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            유사한 색상을 하나로 병합하는 정도를 조절합니다.
          </p>
        </div>
      )}

      {/* Color Display */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="text-xs text-gray-500">색상 추출 중...</div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {colorData.colors.map((color, index) => (
            <div
              key={`${color}-${index}`}
              className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 hover:shadow-sm transition"
            >
              <div
                className="w-6 h-6 rounded-md border border-gray-300 shadow-sm"
                style={{ backgroundColor: color }}
                title={color}
              />
              <span className="text-xs font-mono text-gray-600">{color}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
