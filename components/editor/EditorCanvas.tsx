'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { ProductSide, CanvasState, CustomFont } from '@/types/types';
import { useCanvasStore } from '@/store/useCanvasStore';
import * as fabric from 'fabric';

const SingleSideCanvas = dynamic(() => import('@/components/canvas/SingleSideCanvas'), {
  ssr: false,
  loading: () => <div className="w-100 h-125 bg-gray-100 animate-pulse rounded-lg" />,
});

const CANVAS_W = 400;
const CANVAS_H = 500;
const GAP = 24;
const LABEL_H = 24;
const FIT_PADDING = 60;

interface EditorCanvasProps {
  sides: ProductSide[];
  isEditing: boolean;
  canvasStates?: Record<string, CanvasState | string | null>;
  productColor?: string;
  customFonts?: CustomFont[];
  onCanvasReady?: (canvas: fabric.Canvas, sideId: string, scale: number) => void;
  /** Width of the right panel overlay (px), used to center the grid in the visible area */
  rightPanelWidth?: number;
  /** Width of the left toolbar overlay (px) */
  leftToolbarWidth?: number;
  /** Operational product id — propagated to SingleSideCanvas for calibration fetch. */
  productId?: string;
}

export default function EditorCanvas({
  sides,
  isEditing,
  canvasStates,
  productColor,
  customFonts,
  onCanvasReady,
  rightPanelWidth = 0,
  leftToolbarWidth = 0,
  productId,
}: EditorCanvasProps) {
  const { activeSideId, setActiveSide } = useCanvasStore();
  const hasCanvasStates = canvasStates && Object.keys(canvasStates).length > 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  // Touch gesture state
  const touchesRef = useRef<{ id: number; x: number; y: number }[]>([]);
  const lastPinchDist = useRef<number>(0);

  // Grid dimensions
  const cols = sides.length > 1 ? 2 : 1;
  const rows = Math.ceil(sides.length / cols);
  const gridW = cols * CANVAS_W + (cols - 1) * GAP;
  const gridH = rows * (CANVAS_H + LABEL_H) + (rows - 1) * GAP;

  // Fit all canvases centered in the visible area (accounting for overlays)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || sides.length === 0) return;

    const rect = el.getBoundingClientRect();
    // Visible area = full width minus left toolbar and right panel
    const visibleW = rect.width - leftToolbarWidth - rightPanelWidth;
    const visibleH = rect.height;

    const sx = (visibleW - FIT_PADDING * 2) / gridW;
    const sy = (visibleH - FIT_PADDING * 2) / gridH;
    const scale = Math.min(sx, sy, 1);

    setView({
      x: leftToolbarWidth + (visibleW - gridW * scale) / 2,
      y: (visibleH - gridH * scale) / 2,
      scale,
    });
  }, [sides.length, gridW, gridH, rightPanelWidth, leftToolbarWidth]);

  // Space key for panning mode
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Block fabric events while space held or middle-click panning
  useEffect(() => {
    const el = contentRef.current;
    if (el) el.style.pointerEvents = spaceHeld || isPanning && middlePanRef.current ? 'none' : 'auto';
  }, [spaceHeld, isPanning]);

  // Prevent default middle-click auto-scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    el.addEventListener('mousedown', prevent);
    return () => el.removeEventListener('mousedown', prevent);
  }, []);

  // Track whether pan was initiated by middle mouse button
  const middlePanRef = useRef(false);

  // Pointer handlers for panning (Space+drag or middle mouse button)
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const isMiddle = e.button === 1;
      if (!spaceHeld && !isMiddle) return;
      if (isMiddle) {
        e.preventDefault();
        middlePanRef.current = true;
      }
      setIsPanning(true);
      lastPointer.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [spaceHeld],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    },
    [isPanning],
  );

  const onPointerUp = useCallback(() => {
    setIsPanning(false);
    middlePanRef.current = false;
  }, []);

  // Wheel zoom toward cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      setView((prev) => {
        const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
        const ns = Math.max(0.1, Math.min(5, prev.scale * factor));
        return {
          x: cx - (cx - prev.x) * (ns / prev.scale),
          y: cy - (cy - prev.y) * (ns / prev.scale),
          scale: ns,
        };
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Touch gesture handlers (pinch zoom & two-finger pan)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        touchesRef.current = Array.from(e.touches).map(t => ({
          id: t.identifier,
          x: t.clientX,
          y: t.clientY,
        }));

        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && touchesRef.current.length >= 2) {
        e.preventDefault();

        const rect = el.getBoundingClientRect();

        // Two-finger pinch zoom
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const newDist = Math.sqrt(dx * dx + dy * dy);

          if (lastPinchDist.current > 0) {
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

            const scaleFactor = newDist / lastPinchDist.current;

            setView((prev) => {
              const ns = Math.max(0.1, Math.min(5, prev.scale * scaleFactor));
              return {
                x: centerX - (centerX - prev.x) * (ns / prev.scale),
                y: centerY - (centerY - prev.y) * (ns / prev.scale),
                scale: ns,
              };
            });
          }

          lastPinchDist.current = newDist;
        }

        // Two-finger pan
        const currentTouches = Array.from(e.touches).slice(0, 2).map(t => ({
          id: t.identifier,
          x: t.clientX,
          y: t.clientY,
        }));

        const prevCenterX = (touchesRef.current[0].x + touchesRef.current[1].x) / 2;
        const prevCenterY = (touchesRef.current[0].y + touchesRef.current[1].y) / 2;
        const currCenterX = (currentTouches[0].x + currentTouches[1].x) / 2;
        const currCenterY = (currentTouches[0].y + currentTouches[1].y) / 2;

        const dx = currCenterX - prevCenterX;
        const dy = currCenterY - prevCenterY;

        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));

        touchesRef.current = currentTouches;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchesRef.current = [];
        lastPinchDist.current = 0;
      } else {
        touchesRef.current = Array.from(e.touches).map(t => ({
          id: t.identifier,
          x: t.clientX,
          y: t.clientY,
        }));
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-neutral-700 overflow-hidden"
      style={{ cursor: isPanning ? 'grabbing' : spaceHeld ? 'grab' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        ref={contentRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${CANVAS_W}px)`,
            gap: `${GAP}px`,
          }}
        >
          {sides.map((side) => {
            const canvasState = hasCanvasStates ? canvasStates[side.id] : undefined;
            const isActive = side.id === activeSideId;

            return (
              <div key={side.id} onClick={() => setActiveSide(side.id)} className="cursor-pointer">
                <div
                  className={`text-[11px] font-semibold mb-1 px-1 ${
                    isActive ? 'text-blue-400' : 'text-neutral-400'
                  }`}
                >
                  {side.name}
                </div>
                <div
                  className={`rounded-lg transition-shadow ${
                    isActive
                      ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-neutral-700'
                      : 'ring-1 ring-neutral-600'
                  }`}
                >
                  <SingleSideCanvas
                    side={side}
                    productId={productId}
                    width={CANVAS_W}
                    height={CANVAS_H}
                    isEdit={isEditing}
                    productColor={productColor}
                    {...(canvasState !== undefined && {
                      canvasState,
                      renderFromCanvasStateOnly: true,
                    })}
                    {...(customFonts && customFonts.length > 0 && { customFonts })}
                    onCanvasReady={onCanvasReady}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
