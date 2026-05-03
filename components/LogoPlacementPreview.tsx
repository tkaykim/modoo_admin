'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { RotateCcw, Move } from 'lucide-react';
import { ProductSide, LogoPlacement } from '@/types/types';
import SingleSideCanvas from '@/components/canvas/SingleSideCanvas';

interface LogoPlacementPreviewProps {
  sides: ProductSide[];
  placement: LogoPlacement | null;
  onPlacementChange: (placement: LogoPlacement) => void;
}

const DEFAULT_PLACEMENT: LogoPlacement = {
  x: 50,
  y: 50,
  width: 100,
  height: 100,
};

export default function LogoPlacementPreview({
  sides,
  placement,
  onPlacementChange,
}: LogoPlacementPreviewProps) {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const placeholderRef = useRef<fabric.Rect | null>(null);
  const scaleRef = useRef<number>(1);

  const [isCanvasReady, setIsCanvasReady] = useState(false);

  const canvasWidth = 400;
  const canvasHeight = 500;

  const frontSide = sides.length > 0 ? sides[0] : null;

  const currentX = placement?.x ?? DEFAULT_PLACEMENT.x;
  const currentY = placement?.y ?? DEFAULT_PLACEMENT.y;
  const currentWidth = placement?.width ?? DEFAULT_PLACEMENT.width;
  const currentHeight = placement?.height ?? DEFAULT_PLACEMENT.height;

  // Helper to get print area offset from canvas
  const getPrintAreaOffset = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { left: 0, top: 0 };
    // @ts-expect-error - Custom property set by SingleSideCanvas
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property set by SingleSideCanvas
    const printAreaTop = canvas.printAreaTop || 0;
    return { left: printAreaLeft, top: printAreaTop };
  }, []);

  // Read placement from canvas, converting to print-area-relative unscaled coordinates
  const updatePlacementFromCanvas = useCallback(() => {
    if (!placeholderRef.current || !canvasRef.current) return;

    const ph = placeholderRef.current;
    const canvasScale = scaleRef.current;
    const { left: printAreaLeft, top: printAreaTop } = getPrintAreaOffset();

    const scaledW = (ph.width || 100) * (ph.scaleX || 1);
    const scaledH = (ph.height || 100) * (ph.scaleY || 1);

    onPlacementChange({
      x: Math.round(((ph.left || 0) - printAreaLeft) / canvasScale),
      y: Math.round(((ph.top || 0) - printAreaTop) / canvasScale),
      width: Math.round(scaledW / canvasScale),
      height: Math.round(scaledH / canvasScale),
    });
  }, [onPlacementChange, getPrintAreaOffset]);

  // Sync placeholder rect from external values (print-area-relative unscaled)
  const syncPlaceholderFromValues = useCallback((x: number, y: number, w: number, h: number) => {
    if (!placeholderRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ph = placeholderRef.current;
    const canvasScale = scaleRef.current;
    const { left: printAreaLeft, top: printAreaTop } = getPrintAreaOffset();

    ph.set({
      left: printAreaLeft + x * canvasScale,
      top: printAreaTop + y * canvasScale,
      width: w * canvasScale,
      height: h * canvasScale,
      scaleX: 1,
      scaleY: 1,
    });

    canvas.renderAll();
  }, [getPrintAreaOffset]);

  const handleCanvasReady = useCallback((canvas: fabric.Canvas, _sideId: string, canvasScale: number) => {
    if (!frontSide) return;

    canvasRef.current = canvas;
    scaleRef.current = canvasScale;

    // @ts-expect-error - Custom property set by SingleSideCanvas
    const printAreaLeft = canvas.printAreaLeft || 0;
    // @ts-expect-error - Custom property set by SingleSideCanvas
    const printAreaTop = canvas.printAreaTop || 0;

    const initialX = placement?.x ?? DEFAULT_PLACEMENT.x;
    const initialY = placement?.y ?? DEFAULT_PLACEMENT.y;
    const initialW = placement?.width ?? DEFAULT_PLACEMENT.width;
    const initialH = placement?.height ?? DEFAULT_PLACEMENT.height;

    const placeholder = new fabric.Rect({
      left: printAreaLeft + initialX * canvasScale,
      top: printAreaTop + initialY * canvasScale,
      width: initialW * canvasScale,
      height: initialH * canvasScale,
      fill: 'rgba(59, 130, 246, 0.15)',
      stroke: '#3B82F6',
      strokeWidth: 2,
      strokeDashArray: [6, 3],
      rx: 4,
      ry: 4,
      selectable: true,
      hasControls: true,
      hasBorders: true,
      lockRotation: true,
      cornerColor: '#3B82F6',
      cornerStrokeColor: '#fff',
      cornerSize: 10,
      cornerStyle: 'circle',
      transparentCorners: false,
      data: { id: 'logo-placeholder' },
    });

    // Hide rotation control
    placeholder.setControlVisible('mtr', false);

    placeholderRef.current = placeholder;
    canvas.add(placeholder);
    canvas.setActiveObject(placeholder);

    // Update placement on move or scale
    canvas.on('object:modified', (e) => {
      const target = e.target as fabric.FabricObject & { data?: { id?: string } };
      if (target?.data?.id === 'logo-placeholder') {
        canvas.renderAll();
        updatePlacementFromCanvas();
      }
    });

    canvas.renderAll();
    setIsCanvasReady(true);
  }, [frontSide, placement, updatePlacementFromCanvas]);

  useEffect(() => {
    setIsCanvasReady(false);
    placeholderRef.current = null;
  }, [frontSide?.id]);

  const resetToDefault = () => {
    if (!frontSide) return;

    const newPlacement = { ...DEFAULT_PLACEMENT };
    onPlacementChange(newPlacement);

    if (isCanvasReady) {
      syncPlaceholderFromValues(newPlacement.x, newPlacement.y, newPlacement.width, newPlacement.height);
    }
  };

  if (!frontSide) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-md p-6 text-center">
        <p className="text-gray-500">면을 먼저 추가해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-gray-900">로고 배치 위치</h4>
          <p className="text-sm text-gray-500">앞면 기본 로고 배치 위치</p>
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-gray-200">
        <SingleSideCanvas
          key={frontSide.id}
          side={frontSide}
          width={canvasWidth}
          height={canvasHeight}
          isEdit={true}
          canvasState={{ objects: [] }}
          onCanvasReady={handleCanvasReady}
          showScaleBox={false}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Move className="w-4 h-4" />
        <span>사각형을 드래그하여 위치를, 모서리를 드래그하여 크기를 조정하세요</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">X 위치 (px)</label>
          <input
            type="number"
            value={currentX}
            onChange={(e) => {
              const x = Math.max(0, Math.min(canvasWidth, parseInt(e.target.value) || 0));
              onPlacementChange({ x, y: currentY, width: currentWidth, height: currentHeight });
              if (isCanvasReady) {
                syncPlaceholderFromValues(x, currentY, currentWidth, currentHeight);
              }
            }}
            min={0}
            max={canvasWidth}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Y 위치 (px)</label>
          <input
            type="number"
            value={currentY}
            onChange={(e) => {
              const y = Math.max(0, Math.min(canvasHeight, parseInt(e.target.value) || 0));
              onPlacementChange({ x: currentX, y, width: currentWidth, height: currentHeight });
              if (isCanvasReady) {
                syncPlaceholderFromValues(currentX, y, currentWidth, currentHeight);
              }
            }}
            min={0}
            max={canvasHeight}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">최대 너비 (px)</label>
          <input
            type="number"
            value={currentWidth}
            onChange={(e) => {
              const width = Math.max(1, parseInt(e.target.value) || DEFAULT_PLACEMENT.width);
              onPlacementChange({ x: currentX, y: currentY, width, height: currentHeight });
              if (isCanvasReady) {
                syncPlaceholderFromValues(currentX, currentY, width, currentHeight);
              }
            }}
            min={1}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">최대 높이 (px)</label>
          <input
            type="number"
            value={currentHeight}
            onChange={(e) => {
              const height = Math.max(1, parseInt(e.target.value) || DEFAULT_PLACEMENT.height);
              onPlacementChange({ x: currentX, y: currentY, width: currentWidth, height });
              if (isCanvasReady) {
                syncPlaceholderFromValues(currentX, currentY, currentWidth, height);
              }
            }}
            min={1}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={resetToDefault}
        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
      >
        <RotateCcw className="w-4 h-4" />
        기본 위치로 초기화
      </button>
    </div>
  );
}