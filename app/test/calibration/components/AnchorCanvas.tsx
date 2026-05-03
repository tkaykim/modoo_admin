'use client';

import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import type { AnchorPlacement, MockupCalibration, CustomAnchorDef } from '../lib/types';
import { getAnchorLabel } from '../lib/types';
import { activeNativeMmPerPx } from '../lib/calibrationMath';

interface Props {
  mockup: MockupCalibration;
  anchors: AnchorPlacement[];
  containerWidth: number;
  selectedAnchorId: string | null;
  onCanvasClick: (xMm: number, yMm: number) => void;
  customAnchors?: CustomAnchorDef[];
}

const SYSTEM_FLAG = '__calibTestSystem' as const;

interface SystemFabricObject extends fabric.FabricObject {
  [SYSTEM_FLAG]?: boolean;
}

export function AnchorCanvas({
  mockup,
  anchors,
  containerWidth,
  selectedAnchorId,
  onCanvasClick,
  customAnchors = [],
}: Props) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const [hoverMm, setHoverMm] = useState<{ xMm: number; yMm: number } | null>(null);

  const mmPerPx = activeNativeMmPerPx(mockup);
  const displayScale =
    mockup.imageNativeWidthPx > 0
      ? Math.min(containerWidth / mockup.imageNativeWidthPx, 1.5)
      : 1;
  const canvasWidth = mockup.imageNativeWidthPx * displayScale || containerWidth;
  const canvasHeight = mockup.imageNativeHeightPx * displayScale || 400;

  useEffect(() => {
    if (!canvasElRef.current) return;
    if (fabricCanvasRef.current) return;
    const canvas = new fabric.Canvas(canvasElRef.current, {
      backgroundColor: '#f8fafc',
      selection: false,
      preserveObjectStacking: true,
    });
    fabricCanvasRef.current = canvas;
    return () => {
      try {
        canvas.dispose();
      } catch (e) {
        console.error('[CALIB-TEST] dispose failed', e);
      }
      fabricCanvasRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight });
    canvas.requestRenderAll();
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.getObjects().forEach((obj) => {
      const sysObj = obj as SystemFabricObject;
      if (sysObj[SYSTEM_FLAG]) canvas.remove(obj);
    });

    if (!mockup.mockupDataUrl) {
      canvas.requestRenderAll();
      return;
    }

    let cancelled = false;
    fabric.FabricImage.fromURL(mockup.mockupDataUrl, { crossOrigin: 'anonymous' }).then(
      (img) => {
        if (cancelled || !fabricCanvasRef.current) return;
        const sysImg = img as SystemFabricObject;
        sysImg[SYSTEM_FLAG] = true;
        img.set({
          left: 0,
          top: 0,
          originX: 'left',
          originY: 'top',
          scaleX: displayScale,
          scaleY: displayScale,
          selectable: false,
          evented: false,
        });
        canvas.add(img);
        canvas.sendObjectToBack(img);
        drawAnchors(canvas, anchors, mockup, displayScale, selectedAnchorId, customAnchors);
        canvas.requestRenderAll();
      },
    );

    return () => {
      cancelled = true;
    };
  }, [mockup, displayScale, anchors, selectedAnchorId]);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mockup.mockupDataUrl || !mmPerPx) {
      setHoverMm(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = (e.clientX - rect.left) / displayScale;
    const yPx = (e.clientY - rect.top) / displayScale;
    setHoverMm({ xMm: xPx * mmPerPx, yMm: yPx * mmPerPx });
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mockup.mockupDataUrl || !mmPerPx) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = (e.clientX - rect.left) / displayScale;
    const yPx = (e.clientY - rect.top) / displayScale;
    onCanvasClick(xPx * mmPerPx, yPx * mmPerPx);
  };

  return (
    <div className="border border-gray-300 rounded bg-white inline-block">
      <div
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverMm(null)}
        onClick={handleClick}
        style={{ cursor: mockup.mockupDataUrl && mmPerPx ? 'crosshair' : 'default' }}
      >
        <canvas ref={canvasElRef} />
      </div>
      {!mockup.mockupDataUrl && (
        <div className="p-4 text-sm text-gray-500">먼저 ① 캘리브 탭에서 mockup을 업로드하세요.</div>
      )}
      {mockup.mockupDataUrl && !mmPerPx && (
        <div className="p-3 text-sm text-orange-700 bg-orange-50 border-t">
          ⚠ 환산비가 없습니다. ① 캘리브 탭에서 기준 선분을 먼저 저장하세요.
        </div>
      )}
      {hoverMm && (
        <div className="px-2 py-1 text-xs text-gray-700 bg-gray-50 border-t font-mono">
          x={hoverMm.xMm.toFixed(1)}mm y={hoverMm.yMm.toFixed(1)}mm
          {selectedAnchorId && (
            <span className="ml-2 text-blue-700">
              → 클릭 시 [{getAnchorLabel(selectedAnchorId, customAnchors)}] 위치 저장
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function drawAnchors(
  canvas: fabric.Canvas,
  anchors: AnchorPlacement[],
  mockup: MockupCalibration,
  displayScale: number,
  selectedAnchorId: string | null,
  customAnchors: CustomAnchorDef[] = [],
) {
  const mmPerPx = activeNativeMmPerPx(mockup);
  if (!mmPerPx) return;

  anchors.forEach((a) => {
    const xPxNative = a.xMm / mmPerPx;
    const yPxNative = a.yMm / mmPerPx;
    const wPxNative = a.recommendedWidthMm / mmPerPx;
    const hPxNative = a.recommendedHeightMm / mmPerPx;
    const isSelected = a.id === selectedAnchorId;
    const color = isSelected ? '#2563eb' : '#16a34a';

    const rect = new fabric.Rect({
      left: (xPxNative - wPxNative / 2) * displayScale,
      top: (yPxNative - hPxNative / 2) * displayScale,
      originX: 'left',
      originY: 'top',
      width: wPxNative * displayScale,
      height: hPxNative * displayScale,
      fill: 'transparent',
      stroke: color,
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
    });
    (rect as SystemFabricObject)[SYSTEM_FLAG] = true;
    canvas.add(rect);

    const dot = new fabric.Circle({
      left: xPxNative * displayScale - 5,
      top: yPxNative * displayScale - 5,
      originX: 'left',
      originY: 'top',
      radius: 5,
      fill: color,
      selectable: false,
      evented: false,
    });
    (dot as SystemFabricObject)[SYSTEM_FLAG] = true;
    canvas.add(dot);

    const label = `${getAnchorLabel(a.id, customAnchors)} · ${a.recommendedWidthMm}×${a.recommendedHeightMm}mm`;
    const text = new fabric.FabricText(label, {
      left: xPxNative * displayScale + 8,
      top: yPxNative * displayScale - 18,
      originX: 'left',
      originY: 'top',
      fontSize: 12,
      fill: color,
      backgroundColor: 'rgba(255,255,255,0.9)',
      selectable: false,
      evented: false,
    });
    (text as SystemFabricObject)[SYSTEM_FLAG] = true;
    canvas.add(text);
  });
}
