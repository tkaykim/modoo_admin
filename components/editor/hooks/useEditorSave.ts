'use client';

import { useCallback } from 'react';
import { useCanvasStore } from '@/store/useCanvasStore';
import { Product, OrderItem, DesignTemplate, SavedDesign, CanvasState } from '@/types/types';
import { serializeCanvasState } from '@/lib/canvasUtils';
import { saveDesign, updateDesign, SaveDesignData } from '@/lib/designService';
import { parseCanvasState } from '@/lib/downloadUtils';
import { calculateAllSidesPricing } from '@/app/utils/canvasPricing';
import { EditorMode } from './useEditorMode';
import { formatKstDateTimeFull } from '@/lib/kst';

interface UseEditorSaveParams {
  mode: EditorMode;
  product: Product | null;
  orderItem?: OrderItem | null;
  savedDesign?: SavedDesign | null;
  selectedTemplate?: DesignTemplate | null;
  designTitle?: string;
  templateTitle?: string;
  templateDescription?: string;
  templateSortOrder?: number;
  templateIsActive?: boolean;
  presetType?: string;
}

export interface SaveResult {
  success: boolean;
  id?: string;
  error?: string;
  /** Returned from order save so the caller can update local canvas states */
  canvasState?: Record<string, unknown>;
}

interface EditorSaveResult {
  handleSave: () => Promise<SaveResult>;
}

