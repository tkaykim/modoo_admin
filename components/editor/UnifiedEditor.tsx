'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as fabric from 'fabric';
import { useCanvasStore } from '@/store/useCanvasStore';
import { DesignTemplate, CanvasState } from '@/types/types';
import { useEditorMode, EditorMode } from './hooks/useEditorMode';
import { useEditorData } from './hooks/useEditorData';
import { useEditorSave } from './hooks/useEditorSave';
import { serializeCanvasState } from '@/lib/canvasUtils';
import EditorHeader from './EditorHeader';
import EditorCanvas from './EditorCanvas';

import EditorRightPanel from './EditorRightPanel';
import Toolbar from '@/components/canvas/Toolbar';
import { preloadBackgroundRemoval } from '@/components/background-removal/BackgroundRemovalFlow';
import DesignModePanel from './panels/DesignModePanel';
import OrderModePanel from './panels/OrderModePanel';
import OrderEditPanel from './panels/OrderEditPanel';
import FactoryOrderInfoPanel from './panels/FactoryOrderInfoPanel';
import { useAuthStore } from '@/store/useAuthStore';
import TemplateModePanel from './panels/TemplateModePanel';
import {
  coerceImageUrlsBySide,
  coerceTextSvgExports,
  coerceTextSvgObjectUrlsBySide,
  coerceCustomFonts,
  getTextSvgFromCanvasState,
  getFileExtensionFromName,
  getFileExtensionFromUrl,
  getFileExtensionFromType,
  buildFilename,
  sanitizeFilenameSegment,
  parseCanvasState,
  downloadBlob,
  downloadUrl,
  sleep,
} from '@/lib/downloadUtils';

interface PartnerMallAddData {
  partnerMallId: string;
  partnerMallName: string;
  logoUrl: string;
  displayName: string;
  manufacturerColorId: string | null;
  colorHex: string | null;
  colorName: string | null;
  colorCode: string | null;
}

interface UnifiedEditorProps {
  productId: string;
  mode: EditorMode;
  orderId?: string;
  orderItemId?: string;
  templateId?: string;
  designId?: string;
  returnUrl?: string;
  cobuyRequestId?: string;
  partnerMallAdd?: boolean;
  presetType?: string;
}

