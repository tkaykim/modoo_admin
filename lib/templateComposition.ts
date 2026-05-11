'use client';

import * as fabric from 'fabric';
import type {
  CompositionSlot,
  CompositionTextSlot,
  CompositionImageSlot,
  PlacementEntry,
  ProductSide,
} from '@/types/types';

/**
 * Helpers that turn a (composition slot, placement entry) into a Fabric object
 * positioned on the active product side, and back from the Fabric object into a
 * normalized PlacementEntry for storage.
 *
 * Coordinate system:
 *   - PlacementEntry x/y/width/height are normalized 0-1 relative to the product
 *     side's printArea (NOT the whole canvas). This keeps the same composition
 *     mappable across products of different mockup sizes.
 */

const SLOT_DATA_FLAG = '__composition_slot__';

type FabricObjectWithData = fabric.FabricObject & {
  data?: { slot_id?: string; [k: string]: unknown };
};

interface PrintAreaCoords {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getPrintArea(side: ProductSide): PrintAreaCoords {
  return {
    x: side.printArea?.x ?? 0,
    y: side.printArea?.y ?? 0,
    width: side.printArea?.width ?? 1,
    height: side.printArea?.height ?? 1,
  };
}

export function denormalizePlacement(placement: PlacementEntry, side: ProductSide) {
  const pa = getPrintArea(side);
  return {
    left: pa.x + placement.x * pa.width,
    top: pa.y + placement.y * pa.height,
    width: placement.width * pa.width,
    height: placement.height * pa.height,
    angle: placement.angle ?? 0,
    originX: (placement.origin_x ?? 'center') as 'left' | 'center' | 'right',
    originY: (placement.origin_y ?? 'center') as 'top' | 'center' | 'bottom',
  };
}

export function normalizeFabricToPlacement(
  obj: fabric.FabricObject,
  side: ProductSide,
): PlacementEntry {
  const pa = getPrintArea(side);
  const w = (obj.width ?? 0) * (obj.scaleX ?? 1);
  const h = (obj.height ?? 0) * (obj.scaleY ?? 1);
  return {
    side_id: side.id,
    x: ((obj.left ?? 0) - pa.x) / pa.width,
    y: ((obj.top ?? 0) - pa.y) / pa.height,
    width: w / pa.width,
    height: h / pa.height,
    angle: obj.angle ?? 0,
    origin_x: (obj.originX as 'left' | 'center' | 'right') ?? 'center',
    origin_y: (obj.originY as 'top' | 'center' | 'bottom') ?? 'center',
  };
}

/**
 * Default placement when the slot hasn't been placed yet — centered in the
 * print area at half its width.
 */
function defaultPlacement(slot: CompositionSlot, side: ProductSide): PlacementEntry {
  const isText = slot.kind === 'text';
  return {
    side_id: side.id,
    x: 0.5,
    y: 0.5,
    width: 0.5,
    height: isText ? 0.1 : 0.4,
    origin_x: 'center',
    origin_y: 'center',
  };
}

export async function createFabricFromSlot(
  slot: CompositionSlot,
  side: ProductSide,
  placement?: PlacementEntry,
): Promise<fabric.FabricObject | null> {
  const place = placement ?? defaultPlacement(slot, side);
  const dn = denormalizePlacement(place, side);

  if (slot.kind === 'text') {
    const ts = slot as CompositionTextSlot;
    const tb = new fabric.Textbox(ts.default_text || ts.label, {
      left: dn.left,
      top: dn.top,
      width: dn.width,
      angle: dn.angle,
      originX: dn.originX,
      originY: dn.originY,
      fontFamily: ts.font_family ?? 'Pretendard',
      fontWeight: ts.font_weight ?? 'normal',
      fill: ts.font_color ?? '#000000',
      fontSize: Math.max(10, dn.height),
      textAlign: 'center',
    });
    (tb as FabricObjectWithData).data = {
      slot_id: ts.slot_id,
      [SLOT_DATA_FLAG]: true,
      slot_kind: 'text',
    };
    return tb;
  }

  if (slot.kind === 'image') {
    const im = slot as CompositionImageSlot;
    if (!im.default_image_url) {
      const rect = new fabric.Rect({
        left: dn.left,
        top: dn.top,
        width: dn.width,
        height: dn.height,
        angle: dn.angle,
        originX: dn.originX,
        originY: dn.originY,
        fill: '#e5e7eb',
        stroke: '#9ca3af',
        strokeDashArray: [4, 4],
        strokeWidth: 1,
      });
      (rect as FabricObjectWithData).data = {
        slot_id: im.slot_id,
        [SLOT_DATA_FLAG]: true,
        slot_kind: 'image',
        isPlaceholder: true,
      };
      return rect;
    }
    try {
      const img = await fabric.FabricImage.fromURL(im.default_image_url, {
        crossOrigin: 'anonymous',
      });
      const naturalW = img.width ?? 1;
      const naturalH = img.height ?? 1;
      img.set({
        left: dn.left,
        top: dn.top,
        scaleX: dn.width / naturalW,
        scaleY: dn.height / naturalH,
        angle: dn.angle,
        originX: dn.originX,
        originY: dn.originY,
      });
      (img as FabricObjectWithData).data = {
        slot_id: im.slot_id,
        [SLOT_DATA_FLAG]: true,
        slot_kind: 'image',
      };
      return img;
    } catch (err) {
      console.error('createFabricFromSlot image load failed:', err);
      return null;
    }
  }
  return null;
}

export function isSlotObject(obj: fabric.FabricObject | null | undefined): boolean {
  return !!(obj as FabricObjectWithData | null)?.data?.[SLOT_DATA_FLAG];
}

export function getSlotIdFromObject(obj: fabric.FabricObject | null | undefined): string | null {
  return (((obj as FabricObjectWithData | null)?.data?.slot_id as string) || null);
}

/**
 * Find an existing slot object on the canvas by slot_id (returns null if absent).
 */
export function findSlotObject(canvas: fabric.Canvas, slotId: string): fabric.FabricObject | null {
  return (
    (canvas.getObjects() as FabricObjectWithData[]).find(
      (o) => o.data?.slot_id === slotId && o.data?.[SLOT_DATA_FLAG],
    ) ?? null
  );
}
