'use client';

import { useEffect, useState } from 'react';
import { Type, Image as ImageIcon, MapPin, Trash2, Loader2, Save } from 'lucide-react';
import * as fabric from 'fabric';
import { useCanvasStore } from '@/store/useCanvasStore';
import {
  createFabricFromSlot,
  findSlotObject,
  isSlotObject,
  normalizeFabricToPlacement,
} from '@/lib/templateComposition';
import type {
  CompositionSlot,
  DesignComposition,
  PlacementMap,
  Product,
} from '@/types/types';

interface Props {
  composition: DesignComposition;
  product: Product;
  /** Current persisted placement_map (loaded from the template). */
  placementMap: PlacementMap;
  /** Save handler — caller should PATCH /api/admin/design-templates with the latest placement_map. */
  onSave: (nextMap: PlacementMap) => Promise<void> | void;
  saving?: boolean;
}

/**
 * Sidebar panel shown in the admin editor when editing a group-bound template
 * (UnifiedEditor in template mode + a templateGroupId is set).
 *
 * For each composition slot:
 *   - shows label + status (placed / not placed)
 *   - "캔버스에 배치" button → instantiates a fabric object and adds it to the active side
 *   - "삭제" → removes the slot object from the canvas
 *
 * On save, captures every slot object's current position/scale on its side
 * and writes a fresh PlacementMap.
 */
export default function PlacementPanel({
  composition,
  product,
  placementMap,
  onSave,
  saving,
}: Props) {
  const { canvasMap, activeSideId, incrementCanvasVersion } = useCanvasStore();
  const [, forceTick] = useState(0);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);

  const slots = composition?.slots ?? [];
  const activeSide = product.configuration.find((s) => s.id === activeSideId) || product.configuration[0];

  // Re-render after canvas mutations so status badges stay in sync.
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

  /** Look up the active-side fabric object for this slot, if placed. */
  const findOnAnySide = (slotId: string): { side: typeof product.configuration[number]; obj: fabric.FabricObject } | null => {
    for (const side of product.configuration) {
      const c = canvasMap[side.id];
      if (!c) continue;
      const obj = findSlotObject(c, slotId);
      if (obj) return { side, obj };
    }
    return null;
  };

  const handlePlace = async (slot: CompositionSlot) => {
    if (!activeSide) return;
    const canvas = canvasMap[activeSide.id];
    if (!canvas) return;
    setBusySlotId(slot.slot_id);
    try {
      const existing = findOnAnySide(slot.slot_id);
      if (existing) {
        // Already placed elsewhere — focus + alert.
        alert(`이미 "${existing.side.name}" 면에 배치되어 있습니다. 한 슬롯은 한 곳에만 배치됩니다.`);
        const c = canvasMap[existing.side.id];
        c?.setActiveObject(existing.obj);
        c?.requestRenderAll();
        return;
      }
      const placement = placementMap[slot.slot_id];
      const obj = await createFabricFromSlot(slot, activeSide, placement);
      if (!obj) return;
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
      incrementCanvasVersion();
    } finally {
      setBusySlotId(null);
    }
  };

  const handleRemove = (slot: CompositionSlot) => {
    const found = findOnAnySide(slot.slot_id);
    if (!found) return;
    const c = canvasMap[found.side.id];
    c?.remove(found.obj);
    c?.requestRenderAll();
    incrementCanvasVersion();
  };

  const captureAndSave = async () => {
    const next: PlacementMap = {};
    for (const side of product.configuration) {
      const c = canvasMap[side.id];
      if (!c) continue;
      for (const obj of c.getObjects()) {
        if (!isSlotObject(obj)) continue;
        const slotId = ((obj as fabric.FabricObject & { data?: { slot_id?: string } }).data?.slot_id ?? '') as string;
        if (!slotId) continue;
        next[slotId] = normalizeFabricToPlacement(obj, side);
      }
    }
    await onSave(next);
  };

  if (slots.length === 0) {
    return (
      <div className="p-3 text-xs text-gray-500">
        이 그룹에 컴포지션 슬롯이 없습니다. <br />
        그룹 상세 페이지에서 슬롯을 먼저 정의해 주세요.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">슬롯 배치</h3>
          <p className="text-[10px] text-gray-500">
            현재 면: <span className="font-medium">{activeSide?.name}</span>
          </p>
        </div>
        <button
          onClick={captureAndSave}
          disabled={saving}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-black text-white text-[11px] font-medium hover:bg-gray-800 disabled:bg-gray-300"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          배치 저장
        </button>
      </div>

      <div className="space-y-1.5">
        {slots.map((slot) => {
          const found = findOnAnySide(slot.slot_id);
          const isPlaced = !!found;
          const placedSideName = found?.side.name;
          const isBusy = busySlotId === slot.slot_id;
          return (
            <div
              key={slot.slot_id}
              className="flex items-center gap-2 p-2 border border-gray-200 rounded text-xs"
            >
              {slot.kind === 'text' ? (
                <Type className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{slot.label}</p>
                <p className="text-[10px] text-gray-500">
                  {isPlaced ? (
                    <span className="text-green-600">
                      <MapPin className="w-2.5 h-2.5 inline" /> {placedSideName}에 배치됨
                    </span>
                  ) : (
                    <span className="text-gray-400">미배치</span>
                  )}
                </p>
              </div>
              {isPlaced ? (
                <button
                  onClick={() => handleRemove(slot)}
                  className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                  title="캔버스에서 제거"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => handlePlace(slot)}
                  disabled={isBusy}
                  className="px-2 py-1 rounded bg-purple-600 text-white text-[10px] font-medium hover:bg-purple-700 disabled:bg-gray-300 inline-flex items-center gap-1"
                >
                  {isBusy && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  배치하기
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-400">
        팁: 배치 후 캔버스에서 위치/크기를 조정한 뒤 "배치 저장"을 누르세요.
      </p>
    </div>
  );
}