export function useEditorSave({
  mode,
  product,
  orderItem,
  savedDesign,
  selectedTemplate,
  designTitle,
  templateTitle,
  templateDescription,
  templateSortOrder,
  templateIsActive,
  presetType,
}: UseEditorSaveParams): EditorSaveResult {
  const { canvasMap, productColor, layerColors } = useCanvasStore();

  const handleSave = useCallback(async (): Promise<SaveResult> => {
    if (!product) return { success: false, error: '제품 정보가 없습니다.' };

    const sides = product.configuration || [];

    try {
      if (mode === 'design') {
        return await saveDesignMode(sides);
      } else if (mode === 'order') {
        return await saveOrderMode(sides);
      } else if (mode === 'template') {
        return await saveTemplateMode(sides);
      }
      return { success: false, error: '알 수 없는 모드입니다.' };
    } catch (err) {
      const message = err instanceof Error ? err.message : '저장에 실패했습니다.';
      console.error('Save error:', err);
      return { success: false, error: message };
    }
  }, [mode, product, canvasMap, productColor, layerColors, orderItem, savedDesign, selectedTemplate, designTitle, templateTitle, templateDescription, templateSortOrder, templateIsActive, presetType]);

  async function saveDesignMode(sides: Product['configuration']): Promise<SaveResult> {
    // Serialize canvas state from all sides
    const canvasState: Record<string, string> = {};
    for (const side of sides) {
      const canvas = canvasMap[side.id];
      if (canvas) {
        canvasState[side.id] = serializeCanvasState(canvas, layerColors[side.id] || {});
      }
    }

    // Generate preview image from first side
    let previewImage: string | undefined;
    const firstCanvas = canvasMap[sides[0]?.id];
    if (firstCanvas) {
      try {
        previewImage = firstCanvas.toDataURL({
          format: 'png',
          quality: 0.8,
          multiplier: 0.5,
        });
      } catch (err) {
        console.error('Error generating preview:', err);
      }
    }

    // Calculate design price including print method costs
    const pricingSummary = await calculateAllSidesPricing(canvasMap, sides);
    const pricePerItem = product!.base_price + pricingSummary.totalAdditionalPrice;

    // Update existing design or create new one
    if (savedDesign?.id) {
      const updateData: Partial<SaveDesignData> = {
        title: designTitle || savedDesign.title || `디자인 ${formatKstDateTimeFull(new Date())}`,
        productColor,
        canvasState,
        previewImage,
        pricePerItem,
      };

      const updated = await updateDesign(savedDesign.id, updateData);
      if (!updated) return { success: false, error: '디자인 업데이트에 실패했습니다.' };

      syncDesignToOrderItems(savedDesign.id);

      return { success: true, id: updated.id };
    } else {
      const designData: SaveDesignData = {
        productId: product!.id,
        title: designTitle || `디자인 ${formatKstDateTimeFull(new Date())}`,
        productColor,
        canvasState,
        previewImage,
        pricePerItem,
      };

      const newDesign = await saveDesign(designData);
      if (!newDesign) return { success: false, error: '디자인 저장에 실패했습니다.' };
      return { success: true, id: newDesign.id };
    }
  }

  async function saveOrderMode(sides: Product['configuration']): Promise<SaveResult> {
    if (!orderItem) return { success: false, error: '주문 항목 정보가 없습니다.' };

    const updatedCanvasState: Record<string, unknown> = { ...orderItem.canvas_state };

    for (const side of sides) {
      const canvas = canvasMap[side.id];
      if (!canvas) continue;

      const objects = canvas.getObjects().filter((obj) => {
        const objData = obj as { data?: { id?: string } };
        return objData.data?.id !== 'background-product-image';
      });

      const serializedObjects = objects.map((obj) =>
        obj.toObject(['data', 'objectId', 'widthMm', 'heightMm'])
      );

      const existingState = parseCanvasState(orderItem.canvas_state?.[side.id]);
      updatedCanvasState[side.id] = {
        ...existingState,
        objects: serializedObjects,
        productColor,
        layerColors: layerColors[side.id] || {},
      };
    }

    // Generate preview thumbnail from first side
    let thumbnailUrl: string | undefined;
    const firstCanvas = canvasMap[sides[0]?.id];
    if (firstCanvas) {
      try {
        firstCanvas.discardActiveObject();
        firstCanvas.renderAll();
        thumbnailUrl = firstCanvas.toDataURL({
          format: 'png',
          quality: 0.8,
          multiplier: 0.5,
        });
      } catch (err) {
        console.error('Error generating order preview:', err);
      }
    }

    const response = await fetch('/api/admin/orders/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderItemId: orderItem.id,
        canvasState: updatedCanvasState,
        thumbnailUrl,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || '저장에 실패했습니다.');
    }

    return { success: true, id: orderItem.id, canvasState: updatedCanvasState };
  }

  async function saveTemplateMode(sides: Product['configuration']): Promise<SaveResult> {
    // Serialize canvas state
    const canvasState: Record<string, unknown> = {};
    for (const side of sides) {
      const canvas = canvasMap[side.id];
      if (!canvas) continue;

      const objects = canvas.getObjects().filter((obj) => {
        if (obj.excludeFromExport) return false;
        const objData = obj as { data?: { id?: string } };
        return objData.data?.id !== 'background-product-image';
      });

      const serializedObjects = objects.map((obj) => {
        const json = obj.toObject(['data']);
        if (obj.type === 'image') {
          const imgObj = obj as unknown as { getSrc: () => string };
          json.src = imgObj.getSrc();
        }
        return json;
      });

      canvasState[side.id] = {
        objects: serializedObjects,
        layerColors: layerColors[side.id] || {},
      };
    }

    // Generate preview
    let previewUrl: string | undefined;
    const firstCanvas = canvasMap[sides[0]?.id];
    if (firstCanvas) {
      try {
        previewUrl = firstCanvas.toDataURL({
          format: 'png',
          quality: 0.8,
          multiplier: 0.5,
        });
      } catch (err) {
        console.error('Error generating preview:', err);
      }
    }

    const body: Record<string, unknown> = {
      product_id: product!.id,
      title: templateTitle || '새 템플릿',
      description: templateDescription || null,
      canvas_state: canvasState,
      preview_url: previewUrl || null,
      layer_colors: layerColors,
      sort_order: templateSortOrder ?? 0,
      is_active: templateIsActive ?? true,
    };
    if (presetType) {
      body.type = presetType;
    }

    const isUpdate = !!selectedTemplate;
    if (isUpdate) {
      body.id = selectedTemplate!.id;
    }

    const response = await fetch('/api/admin/design-templates', {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || '템플릿 저장에 실패했습니다.');
    }

    const result = await response.json();
    return { success: true, id: result.data?.id || selectedTemplate?.id };
  }

  return { handleSave };
}

function syncDesignToOrderItems(designId: string) {
  fetch(`/api/admin/designs/${designId}/sync-orders`, { method: 'POST' })
    .then((res) => {
      if (!res.ok) console.warn('order_items sync failed:', res.status);
      return res.json();
    })
    .then((data) => {
      if (data?.data?.synced > 0) {
        console.log(`Synced ${data.data.synced} order item(s) with design ${designId}`);
      }
    })
    .catch((err) => console.warn('order_items sync error:', err));
}