'use client';

import { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import useSWR from 'swr';
import { CoBuyRequest } from '@/types/types';
import '@/lib/curvedText';

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
});

// Canvas renders at full size, shrunk via CSS
const SRC_W = 400;
const SRC_H = 500;
const DISPLAY_SCALE = 0.5;

interface ProductSideInfo {
  id: string;
  name: string;
  imageUrl?: string;
  zoomScale?: number;
  layers?: { id: string; name: string; imageUrl: string; zIndex: number; colorOptions?: { hex: string; colorCode: string }[] }[];
}

interface FreeformSketchPanelProps {
  cobuyRequestId: string;
  onClose: () => void;
  onResetToSketch?: () => void;
}

export default function FreeformSketchPanel({ cobuyRequestId, onClose, onResetToSketch }: FreeformSketchPanelProps) {
  const { data: requests } = useSWR<CoBuyRequest[]>(
    `/api/admin/cobuy/requests?id=${cobuyRequestId}`,
    fetcher
  );
  const request = requests?.[0];
  const [activeSideIndex, setActiveSideIndex] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!request) {
    return (
      <div className="bg-neutral-800 border border-neutral-600 rounded-lg p-3 w-56 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-neutral-300">스케치 참고</span>
          <button onClick={onClose} className="p-0.5 text-neutral-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-neutral-400" />
        </div>
      </div>
    );
  }

  const productSides: ProductSideInfo[] = (request as any).product?.configuration || [];
  const canvasState = request.freeform_canvas_state || {};
  const colorSelections = request.freeform_color_selections as any;
  const productColorHex = colorSelections?._productColor?.hex;
  const productColorName = colorSelections?._productColor?.name;

  const sideIds = productSides.length > 0 ? productSides.map(s => s.id) : Object.keys(canvasState);

  return (
    <div className="bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl w-56">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
        <span className="text-[11px] font-medium text-neutral-300">스케치 참고</span>
        <button onClick={onClose} className="p-0.5 text-neutral-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
      </div>

      {/* Sketch canvases */}
      <div className="p-2">
        {sideIds.length > 0 ? (
          <div>
            {/* Navigation */}
            {sideIds.length > 1 && (
              <div className="flex items-center justify-between mb-1.5">
                <button
                  onClick={() => setActiveSideIndex(Math.max(0, activeSideIndex - 1))}
                  disabled={activeSideIndex === 0}
                  className="p-0.5 text-neutral-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-neutral-400">
                  {productSides[activeSideIndex]?.name || sideIds[activeSideIndex]} ({activeSideIndex + 1}/{sideIds.length})
                </span>
                <button
                  onClick={() => setActiveSideIndex(Math.min(sideIds.length - 1, activeSideIndex + 1))}
                  disabled={activeSideIndex === sideIds.length - 1}
                  className="p-0.5 text-neutral-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Canvas */}
            {sideIds.map((sideId, idx) => (
              <div key={sideId} className={idx === activeSideIndex ? '' : 'hidden'}>
                <SketchCanvas
                  sideId={sideId}
                  side={productSides.find(s => s.id === sideId)}
                  stateValue={canvasState[sideId]}
                  productColorHex={productColorHex}
                  layerColors={colorSelections?.[sideId] as Record<string, string> | undefined}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-neutral-500 text-center py-4">스케치 없음</p>
        )}

        {/* Color info */}
        {productColorHex && (
          <div className="flex items-center gap-1.5 mt-2 px-1">
            <div className="w-4 h-4 rounded-full border border-neutral-500" style={{ backgroundColor: productColorHex }} />
            <span className="text-[10px] text-neutral-300">{productColorName || productColorHex}</span>
          </div>
        )}
        {/* Layer color info */}
        {(() => {
          const infos: { name: string; hex: string; code?: string }[] = [];
          const seen = new Set<string>();
          productSides.forEach(side => {
            side.layers?.forEach(layer => {
              if (seen.has(layer.id)) return;
              seen.add(layer.id);
              let hex: string | undefined;
              for (const sid of sideIds) {
                if (sid === '_productColor') continue;
                hex = (colorSelections?.[sid] as any)?.[layer.id];
                if (hex) break;
              }
              if (!hex) return;
              const matched = layer.colorOptions?.find(co => co.hex === hex);
              infos.push({ name: layer.name, hex, code: matched?.colorCode });
            });
          });
          if (infos.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-1.5 mt-1.5 px-1">
              {infos.map((info, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full border border-neutral-500" style={{ backgroundColor: info.hex }} />
                  <span className="text-[10px] text-neutral-400">{info.name}{info.code && ` (${info.code})`}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-neutral-700 flex items-center justify-between gap-2">
        <p className="text-[10px] text-neutral-400 truncate flex-1">{request.title}</p>
        {onResetToSketch && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-amber-400 shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            초기화
          </button>
        )}
      </div>

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-neutral-800 border border-neutral-600 rounded-lg p-4 w-72 shadow-xl" onClick={e => e.stopPropagation()}>
            <p className="text-[13px] text-neutral-200 font-medium mb-1">스케치로 초기화</p>
            <p className="text-[11px] text-neutral-400 mb-4">현재 캔버스의 모든 작업을 지우고 사용자 스케치 상태로 되돌립니다.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 text-[11px] text-neutral-300 bg-neutral-700 hover:bg-neutral-600 rounded"
              >
                취소
              </button>
              <button
                onClick={() => { setShowResetConfirm(false); onResetToSketch?.(); }}
                className="px-3 py-1.5 text-[11px] text-white bg-amber-600 hover:bg-amber-500 rounded"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Renders a single side's sketch using fabric.js StaticCanvas
function SketchCanvas({
  sideId,
  side,
  stateValue,
  productColorHex,
  layerColors,
}: {
  sideId: string;
  side?: ProductSideInfo;
  stateValue?: any;
  productColorHex?: string;
  layerColors?: Record<string, string>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let disposed = false;

    const init = async () => {
      const fabric = await import('fabric');
      if (disposed) return;

      const canvas = new fabric.StaticCanvas(canvasRef.current!, {
        width: SRC_W,
        height: SRC_H,
        backgroundColor: '#EBEBEB',
      });
      fabricRef.current = canvas;

      try {
        const hasLayers = side?.layers && side.layers.length > 0;
        const zoom = side?.zoomScale || 1.0;

        const applyColorFilter = (img: any, colorHex?: string) => {
          const color = colorHex || productColorHex;
          if (color && color !== '#FFFFFF') {
            img.filters = [new fabric.filters.BlendColor({ color, mode: 'multiply', alpha: 1 })];
            img.applyFilters();
          }
        };

        if (hasLayers) {
          const sorted = [...side!.layers!].sort((a, b) => a.zIndex - b.zIndex);
          for (const layer of sorted) {
            if (disposed) return;
            try {
              const img = await fabric.FabricImage.fromURL(layer.imageUrl, { crossOrigin: 'anonymous' });
              if (disposed) { canvas.dispose(); return; }
              const baseScale = Math.min(SRC_W / (img.width || 1), SRC_H / (img.height || 1));
              img.set({
                scaleX: baseScale * zoom, scaleY: baseScale * zoom,
                originX: 'center', originY: 'center',
                left: SRC_W / 2, top: SRC_H / 2,
              });
              applyColorFilter(img, layerColors?.[layer.id]);
              canvas.add(img);
            } catch (e) { console.error('Failed to load layer', layer.id, e); }
          }
        } else if (side?.imageUrl) {
          try {
            const img = await fabric.FabricImage.fromURL(side.imageUrl, { crossOrigin: 'anonymous' });
            if (disposed) { canvas.dispose(); return; }
            const baseScale = Math.min(SRC_W / (img.width || 1), SRC_H / (img.height || 1));
            img.set({
              scaleX: baseScale * zoom, scaleY: baseScale * zoom,
              originX: 'center', originY: 'center',
              left: SRC_W / 2, top: SRC_H / 2,
            });
            applyColorFilter(img);
            canvas.add(img);
          } catch (e) { console.error('Failed to load mockup for', sideId, e); }
        }

        // Load user objects
        if (stateValue) {
          const sideData = typeof stateValue === 'string' ? JSON.parse(stateValue) : stateValue;
          if (sideData?.objects?.length) {
            const enlivened = await fabric.util.enlivenObjects(sideData.objects);
            if (disposed) { canvas.dispose(); return; }
            for (const obj of enlivened) {
              canvas.add(obj as any);
            }
          }
        }

        canvas.renderAll();
      } catch (e) {
        console.error('Error rendering sketch for side', sideId, e);
      }
    };

    init();

    return () => {
      disposed = true;
      if (fabricRef.current) { try { fabricRef.current.dispose(); } catch {} }
      fabricRef.current = null;
    };
  }, [sideId, side, stateValue, productColorHex, layerColors]);

  return (
    <div className="rounded overflow-hidden" style={{ width: SRC_W * DISPLAY_SCALE, height: SRC_H * DISPLAY_SCALE }}>
      <canvas ref={canvasRef} className="origin-top-left" style={{ transform: `scale(${DISPLAY_SCALE})` }} />
    </div>
  );
}
