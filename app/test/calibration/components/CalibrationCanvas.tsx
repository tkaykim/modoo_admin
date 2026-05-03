'use client';

import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import type { CalibrationLine, MockupCalibration } from '../lib/types';
import { activeLine, nativeMmPerPx } from '../lib/calibrationMath';

interface Props {
  mockup: MockupCalibration;
  containerWidth: number;
  onLineDrawn: (p1: { xPx: number; yPx: number }, p2: { xPx: number; yPx: number }) => void;
}

const SYSTEM_FLAG = '__calibTestSystem' as const;

interface SystemFabricObject extends fabric.FabricObject {
  [SYSTEM_FLAG]?: boolean;
}

export function CalibrationCanvas({ mockup, containerWidth, onLineDrawn }: Props) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const [draftPoint, setDraftPoint] = useState<{ xPx: number; yPx: number } | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ xPx: number; yPx: number } | null>(null);

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
        drawCalibrationOverlay(canvas, mockup, displayScale);
        canvas.requestRenderAll();
      },
    );

    return () => {
      cancelled = true;
    };
  }, [mockup, displayScale]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    drawDraftOverlay(canvas, displayScale, draftPoint, hoverPoint);
  }, [draftPoint, hoverPoint, displayScale]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mockup.mockupDataUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / displayScale;
    const y = (e.clientY - rect.top) / displayScale;
    setHoverPoint({ xPx: x, yPx: y });
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mockup.mockupDataUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / displayScale;
    const y = (e.clientY - rect.top) / displayScale;
    if (!draftPoint) {
      setDraftPoint({ xPx: x, yPx: y });
    } else {
      onLineDrawn(draftPoint, { xPx: x, yPx: y });
      setDraftPoint(null);
      setHoverPoint(null);
    }
  };

  return (
    <div className="border border-gray-300 rounded bg-white inline-block">
      <div
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverPoint(null)}
        onClick={handleClick}
        style={{ cursor: mockup.mockupDataUrl ? 'crosshair' : 'default' }}
      >
        <canvas ref={canvasElRef} />
      </div>
      {!mockup.mockupDataUrl && (
        <div className="p-4 text-sm text-gray-500">mockup 이미지를 업로드해주세요.</div>
      )}
      {draftPoint && (
        <div className="px-2 py-1 text-xs text-blue-700 bg-blue-50 border-t">
          첫 점 선택됨 ({draftPoint.xPx.toFixed(0)}px, {draftPoint.yPx.toFixed(0)}px). 두 번째 점을 클릭하세요.
        </div>
      )}
    </div>
  );
}

function drawCalibrationOverlay(
  canvas: fabric.Canvas,
  mockup: MockupCalibration,
  scale: number,
) {
  const active = activeLine(mockup);
  mockup.lines.forEach((line) => {
    const isActive = active?.id === line.id;
    drawLine(canvas, line, scale, isActive);
  });
}

function drawLine(
  canvas: fabric.Canvas,
  line: CalibrationLine,
  scale: number,
  isActive: boolean,
) {
  const color = isActive ? '#16a34a' : '#9ca3af';
  const widthPx = isActive ? 3 : 2;

  const polyline = new fabric.Line(
    [line.p1.xPx * scale, line.p1.yPx * scale, line.p2.xPx * scale, line.p2.yPx * scale],
    { stroke: color, strokeWidth: widthPx, selectable: false, evented: false },
  );
  (polyline as SystemFabricObject)[SYSTEM_FLAG] = true;
  canvas.add(polyline);

  [line.p1, line.p2].forEach((pt) => {
    const dot = new fabric.Circle({
      left: pt.xPx * scale - 5,
      top: pt.yPx * scale - 5,
      radius: 5,
      fill: color,
      selectable: false,
      evented: false,
    });
    (dot as SystemFabricObject)[SYSTEM_FLAG] = true;
    canvas.add(dot);
  });

  const ratio = nativeMmPerPx(line);
  const label = isActive
    ? `${line.label} · ${line.measuredMm}mm · ${ratio.toFixed(3)}mm/px`
    : line.label;
  const text = new fabric.FabricText(label, {
    left: ((line.p1.xPx + line.p2.xPx) / 2) * scale + 8,
    top: ((line.p1.yPx + line.p2.yPx) / 2) * scale - 8,
    fontSize: 12,
    fill: color,
    backgroundColor: 'rgba(255,255,255,0.85)',
    selectable: false,
    evented: false,
  });
  (text as SystemFabricObject)[SYSTEM_FLAG] = true;
  canvas.add(text);
}

function drawDraftOverlay(
  canvas: fabric.Canvas,
  scale: number,
  draftPoint: { xPx: number; yPx: number } | null,
  hoverPoint: { xPx: number; yPx: number } | null,
) {
  canvas.getObjects().forEach((obj) => {
    const sysObj = obj as SystemFabricObject & { __isDraft?: boolean };
    if (sysObj.__isDraft) canvas.remove(obj);
  });

  if (!draftPoint) {
    canvas.requestRenderAll();
    return;
  }

  const dot = new fabric.Circle({
    left: draftPoint.xPx * scale - 5,
    top: draftPoint.yPx * scale - 5,
    radius: 5,
    fill: '#2563eb',
    selectable: false,
    evented: false,
  });
  (dot as SystemFabricObject & { __isDraft?: boolean })[SYSTEM_FLAG] = true;
  (dot as SystemFabricObject & { __isDraft?: boolean }).__isDraft = true;
  canvas.add(dot);

  if (hoverPoint) {
    const guide = new fabric.Line(
      [
        draftPoint.xPx * scale,
        draftPoint.yPx * scale,
        hoverPoint.xPx * scale,
        hoverPoint.yPx * scale,
      ],
      {
        stroke: '#2563eb',
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
      },
    );
    (guide as SystemFabricObject & { __isDraft?: boolean })[SYSTEM_FLAG] = true;
    (guide as SystemFabricObject & { __isDraft?: boolean }).__isDraft = true;
    canvas.add(guide);
  }
  canvas.requestRenderAll();
}
