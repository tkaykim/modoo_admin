'use client';

import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import type { AnchorPlacement, MockupCalibration, CustomAnchorDef } from '../lib/types';
import { getAnchorLabel } from '../lib/types';
import { activeNativeMmPerPx, A3_MAX_WIDTH_MM, A3_MAX_HEIGHT_MM } from '../lib/calibrationMath';

export interface ArtworkObject {
  id: string;
  dataUrl: string;
  /** mm in native coords */
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  angleDeg: number;
  /** natural aspect = naturalWidth / naturalHeight, used to preserve ratio on snap */
  naturalAspect: number;
  /** True when the dataUrl was alpha-trimmed on upload. */
  alphaTrimmed?: boolean;
  /** Original raster size before alpha trim (for UI display only). */
  originalRasterWh?: { w: number; h: number };
}

interface Props {
  mockup: MockupCalibration;
  containerWidth: number;
  artworks: ArtworkObject[];
  anchors: AnchorPlacement[];
  highlightedAnchorId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<ArtworkObject>) => void;
  customAnchors?: CustomAnchorDef[];
}

const SYSTEM_FLAG = '__calibTestSystem' as const;

interface SystemFabricObject extends fabric.FabricObject {
  [SYSTEM_FLAG]?: boolean;
  __artworkId?: string;
  __anchorIndicator?: { id: string; isHighlighted: boolean };
}