export default function UnifiedEditor({
  productId,
  mode,
  orderId,
  orderItemId,
  templateId,
  designId,
  returnUrl,
  cobuyRequestId,
  partnerMallAdd,
  presetType,
}: UnifiedEditorProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const isFactoryUser = user?.role === 'factory';
  const modeConfig = useEditorMode({ mode, returnUrl });
  const editorData = useEditorData({ productId, mode, orderId, orderItemId, templateId, designId });
  const { setEditMode, setActiveSide, canvasMap, setProductColor: setStoreProductColor } = useCanvasStore();

  // Editing state
  const [isEditing, setIsEditing] = useState(modeConfig.initiallyEditable);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Factory user order mode tab
  const [factoryTab, setFactoryTab] = useState<'design' | 'order'>('design');

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);

  // Background-removal model prefetch on editor mount.
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (conn?.saveData) return;
    if (conn?.effectiveType && /^(2g|slow-2g)$/.test(conn.effectiveType)) return;
    const start = () => {
      void preloadBackgroundRemoval();
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(start, { timeout: 3000 });
    } else {
      const t = setTimeout(start, 1500);
      return () => clearTimeout(t);
    }
  }, []);

  // Selected text object for text style panel
  const [selectedTextObject, setSelectedTextObject] = useState<fabric.FabricObject | null>(null);

  // Design mode state
  const [designTitle, setDesignTitle] = useState('');
  const [cobuyDesignSaved, setCobuyDesignSaved] = useState(false);
  const [cobuyQuantity, setCobuyQuantity] = useState<number | null>(null);

  // Template mode state
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateSortOrder, setTemplateSortOrder] = useState(0);
  const [templateIsActive, setTemplateIsActive] = useState(true);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

  // Canvas states for rendering (may come from order or template)
  const [canvasStates, setCanvasStates] = useState<Record<string, CanvasState | string | null>>({});


  // Partner mall add state
  const [partnerMallAddData, setPartnerMallAddData] = useState<PartnerMallAddData | null>(null);

  // Snapshot for reverting on edit cancel (order mode)
  const editSnapshotRef = useRef<Record<string, object>>({});

  // Load partner mall add data and place logo
  useEffect(() => {
    if (!partnerMallAdd) return;

    const loadPartnerMallAddData = async () => {
      const raw = sessionStorage.getItem('adminPartnerMallAddData');
      if (!raw) return;

      try {
        const data: PartnerMallAddData = JSON.parse(raw);
        setPartnerMallAddData(data);
        sessionStorage.removeItem('adminPartnerMallAddData');

        // Wait for canvases to be ready
        const sides = editorData.product?.configuration || [];
        const checkCanvasesReady = () => sides.every(side => canvasMap[side.id]);

        let attempts = 0;
        while (!checkCanvasesReady() && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        if (!checkCanvasesReady()) return;

        // Set product color
        if (data.colorHex) {
          useCanvasStore.getState().setProductColor(data.colorHex);
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Place the mall logo on the first side canvas
        if (data.logoUrl && sides.length > 0) {
          const firstSide = sides[0];
          const canvas = canvasMap[firstSide.id];
          if (!canvas) return;

          try {
            const logoImg = await fabric.FabricImage.fromURL(data.logoUrl, { crossOrigin: 'anonymous' });
            // @ts-expect-error - Custom property
            const printAreaLeft = canvas.printAreaLeft || 0;
            // @ts-expect-error - Custom property
            const printAreaTop = canvas.printAreaTop || 0;
            // @ts-expect-error - Custom property
            const scaledPrintW = canvas.printAreaWidth || firstSide.printArea.width;
            const canvasScale = scaledPrintW / firstSide.printArea.width;

            const centerX = firstSide.printArea.width / 2;
            const centerY = firstSide.printArea.height / 2;
            const maxWidth = firstSide.printArea.width * 0.2;
            const maxHeight = firstSide.printArea.height * 0.2;
            const logoScale = Math.min(
              maxWidth / (logoImg.width || 100),
              maxHeight / (logoImg.height || 100)
            );

            logoImg.set({
              left: printAreaLeft + centerX * canvasScale,
              top: printAreaTop + centerY * canvasScale,
              scaleX: logoScale * canvasScale,
              scaleY: logoScale * canvasScale,
              originX: 'center',
              originY: 'center',
              data: { id: 'partner-mall-logo' },
            });

            canvas.add(logoImg);
            canvas.setActiveObject(logoImg);
            canvas.renderAll();
          } catch (err) {
            console.error('Failed to load mall logo:', err);
          }
        }
      } catch (err) {
        console.error('Failed to load partner mall add data:', err);
      }
    };

    loadPartnerMallAddData();
  }, [partnerMallAdd, canvasMap, editorData.product]);

  // Load CoBuy request colors and freeform canvas state
  const cobuyDataLoaded = useRef(false);
  useEffect(() => {
    if (!cobuyRequestId || cobuyDataLoaded.current) return;

    const applyCobuyData = async () => {
      try {
        const res = await fetch(`/api/admin/cobuy/requests?id=${cobuyRequestId}`);
        if (!res.ok) return;
        const requests = await res.json();
        const req = requests?.[0];
        if (!req) return;
        cobuyDataLoaded.current = true;

        // Store quantity
        const qty = (req.quantity_expectations as any)?.estimatedQuantity;
        if (qty) setCobuyQuantity(qty);

        // Apply colors to store
        const colorSelections = req.freeform_color_selections as Record<string, any> | null;
        if (colorSelections) {
          const store = useCanvasStore.getState();
          if (colorSelections._productColor?.hex) {
            store.setProductColor(colorSelections._productColor.hex);
          }
          for (const sideId of Object.keys(colorSelections)) {
            if (sideId === '_productColor') continue;
            const sideColors = colorSelections[sideId];
            if (!sideColors || typeof sideColors !== 'object') continue;
            for (const [layerId, hex] of Object.entries(sideColors)) {
              if (typeof hex === 'string') {
                store.setLayerColor(sideId, layerId, hex);
              }
            }
          }
        }

        // When no admin design exists, use freeform canvas state as the starting design
        if (!designId) {
          const freeformState = req.freeform_canvas_state as Record<string, any> | null;
          if (freeformState) {
            const states: Record<string, string> = {};
            for (const [sideId, raw] of Object.entries(freeformState)) {
              states[sideId] = typeof raw === 'string' ? raw : JSON.stringify(raw);
            }
            setCanvasStates(states);
          }
        }
      } catch (err) {
        console.error('Failed to apply CoBuy data:', err);
      }
    };

    applyCobuyData();
  }, [cobuyRequestId, designId]);

  // Sync editing state with canvas store
  useEffect(() => {
    setEditMode(isEditing);
    return () => setEditMode(false);
  }, [isEditing, setEditMode]);

  // Sync loaded product color to global store so saveOrderMode and
  // handleToggleEdit snapshot capture the correct value instead of default #FFFFFF
  useEffect(() => {
    if ((mode === 'order' || mode === 'design') && editorData.productColor && !editorData.loading) {
      setStoreProductColor(editorData.productColor);
    }
  }, [mode, editorData.productColor, editorData.loading, setStoreProductColor]);

  // Reset color filter states when leaving the editor
  useEffect(() => {
    return () => {
      useCanvasStore.setState({
        productColor: '#FFFFFF',
        layerColors: {},
        objectPrintMethods: {},
      });
    };
  }, []);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Set initial active side when product loads
  useEffect(() => {
    const sides = editorData.product?.configuration || [];
    if (sides.length > 0) {
      setActiveSide(sides[0].id);
    }
  }, [editorData.product, setActiveSide]);

  // Update canvas states from data
  useEffect(() => {
    if (Object.keys(editorData.canvasStates).length > 0) {
      setCanvasStates(editorData.canvasStates);
    }
  }, [editorData.canvasStates]);

  // Update design form when savedDesign changes
  useEffect(() => {
    const saved = editorData.savedDesign;
    if (saved && mode === 'design') {
      setDesignTitle(saved.title || '');
    }
  }, [editorData.savedDesign, mode]);

  // Pre-fill design title for partner mall add mode
  useEffect(() => {
    if (partnerMallAddData) {
      setDesignTitle(partnerMallAddData.displayName);
    }
  }, [partnerMallAddData]);

  // Update template form when selectedTemplate changes
  useEffect(() => {
    const tmpl = editorData.selectedTemplate;
    if (tmpl) {
      setTemplateTitle(tmpl.title);
      setTemplateDescription(tmpl.description || '');
      setTemplateSortOrder(tmpl.sort_order ?? 0);
      setTemplateIsActive(tmpl.is_active ?? true);
      setIsCreatingTemplate(false);
      // Update canvas states for rendering
      const parsed: Record<string, CanvasState | string | null> = {};
      if (tmpl.canvas_state) {
        Object.entries(tmpl.canvas_state).forEach(([sideId, state]) => {
          parsed[sideId] = state as CanvasState | string;
        });
      }
      setCanvasStates(parsed);
    }
  }, [editorData.selectedTemplate]);

  // Save hook
  const { handleSave: executeSave } = useEditorSave({
    mode,
    product: editorData.product,
    orderItem: editorData.orderItem,
    savedDesign: editorData.savedDesign,
    selectedTemplate: editorData.selectedTemplate,
    designTitle,
    templateTitle,
    templateDescription,
    templateSortOrder,
    templateIsActive,
    presetType,
  });

  // Save to partner mall (override for partnerMallAdd mode)
  const handleSaveToPartnerMall = useCallback(async () => {
    if (!partnerMallAddData || !editorData.product) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const { canvasMap: currentCanvasMap, layerColors } = useCanvasStore.getState();
      const sides = editorData.product.configuration || [];

      // Serialize canvas state
      const canvasState: Record<string, string> = {};
      for (const side of sides) {
        const canvas = currentCanvasMap[side.id];
        if (canvas) {
          canvasState[side.id] = serializeCanvasState(canvas, layerColors[side.id] || {});
        }
      }

      // Generate preview
      let previewUrl: string | null = null;
      const firstCanvas = currentCanvasMap[sides[0]?.id];
      if (firstCanvas) {
        try {
          firstCanvas.discardActiveObject();
          firstCanvas.renderAll();
          previewUrl = firstCanvas.toDataURL({ format: 'png', quality: 0.8, multiplier: 0.5 });
        } catch (err) {
          console.error('Error generating preview:', err);
        }
      }

      const response = await fetch('/api/admin/partner-malls/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_mall_id: partnerMallAddData.partnerMallId,
          product_id: productId,
          logo_placements: {},
          canvas_state: canvasState,
          preview_url: previewUrl,
          display_name: partnerMallAddData.displayName,
          manufacturer_color_id: partnerMallAddData.manufacturerColorId,
          color_hex: partnerMallAddData.colorHex,
          color_name: partnerMallAddData.colorName,
          color_code: partnerMallAddData.colorCode,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '제품 추가에 실패했습니다.');
      }

      router.push(returnUrl || `/partner_malls/${partnerMallAddData.partnerMallId}`);
    } catch (err) {
      console.error('Save to partner mall error:', err);
      setSaveError(err instanceof Error ? err.message : '제품 추가에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }, [partnerMallAddData, editorData.product, productId, router, returnUrl]);

  // Handle save
  const handleSave = useCallback(async () => {
    // Override save for partner mall add mode
    if (partnerMallAddData) {
      return handleSaveToPartnerMall();
    }

    setIsSaving(true);
    setSaveError(null);

    const result = await executeSave();

    setIsSaving(false);

    if (result.success) {
      if (mode === 'order') {
        // Update local canvas states and orderItem with saved data (includes productColor)
        if (result.canvasState) {
          setCanvasStates(result.canvasState as Record<string, CanvasState | string | null>);
          editorData.updateOrderItemCanvasState(result.canvasState);
        }
        editSnapshotRef.current = {};
        setIsEditing(false);
      } else if (mode === 'design') {
        // Auto-link design to cobuy request if opened from one
        if (cobuyRequestId && result.id) {
          try {
            const sides = editorData.product?.configuration || [];
            // Generate preview images for all sides
            const previewImages: Record<string, { base64: string; name: string }> = {};
            for (const side of sides) {
              const canvas = canvasMap[side.id];
              if (!canvas) continue;
              try {
                canvas.discardActiveObject();
                canvas.renderAll();
                const base64 = canvas.toDataURL({ format: 'png', quality: 0.8, multiplier: 0.5 });
                previewImages[side.id] = { base64, name: side.name };
              } catch (err) {
                console.error(`Error generating preview for side ${side.id}:`, err);
              }
            }

            await fetch('/api/admin/cobuy/requests', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: cobuyRequestId,
                admin_design_id: result.id,
                preview_images: previewImages,
              }),
            });
            setCobuyDesignSaved(true);
          } catch (err) {
            console.error('Failed to link design to cobuy request:', err);
          }
        }

        // Only navigate back if not CoBuy (CoBuy shows pricing send UI)
        if (!cobuyRequestId) {
          if (returnUrl && result.id) {
            const separator = returnUrl.includes('?') ? '&' : '?';
            router.push(`${returnUrl}${separator}designId=${result.id}`);
          } else {
            router.back();
          }
        }
      } else if (mode === 'template') {
        // Refresh templates list
        await editorData.refetchTemplates();
      }
    } else {
      setSaveError(result.error || '저장에 실패했습니다.');
    }
  }, [executeSave, mode, router, returnUrl, cobuyRequestId, editorData, partnerMallAddData, handleSaveToPartnerMall]);

  // Handle edit toggle (order mode) — snapshot on enter, restore on cancel
  const colorSnapshotRef = useRef<string>('#FFFFFF');

  const handleToggleEdit = useCallback(() => {
    if (!isEditing) {
      // Entering edit mode — snapshot all canvases and store color
      const snapshot: Record<string, object> = {};
      Object.entries(canvasMap).forEach(([sideId, canvas]) => {
        snapshot[sideId] = canvas.toJSON();
      });
      editSnapshotRef.current = snapshot;
      colorSnapshotRef.current = useCanvasStore.getState().productColor;
      setIsEditing(true);
    } else {
      // Cancelling edit mode — restore from snapshot and revert color
      Object.entries(editSnapshotRef.current).forEach(([sideId, json]) => {
        const canvas = canvasMap[sideId];
        if (canvas) {
          canvas.discardActiveObject();
          canvas.loadFromJSON(json).then(() => {
            canvas.requestRenderAll();
          });
        }
      });
      setStoreProductColor(colorSnapshotRef.current);
      editSnapshotRef.current = {};
      setSelectedTextObject(null);
      setIsEditing(false);
    }
    setSaveError(null);
  }, [isEditing, canvasMap, setStoreProductColor]);

  // Handle selected object change
  const handleSelectedObjectChange = useCallback((obj: fabric.FabricObject | null) => {
    setSelectedTextObject(obj);
  }, []);

  // Exit edit mode (deselect all objects)
  const handleExitEditMode = useCallback(() => {
    Object.values(canvasMap).forEach((canvas) => {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    });
  }, [canvasMap]);

  // Handle download all (order mode)
  const handleDownloadAll = useCallback(async () => {
    if (!editorData.orderItem || isDownloading) return;
    setIsDownloading(true);

    try {
      const orderItem = editorData.orderItem;
      const imageUrlsBySide = coerceImageUrlsBySide(orderItem.image_urls);
      const customFonts = coerceCustomFonts(orderItem.custom_fonts);
      const textSvgExports = coerceTextSvgExports(orderItem.text_svg_exports);
      const textSvgSideUrls: Record<string, string> = {};
      Object.entries(textSvgExports).forEach(([sideId, value]) => {
        if (sideId === '__objects') return;
        if (typeof value !== 'string' || !value) return;
        textSvgSideUrls[sideId] = value;
      });
      const textSvgObjectUrlsBySide = coerceTextSvgObjectUrlsBySide(textSvgExports.__objects);

      const files: Array<{ type: 'blob'; blob: Blob; filename: string } | { type: 'url'; url: string; filename: string }> = [];
      const seenUrls = new Set<string>();
      const prefix = `order-${orderItem.id}`;

      // Image URLs
      Object.entries(imageUrlsBySide).forEach(([sideId, images]) => {
        images.forEach((image, index) => {
          if (!image?.url || seenUrls.has(image.url)) return;
          seenUrls.add(image.url);
          const ext = getFileExtensionFromName(image.path?.split('/').pop()) || getFileExtensionFromUrl(image.url) || 'jpg';
          files.push({ type: 'url', url: image.url, filename: buildFilename(`${prefix}-${sideId}-image-${index + 1}`, ext) });
        });
      });

      // Text SVG URLs
      Object.entries(textSvgSideUrls).forEach(([sideId, url]) => {
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        files.push({ type: 'url', url, filename: `${prefix}-${sideId}-text.svg` });
      });

      Object.entries(textSvgObjectUrlsBySide).forEach(([sideId, objectMap]) => {
        Object.entries(objectMap).forEach(([objectId, url]) => {
          if (!url || seenUrls.has(url)) return;
          seenUrls.add(url);
          files.push({ type: 'url', url, filename: `${prefix}-${sideId}-text-${sanitizeFilenameSegment(objectId)}.svg` });
        });
      });

      // Fallback: generate SVGs from canvas state if no tracked SVGs
      const hasTrackedSvgs = Object.keys(textSvgSideUrls).length > 0 || Object.keys(textSvgObjectUrlsBySide).length > 0;
      if (!hasTrackedSvgs) {
        Object.entries(orderItem.canvas_state || {}).forEach(([sideId, stateRaw]) => {
          const state = parseCanvasState(stateRaw);
          if (!state || !Array.isArray(state.objects)) return;
          const svg = getTextSvgFromCanvasState(state, sideId);
          if (!svg) return;
          files.push({ type: 'blob', blob: new Blob([svg], { type: 'image/svg+xml' }), filename: `${prefix}-${sideId}-text.svg` });
        });
      }

      // Fallback: extract image URLs from canvas state if no tracked images
      const hasTrackedImages = Object.keys(imageUrlsBySide).length > 0;
      if (!hasTrackedImages) {
        Object.entries(orderItem.canvas_state || {}).forEach(([sideId, stateRaw]) => {
          const state = parseCanvasState(stateRaw);
          if (!state || !Array.isArray(state.objects)) return;
          let imageIndex = 0;
          state.objects.forEach((obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.data?.id === 'background-product-image') return;
            const objectType = typeof obj.type === 'string' ? obj.type.toLowerCase() : '';
            if (objectType !== 'image') return;
            imageIndex++;
            const data = obj.data as { supabaseUrl?: string; originalFileUrl?: string; originalFileName?: string; fileType?: string } | undefined;
            const url = data?.supabaseUrl || data?.originalFileUrl || obj.src;
            if (url && !seenUrls.has(url)) {
              seenUrls.add(url);
              const ext = getFileExtensionFromName(data?.originalFileName) || getFileExtensionFromUrl(url) || getFileExtensionFromType(data?.fileType) || 'png';
              files.push({ type: 'url', url, filename: buildFilename(`${prefix}-${sideId}-image-${imageIndex}`, ext) });
            }
          });
        });
      }

      // Custom fonts
      customFonts.forEach((font) => {
        if (!font.url || seenUrls.has(font.url)) return;
        seenUrls.add(font.url);
        const ext = font.format || getFileExtensionFromUrl(font.url) || 'ttf';
        files.push({ type: 'url', url: font.url, filename: buildFilename(`${prefix}-font-${sanitizeFilenameSegment(font.fontFamily)}`, ext) });
      });

      if (files.length === 0) {
        alert('다운로드할 파일이 없습니다.');
        return;
      }

      for (const file of files) {
        if (file.type === 'blob') {
          downloadBlob(file.blob, file.filename);
        } else {
          await downloadUrl(file.url, file.filename);
        }
        await sleep(120);
      }
    } finally {
      setIsDownloading(false);
    }
  }, [editorData.orderItem, isDownloading]);

  // Template mode: select template
  const handleSelectTemplate = useCallback((template: DesignTemplate | null) => {
    editorData.setSelectedTemplate(template);
    setIsCreatingTemplate(false);
  }, [editorData]);

  // Template mode: create new
  const handleCreateNewTemplate = useCallback(() => {
    editorData.setSelectedTemplate(null);
    setIsCreatingTemplate(true);
    setTemplateTitle('');
    setTemplateDescription('');
    setTemplateSortOrder(editorData.templates.length);
    setTemplateIsActive(true);
    setCanvasStates({});
  }, [editorData]);

  // Template mode: delete
  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/admin/design-templates?id=${templateId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('삭제에 실패했습니다.');

      editorData.setSelectedTemplate(null);
      setIsCreatingTemplate(false);
      await editorData.refetchTemplates();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  }, [editorData]);

  // Loading state
  if (editorData.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (editorData.error || !editorData.product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{editorData.error || '제품 정보를 불러올 수 없습니다.'}</p>
          <button
            onClick={() => router.push(modeConfig.backUrl)}
            className="px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  const product = editorData.product;
  const sides = product.configuration || [];

  // Determine effective toolbar visibility
  const showToolbar = mode === 'order'
    ? isEditing
    : modeConfig.showToolbar;

  // Overlay widths for canvas centering (desktop only, 0 on mobile)
  const TOOLBAR_W = 36; // w-9
  const PANEL_W_NARROW = 288; // w-72
  const PANEL_W_WIDE = 480; // w-120

  // On mobile (< md breakpoint ~768px), panels are overlays so width = 0
  // On desktop, use actual panel widths
  const rightPanelWidth = isMobile ? 0 : (mode === 'order' && !isEditing ? PANEL_W_WIDE : PANEL_W_NARROW);
  const leftToolbarWidth = isMobile ? 0 : (showToolbar && isEditing ? TOOLBAR_W : 0);

  return (
    <div className="h-screen relative overflow-hidden bg-neutral-700">
      {/* Full-screen canvas workspace */}
      <EditorCanvas
        sides={sides}
        isEditing={isEditing}
        canvasStates={mode === 'design' && !designId && !cobuyRequestId ? undefined : canvasStates}
        productColor={mode === 'order' || mode === 'design' ? editorData.productColor : undefined}
        customFonts={editorData.customFonts.length > 0 ? editorData.customFonts : undefined}
        rightPanelWidth={rightPanelWidth}
        leftToolbarWidth={leftToolbarWidth}
        productId={productId}
      />

      {/* Floating UI overlay */}
      <div className="relative z-10 h-full flex flex-col pointer-events-none">
        {/* Header */}
        <div className="pointer-events-auto shrink-0">
          <EditorHeader
            modeConfig={modeConfig}
            isEditing={isEditing}
            isSaving={isSaving}
            onToggleEdit={mode === 'order' ? handleToggleEdit : undefined}
            onSave={handleSave}
            onDownload={mode === 'order' ? handleDownloadAll : undefined}
            isDownloading={isDownloading}
            saveError={saveError}
            showSketchToggle={false}
            isSketchOpen={false}
            onToggleSketch={() => {}}
          />
          {mode === 'order' && isEditing && (
            <div className="text-[11px] text-amber-700 bg-amber-50/90 backdrop-blur-sm border-b border-amber-200 px-3 py-1">
              편집 모드 — 객체 이동/크기 조절, 스크롤 확대/축소, Space+드래그 이동
            </div>
          )}
          {/* Mobile horizontal toolbar */}
          {showToolbar && isEditing && isMobile && (
            <Toolbar
              sides={sides}
              handleExitEditMode={handleExitEditMode}
              variant="editor"
              horizontal
              productId={productId}
              onSelectedObjectChange={handleSelectedObjectChange}
            />
          )}
        </div>

        {/* Workspace area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left toolbar (hidden on mobile) */}
          {showToolbar && isEditing && !isMobile && (
            <div className="pointer-events-auto flex">
              <Toolbar
                sides={sides}
                handleExitEditMode={handleExitEditMode}
                variant="editor"
                productId={productId}
                onSelectedObjectChange={handleSelectedObjectChange}
              />
            </div>
          )}


          {/* Spacer */}
          <div className="flex-1" />

          {/* Right panel */}
          <div className="pointer-events-auto flex">
            <EditorRightPanel wide={mode === 'order' && !isEditing}>
              {mode === 'design' && (
                <DesignModePanel
                  product={product}
                  productColors={editorData.productColors}
                  designTitle={designTitle}
                  onDesignTitleChange={setDesignTitle}
                  selectedTextObject={selectedTextObject}
                  onSave={handleSave}
                  isSaving={isSaving}
                  cobuyRequestId={cobuyRequestId}
                  designSaved={cobuyDesignSaved}
                  cobuyQuantity={cobuyQuantity}
                />
              )}

              {mode === 'order' && editorData.orderItem && (
                isEditing ? (
                  <OrderEditPanel
                    product={product}
                    productColors={editorData.productColors}
                    selectedTextObject={selectedTextObject}
                    onSave={handleSave}
                    isSaving={isSaving}
                  />
                ) : isFactoryUser && orderId && orderItemId ? (
                  <>
                    {/* Factory user tabs */}
                    <div className="flex border-b border-gray-200 shrink-0 sticky top-0 z-10 bg-white">
                      <button
                        onClick={() => setFactoryTab('design')}
                        className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
                          factoryTab === 'design'
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        디자인 정보
                      </button>
                      <button
                        onClick={() => setFactoryTab('order')}
                        className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
                          factoryTab === 'order'
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        주문 정보
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {factoryTab === 'design' ? (
                        <OrderModePanel
                          product={product}
                          orderItem={editorData.orderItem}
                          productColors={editorData.productColors}
                          orderId={orderId}
                        />
                      ) : (
                        <FactoryOrderInfoPanel
                          orderId={orderId}
                          currentOrderItemId={orderItemId}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <OrderModePanel
                    product={product}
                    orderItem={editorData.orderItem}
                    productColors={editorData.productColors}
                    orderId={orderId}
                  />
                )
              )}

              {mode === 'template' && (
                <TemplateModePanel
                  product={product}
                  templates={editorData.templates}
                  selectedTemplate={editorData.selectedTemplate}
                  onSelectTemplate={handleSelectTemplate}
                  onCreateNew={handleCreateNewTemplate}
                  selectedTextObject={selectedTextObject}
                  templateTitle={templateTitle}
                  onTemplateTitleChange={setTemplateTitle}
                  templateDescription={templateDescription}
                  onTemplateDescriptionChange={setTemplateDescription}
                  templateSortOrder={templateSortOrder}
                  onTemplateSortOrderChange={setTemplateSortOrder}
                  templateIsActive={templateIsActive}
                  onTemplateIsActiveChange={setTemplateIsActive}
                  onSave={handleSave}
                  onDelete={handleDeleteTemplate}
                  isSaving={isSaving}
                  isCreating={isCreatingTemplate}
                />
              )}
            </EditorRightPanel>
          </div>
        </div>
      </div>
    </div>
  );
}
