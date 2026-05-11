'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Save, Trash2 } from 'lucide-react';
import * as fabric from 'fabric';
import { useCanvasStore } from '@/store/useCanvasStore';
import {
  loadGroupArtworkOnCanvas,
  captureGroupTransform,
  findTemplateGroup,
} from '@/lib/templateGroupComposer';
import type { TemplateGroup, GroupTransform, Product } from '@/types/types';

interface Props {
  group: TemplateGroup;
  product: Product;
  /** Already-saved placement (loaded from the template row). */
  initialSideId: string | null;
  initialTransform: GroupTransform | null;
  /** Called when admin presses 배치 저장. */
  onSave: (sideId: string, transform: GroupTransform) => Promise<void> | void;
  saving?: boolean;
}

/**
 * Sidebar panel for editing a single group-bound template instance.
 * Loads the group artwork as a Fabric.Group on the active product side, lets
 * admin drag/resize the whole group, and captures the transform on save.
 */
export default function GroupPlacementPanel({
  group,
  product,
  initialSideId,
  initialTransform,
  onSave,
  saving,
}: Props) {
  const { canvasMap, activeSideId, setActiveSide, incrementCanvasVersion } = useCanvasStore();
  const [, forceTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadedSidesRef = useRef<Set<string>>(new Set());

  const activeSide = product.configuration.find((s) => s.id === activeSideId) || product.configuration[0];

  // Auto-place the group on the initial side (or current side if no initial) once.
  useEffect(() => {
    if (!group || !activeSide) return;
    const targetSideId = initialSideId || activeSide.id;
    if (loadedSidesRef.current.has(targetSideId)) return;

    const targetSide = product.configuration.find((s) => s.id === targetSideId) || activeSide;
    const targetCanvas = canvasMap[targetSide.id];
    if (!targetCanvas) return;

    if (findTemplateGroup(targetCanvas)) {
      loadedSidesRef.current.add(targetSide.id);
      return; // already there
    }

    setLoading(true);
    (async () => {
      const fGroup = await loadGroupArtworkOnCanvas(targetCanvas, group, targetSide, initialTransform);
      if (fGroup) {
        targetCanvas.setActiveObject(fGroup);
        targetCanvas.requestRenderAll();
        incrementCanvasVersion();
        loadedSidesRef.current.add(targetSide.id);
        if (targetSide.id !== activeSideId) setActiveSide(targetSide.id);
      }
      setLoading(false);
      forceTick((n) => n + 1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, activeSide, activeSideId ? canvasMap[activeSideId] : null]);

  // Re-render badge state on canvas mutations
  useEffect(() => {
    const canvases = Object.values(canvasMap);
    const handler = () => forceTick((n) => n + 1);
    canvases.forEach((c) => {
      c.on('object:modified', handler);
      c.on('object:added', handler);
      c.on('object:removed', handler);
    });
    return () => {
      canvases.forEach((c) => {
        c.off('object:modified', handler);
        c.off('object:added', handler);
        c.off('object:removed', handler);
      });
    };
  }, [canvasMap]);

  const placedOnSide = (() => {
    for (const side of product.configuration) {
      const c = canvasMap[side.id];
      if (c && findTemplateGroup(c)) return side;
    }
    return null;
  })();

  const handleMoveToSide = async (sideId: string) => {
    if (sideId === placedOnSide?.id) return;
    const targetSide = product.configuration.find((s) => s.id === sideId);
    if (!targetSide) return;
    const targetCanvas = canvasMap[sideId];
    if (!targetCanvas) return;

    // Remove from old side
    if (placedOnSide) {
      const oldCanvas = canvasMap[placedOnSide.id];
      const oldGroup = oldCanvas ? findTemplateGroup(oldCanvas) : null;
      if (oldCanvas && oldGroup) {
        oldCanvas.remove(oldGroup);
        oldCanvas.requestRenderAll();
      }
    }
    // Add to new side
    setLoading(true);
    const fGroup = await loadGroupArtworkOnCanvas(targetCanvas, group, targetSide, initialTransform);
    if (fGroup) {
      targetCanvas.setActiveObject(fGroup);
      targetCanvas.requestRenderAll();
    }
    setActiveSide(sideId);
    incrementCanvasVersion();
    setLoading(false);
  };

  const handleRemove = () => {
    if (!placedOnSide) return;
    const c = canvasMap[placedOnSide.id];
    const g = c ? findTemplateGroup(c) : null;
    if (c && g) {
      c.remove(g);
      c.requestRenderAll();
      incrementCanvasVersion();
    }
  };

  const handleSave = async () => {
    if (!placedOnSide) {
      alert('아직 그룹이 배치되지 않았습니다.');
      return;
    }
    const c = canvasMap[placedOnSide.id];
    const g = c ? findTemplateGroup(c) : null;
    if (!c || !g) return;
    const transform = captureGroupTransform(g, placedOnSide);
    await onSave(placedOnSide.id, transform);
  };

  return (
    <div className="p-3 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">디자인 그룹 배치</h3>
        <p className="text-[10px] text-gray-500 mt-0.5 truncate">{group.title}</p>
      </div>

      {loading && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          그룹을 캔버스에 불러오는 중...
        </div>
      )}

      <div>
        <label className="block text-[10px] text-gray-500 mb-1">배치할 면</label>
        <div className="flex flex-wrap gap-1">
          {product.configuration.map((side) => {
            const isPlaced = placedOnSide?.id === side.id;
            return (
              <button
                key={side.id}
                onClick={() => handleMoveToSide(side.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition ${
                  isPlaced
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {isPlaced && <MapPin className="inline w-2.5 h-2.5 mr-0.5" />}
                {side.name}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-gray-500">
        팁: 캔버스에서 그룹을 드래그·리사이즈해서 위치를 잡은 뒤 "배치 저장"을 누르세요.
      </p>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !placedOnSide}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded bg-black text-white text-xs font-medium hover:bg-gray-800 disabled:bg-gray-300"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          배치 저장
        </button>
        {placedOnSide && (
          <button
            onClick={handleRemove}
            className="px-2.5 py-1.5 rounded border border-red-300 text-red-600 text-xs hover:bg-red-50"
            title="캔버스에서 제거"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