export function SimulatorCanvas({
  mockup,
  containerWidth,
  artworks,
  anchors,
  highlightedAnchorId,
  selectedId,
  onSelect,
  onUpdate,
  customAnchors = [],
}: Props) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const artworkObjectsRef = useRef<Map<string, fabric.FabricImage>>(new Map());
  const onSelectRef = useRef(onSelect);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onUpdateRef.current = onUpdate;
  }, [onSelect, onUpdate]);

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
      preserveObjectStacking: true,
    });
    fabricCanvasRef.current = canvas;

    const handleSelection = () => {
      const obj = canvas.getActiveObject() as SystemFabricObject | null;
      onSelectRef.current(obj?.__artworkId ?? null);
    };
    canvas.on('selection:created', handleSelection);
    canvas.on('selection:updated', handleSelection);
    canvas.on('selection:cleared', () => onSelectRef.current(null));

    canvas.on('object:modified', (e) => {
      const obj = e.target as SystemFabricObject | undefined;
      if (!obj?.__artworkId) return;
      const ds = displayScaleRef.current;
      const mp = mmPerPxRef.current;
      if (!ds || !mp) return;
      onUpdateRef.current(obj.__artworkId, {
        xMm: ((obj.left ?? 0) / ds) * mp,
        yMm: ((obj.top ?? 0) / ds) * mp,
        widthMm: (obj.getScaledWidth() / ds) * mp,
        heightMm: (obj.getScaledHeight() / ds) * mp,
        angleDeg: obj.angle ?? 0,
      });
    });

    return () => {
      try {
        canvas.dispose();
      } catch (e) {
        console.error('[CALIB-TEST] dispose failed', e);
      }
      fabricCanvasRef.current = null;
      artworkObjectsRef.current.clear();
    };
  }, []);

  const displayScaleRef = useRef(displayScale);
  const mmPerPxRef = useRef(mmPerPx);
  useEffect(() => {
    displayScaleRef.current = displayScale;
    mmPerPxRef.current = mmPerPx;
  }, [displayScale, mmPerPx]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight });
    canvas.requestRenderAll();
  }, [canvasWidth, canvasHeight]);

  // Mockup background
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
        canvas.requestRenderAll();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mockup.mockupDataUrl, mockup.imageNativeWidthPx, mockup.imageNativeHeightPx, displayScale]);

  // Draw anchor indicators (always visible so user knows snap targets)
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !mmPerPx) return;

    canvas.getObjects().forEach((obj) => {
      const sysObj = obj as SystemFabricObject;
      if (sysObj.__anchorIndicator) canvas.remove(obj);
    });

    const indicatorObjects: SystemFabricObject[] = [];

    anchors.forEach((a) => {
      const xPx = (a.xMm / mmPerPx) * displayScale;
      const yPx = (a.yMm / mmPerPx) * displayScale;
      const wPx = (a.recommendedWidthMm / mmPerPx) * displayScale;
      const hPx = (a.recommendedHeightMm / mmPerPx) * displayScale;
      const isHl = a.id === highlightedAnchorId;

      const rect = new fabric.Rect({
        left: xPx - wPx / 2,
        top: yPx - hPx / 2,
        originX: 'left',
        originY: 'top',
        width: wPx,
        height: hPx,
        fill: isHl ? 'rgba(37,99,235,0.18)' : 'rgba(34,197,94,0.06)',
        stroke: isHl ? '#2563eb' : '#22c55e',
        strokeWidth: isHl ? 2 : 1,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
        opacity: isHl ? 1 : 0.55,
      }) as SystemFabricObject;
      rect.__anchorIndicator = { id: a.id, isHighlighted: isHl };
      canvas.add(rect);
      indicatorObjects.push(rect);

      const dot = new fabric.Circle({
        left: xPx - 4,
        top: yPx - 4,
        originX: 'left',
        originY: 'top',
        radius: 4,
        fill: isHl ? '#2563eb' : '#22c55e',
        selectable: false,
        evented: false,
        opacity: isHl ? 1 : 0.7,
      }) as SystemFabricObject;
      dot.__anchorIndicator = { id: a.id, isHighlighted: isHl };
      canvas.add(dot);
      indicatorObjects.push(dot);

      const text = new fabric.FabricText(getAnchorLabel(a.id, customAnchors), {
        left: xPx + 6,
        top: yPx - 16,
        originX: 'left',
        originY: 'top',
        fontSize: 11,
        fill: isHl ? '#2563eb' : '#16a34a',
        backgroundColor: 'rgba(255,255,255,0.85)',
        selectable: false,
        evented: false,
        opacity: isHl ? 1 : 0.7,
      }) as SystemFabricObject;
      text.__anchorIndicator = { id: a.id, isHighlighted: isHl };
      canvas.add(text);
      indicatorObjects.push(text);
    });

    // keep artworks on top
    artworkObjectsRef.current.forEach((obj) => canvas.bringObjectToFront(obj));
    canvas.requestRenderAll();

    if (!highlightedAnchorId) return;

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 600;
      const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      indicatorObjects.forEach((obj) => {
        if (obj.__anchorIndicator?.isHighlighted) obj.set('opacity', pulse);
      });
      canvas.requestRenderAll();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anchors, displayScale, mmPerPx, highlightedAnchorId, customAnchors]);

  // Sync artworks
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !mmPerPx) return;

    const existingIds = new Set(artworks.map((a) => a.id));
    artworkObjectsRef.current.forEach((obj, id) => {
      if (!existingIds.has(id)) {
        canvas.remove(obj);
        artworkObjectsRef.current.delete(id);
      }
    });

    artworks.forEach((aw) => {
      const existing = artworkObjectsRef.current.get(aw.id);
      const xPx = (aw.xMm / mmPerPx) * displayScale;
      const yPx = (aw.yMm / mmPerPx) * displayScale;
      const targetWidthPxNative = aw.widthMm / mmPerPx;
      const targetHeightPxNative = aw.heightMm / mmPerPx;

      if (existing) {
        const naturalW = existing.width;
        const naturalH = existing.height;
        existing.set({
          left: xPx,
          top: yPx,
          scaleX: (targetWidthPxNative * displayScale) / naturalW,
          scaleY: (targetHeightPxNative * displayScale) / naturalH,
          angle: aw.angleDeg,
        });
        existing.setCoords();
      } else {
        fabric.FabricImage.fromURL(aw.dataUrl, { crossOrigin: 'anonymous' }).then((img) => {
          if (!fabricCanvasRef.current) return;
          const naturalW = img.width;
          const naturalH = img.height;
          const sysImg = img as SystemFabricObject;
          sysImg.__artworkId = aw.id;
          img.set({
            left: xPx,
            top: yPx,
            originX: 'left',
            originY: 'top',
            scaleX: (targetWidthPxNative * displayScale) / naturalW,
            scaleY: (targetHeightPxNative * displayScale) / naturalH,
            angle: aw.angleDeg,
            centeredScaling: true,
            centeredRotation: true,
            cornerStyle: 'circle',
            transparentCorners: false,
            cornerColor: '#2563eb',
            borderColor: '#2563eb',
          });
          fabricCanvasRef.current.add(img);
          artworkObjectsRef.current.set(aw.id, img);
          if (selectedId === aw.id) {
            fabricCanvasRef.current.setActiveObject(img);
          }
          fabricCanvasRef.current.requestRenderAll();
        });
      }
    });
    canvas.requestRenderAll();
  }, [artworks, displayScale, mmPerPx, selectedId]);

  // External selection sync
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    if (selectedId) {
      const obj = artworkObjectsRef.current.get(selectedId);
      if (obj && canvas.getActiveObject() !== obj) {
        canvas.setActiveObject(obj);
        canvas.requestRenderAll();
      }
    } else if (canvas.getActiveObject()) {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
  }, [selectedId]);

  return (
    <div className="border border-gray-300 rounded bg-white inline-block">
      <canvas ref={canvasElRef} />
      {!mockup.mockupDataUrl && (
        <div className="p-4 text-sm text-gray-500">먼저 ① 캘리브 탭에서 mockup을 업로드하세요.</div>
      )}
      {mockup.mockupDataUrl && !mmPerPx && (
        <div className="p-3 text-sm text-orange-700 bg-orange-50 border-t">
          ⚠ 환산비가 없습니다. ① 캘리브 탭에서 기준 선분을 먼저 저장하세요.
        </div>
      )}
    </div>
  );
}

export function exceedsA3Bbox(widthMm: number, heightMm: number, angleDeg: number): boolean {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const bboxW = widthMm * cos + heightMm * sin;
  const bboxH = widthMm * sin + heightMm * cos;
  const w = Math.min(bboxW, bboxH);
  const h = Math.max(bboxW, bboxH);
  return w > A3_MAX_WIDTH_MM || h > A3_MAX_HEIGHT_MM;
}
