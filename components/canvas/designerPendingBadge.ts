/**
 * Adds/removes a small amber "!" badge near the top-right corner of a fabric
 * image to signal that the image is a placeholder waiting for a designer's
 * manual replacement. The badge is excluded from canvas serialization so it
 * doesn't pollute saved designs; instead, callers should re-attach it on
 * canvas restore for any FabricImage whose `data.designerPending === true`.
 *
 * Pattern follows anchorPreviewLayer.ts: data-id tagging, selectable/evented
 * false, excludeFromExport true. The badge tracks parent moves/scales/rotates
 * via fabric events and removes itself when the parent is removed.
 */
import * as fabric from 'fabric';

const BADGE_TAG = 'designer-pending-badge' as const;

interface BadgeObject extends fabric.FabricObject {
  data?: { id?: string; parentJobId?: string };
  __cleanup?: () => void;
}

interface ParentObject extends fabric.FabricObject {
  data?: { designerJobId?: string; designerPending?: boolean };
}

function positionBadge(badge: fabric.FabricObject, parent: fabric.FabricObject): void {
  const bbox = parent.getBoundingRect();
  badge.set({
    left: bbox.left + bbox.width,
    top: bbox.top,
  });
  badge.setCoords();
}

function createBadge(parentJobId: string): fabric.Group {
  const radius = 12;
  const circle = new fabric.Circle({
    radius,
    fill: '#f59e0b',
    stroke: '#ffffff',
    strokeWidth: 2,
    originX: 'center',
    originY: 'center',
  });
  const text = new fabric.FabricText('!', {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'sans-serif',
    fill: '#ffffff',
    originX: 'center',
    originY: 'center',
  });
  const group = new fabric.Group([circle, text], {
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
    excludeFromExport: true,
    hoverCursor: 'default',
  }) as fabric.Group & BadgeObject;
  (group as BadgeObject).data = { id: BADGE_TAG, parentJobId };
  return group;
}

export function addDesignerPendingBadge(
  canvas: fabric.Canvas | null | undefined,
  parent: fabric.FabricObject,
): void {
  if (!canvas) return;
  const data = (parent as ParentObject).data;
  const jobId = data?.designerJobId;
  if (!jobId) return;

  removeDesignerPendingBadge(canvas, parent);

  const badge = createBadge(jobId) as fabric.Group & BadgeObject;
  positionBadge(badge, parent);
  canvas.add(badge);
  canvas.bringObjectToFront(badge);

  const onMove = () => {
    positionBadge(badge, parent);
    canvas.requestRenderAll();
  };
  const onRemovedFromParent = () => {
    canvas.remove(badge);
    parent.off('moving', onMove);
    parent.off('scaling', onMove);
    parent.off('rotating', onMove);
    parent.off('modified', onMove);
    parent.off('removed', onRemovedFromParent);
  };
  parent.on('moving', onMove);
  parent.on('scaling', onMove);
  parent.on('rotating', onMove);
  parent.on('modified', onMove);
  parent.on('removed', onRemovedFromParent);

  badge.__cleanup = onRemovedFromParent;
  canvas.requestRenderAll();
}

export function removeDesignerPendingBadge(
  canvas: fabric.Canvas | null | undefined,
  parent: fabric.FabricObject,
): void {
  if (!canvas) return;
  const data = (parent as ParentObject).data;
  const jobId = data?.designerJobId;
  if (!jobId) return;
  const existing = canvas.getObjects().find((o) => {
    const b = o as BadgeObject;
    return b.data?.id === BADGE_TAG && b.data?.parentJobId === jobId;
  }) as BadgeObject | undefined;
  if (!existing) return;
  if (typeof existing.__cleanup === 'function') {
    existing.__cleanup();
  } else {
    canvas.remove(existing);
  }
  canvas.requestRenderAll();
}

/**
 * Iterates canvas objects and re-attaches badges for all designer-pending
 * fabric objects. Call after restoring a saved canvas state.
 */
export function restoreDesignerPendingBadges(canvas: fabric.Canvas | null | undefined): void {
  if (!canvas) return;
  canvas.getObjects().forEach((obj) => {
    const data = (obj as ParentObject).data;
    if (data?.designerPending && data.designerJobId) {
      addDesignerPendingBadge(canvas, obj);
    }
  });
}
