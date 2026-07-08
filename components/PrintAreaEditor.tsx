'use client';

import { useState, useRef, useEffect } from 'react';
import { Product, ProductSide } from '@/types/types';
import { Save, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface PrintAreaEditorProps {
  product: Product;
  onSave: (updatedProduct: Product) => void;
  onCancel: () => void;
  saveLabel?: string;
  savingLabel?: string;
  saveHelpText?: string;
  onPersist?: (sides: ProductSide[]) => Promise<Product | null | void>;
  /** 외부에서 시작/현재 면을 지정 (캘리브 도구에서 상단 '면' 선택과 동기화 용). */
  initialSideId?: string;
  /** 내부 캐러셀(◀▶)로 면을 바꿀 때 부모에 알림 — 외부 면 선택기(캘리브 드롭다운)와 양방향 동기화. */
  onSideChange?: (sideId: string) => void;
}

export default function PrintAreaEditor({
  product,
  onSave,
  onCancel,
  saveLabel = '저장',
  savingLabel,
  saveHelpText,
  onPersist,
  initialSideId,
  onSideChange,
}: PrintAreaEditorProps) {
  const [currentSideIndex, setCurrentSideIndex] = useState(() => {
    if (initialSideId) {
      const i = (product.configuration || []).findIndex((s) => s.id === initialSideId);
      if (i >= 0) return i;
    }
    return 0;
  });
  const [sides, setSides] = useState<ProductSide[]>(product.configuration || []);

  // Reset the working copy ONLY when the product itself changes (entering a
  // different product). NEVER reset on a mere side switch — doing so silently
  // discarded unsaved printArea edits to other sides (the cause of "I drew the
  // box for back/left/right but it reset"). The calibration tool drives the
  // active side via initialSideId, so switching sides must NOT touch `sides`.
  useEffect(() => {
    setSides(product.configuration || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // Move the active side on external side change, preserving in-progress edits.
  useEffect(() => {
    if (!initialSideId) return;
    const i = (product.configuration || []).findIndex((s) => s.id === initialSideId);
    if (i >= 0) setCurrentSideIndex(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSideId]);
  const [saving, setSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  const currentSide = sides[currentSideIndex];

  // Change side via the internal carousel AND notify the parent, so an external
  // side selector (calibration tool dropdown) stays in sync.
  const goToSide = (index: number) => {
    const clamped = Math.max(0, Math.min(sides.length - 1, index));
    setCurrentSideIndex(clamped);
    const sid = sides[clamped]?.id;
    if (sid) onSideChange?.(sid);
  };

  const resolveBaseImageUrl = (side: ProductSide) => {
    if (side.imageUrl) return side.imageUrl;
    const layers = Array.isArray(side.layers) ? side.layers : [];
    if (layers.length === 0) return '';
    const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    return sortedLayers.find((layer) => layer.imageUrl)?.imageUrl || '';
  };

  useEffect(() => {
    if (currentSide) {
      drawCanvas();
    }
  }, [currentSide, imageLoaded, scale]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseImageUrl = resolveBaseImageUrl(currentSide);
    if (!baseImageUrl) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setImageLoaded(false);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = baseImageUrl;

    img.onload = () => {
      // Set canvas size based on container
      const container = containerRef.current;
      if (!container) return;

      const maxWidth = container.clientWidth - 32;
      const maxHeight = 600;

      // Calculate base scale to fit the image in the container
      const scaleFactor = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      setScale(scaleFactor);

      // Set canvas to a fixed size (matching the container)
      canvas.width = img.width * scaleFactor;
      canvas.height = img.height * scaleFactor;

      // Draw product image centered on canvas
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw print area overlay
      // The print area coordinates are in the original image pixel space
      const pa = currentSide.printArea;

      // Scale the print area coordinates
      const scaledPrintX = pa.x * scaleFactor;
      const scaledPrintY = pa.y * scaleFactor;
      const scaledPrintW = pa.width * scaleFactor;
      const scaledPrintH = pa.height * scaleFactor;

      // Draw print area rectangle
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(scaledPrintX, scaledPrintY, scaledPrintW, scaledPrintH);

      // Fill with semi-transparent overlay
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.fillRect(scaledPrintX, scaledPrintY, scaledPrintW, scaledPrintH);

      // Draw resize handles at the corners of the print area
      ctx.setLineDash([]);
      const handleSize = 10;
      const handles = [
        { x: pa.x, y: pa.y, cursor: 'nw-resize' },
        { x: pa.x + pa.width, y: pa.y, cursor: 'ne-resize' },
        { x: pa.x, y: pa.y + pa.height, cursor: 'sw-resize' },
        { x: pa.x + pa.width, y: pa.y + pa.height, cursor: 'se-resize' },
      ];

      handles.forEach(handle => {
        ctx.fillStyle = '#3B82F6';
        ctx.fillRect(
          handle.x * scaleFactor - handleSize / 2,
          handle.y * scaleFactor - handleSize / 2,
          handleSize,
          handleSize
        );
      });

      setImageLoaded(true);
    };

    img.onerror = () => {
      console.error('Failed to load product image:', baseImageUrl);
      setImageLoaded(false);
    };
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    const pa = currentSide.printArea;
    const handleSize = 10 / scale;

    // Check if clicking on resize handles
    const handles = [
      { id: 'nw', x: pa.x, y: pa.y },
      { id: 'ne', x: pa.x + pa.width, y: pa.y },
      { id: 'sw', x: pa.x, y: pa.y + pa.height },
      { id: 'se', x: pa.x + pa.width, y: pa.y + pa.height },
    ];

    for (const handle of handles) {
      if (
        Math.abs(coords.x - handle.x) <= handleSize &&
        Math.abs(coords.y - handle.y) <= handleSize
      ) {
        setIsResizing(true);
        setResizeHandle(handle.id);
        setDragStart({ x: coords.x, y: coords.y });
        return;
      }
    }

    // Check if clicking inside print area for dragging
    if (
      coords.x >= pa.x &&
      coords.x <= pa.x + pa.width &&
      coords.y >= pa.y &&
      coords.y <= pa.y + pa.height
    ) {
      setIsDragging(true);
      setDragStart({ x: coords.x - pa.x, y: coords.y - pa.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      const newSides = [...sides];
      const newX = Math.max(0, coords.x - dragStart.x);
      const newY = Math.max(0, coords.y - dragStart.y);

      newSides[currentSideIndex] = {
        ...currentSide,
        printArea: {
          ...currentSide.printArea,
          x: Math.round(newX),
          y: Math.round(newY),
        },
      };
      setSides(newSides);
    } else if (isResizing && resizeHandle) {
      const newSides = [...sides];
      const pa = { ...currentSide.printArea };

      switch (resizeHandle) {
        case 'nw':
          pa.width = pa.width + (pa.x - coords.x);
          pa.height = pa.height + (pa.y - coords.y);
          pa.x = coords.x;
          pa.y = coords.y;
          break;
        case 'ne':
          pa.width = coords.x - pa.x;
          pa.height = pa.height + (pa.y - coords.y);
          pa.y = coords.y;
          break;
        case 'sw':
          pa.width = pa.width + (pa.x - coords.x);
          pa.height = coords.y - pa.y;
          pa.x = coords.x;
          break;
        case 'se':
          pa.width = coords.x - pa.x;
          pa.height = coords.y - pa.y;
          break;
      }

      // Ensure minimum size
      pa.width = Math.max(50, Math.round(pa.width));
      pa.height = Math.max(50, Math.round(pa.height));
      pa.x = Math.max(0, Math.round(pa.x));
      pa.y = Math.max(0, Math.round(pa.y));

      newSides[currentSideIndex] = {
        ...currentSide,
        printArea: pa,
      };
      setSides(newSides);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (onPersist) {
        const updatedProduct = await onPersist(sides);
        onSave((updatedProduct ?? { ...product, configuration: sides }) as Product);
        return;
      }

      const response = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: product.id, configuration: sides }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '제품 저장에 실패했습니다.');
      }

      const payload = await response.json();
      onSave(payload?.data as Product);
    } catch (error) {
      console.error('Error saving product:', error);
      const message = error instanceof Error ? error.message : '제품 저장 중 오류가 발생했습니다.';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const updatePrintAreaField = (field: string, value: number) => {
    const newSides = [...sides];
    const newPrintArea = {
      ...currentSide.printArea,
      [field]: Math.max(0, Math.round(value)),
    };

    newSides[currentSideIndex] = {
      ...currentSide,
      printArea: newPrintArea,
    };
    setSides(newSides);
  };

  const updateRealLifeDimensions = (field: string, value: number) => {
    const v = Math.max(0, Math.round(value));
    const base = {
      ...(currentSide.realLifeDimensions || { productWidthMm: 0 }),
      [field]: v,
    } as { productWidthMm: number; printAreaWidthMm?: number; printAreaHeightMm?: number };

    // Print-area real mm is a single uniform px→mm scale, so the rectangle's
    // pixel aspect ratio fully determines the paired dimension. Editing width
    // auto-derives height and vice versa — guarantees px↔mm consistency and
    // removes the risk of entering a height that doesn't match the ratio.
    const pw = currentSide.printArea?.width || 0;
    const ph = currentSide.printArea?.height || 0;
    if (pw > 0 && ph > 0 && v > 0) {
      if (field === 'printAreaWidthMm') {
        base.printAreaHeightMm = Math.round(v * (ph / pw));
      } else if (field === 'printAreaHeightMm') {
        base.printAreaWidthMm = Math.round(v * (pw / ph));
      }
    }

    const newSides = [...sides];
    newSides[currentSideIndex] = {
      ...currentSide,
      realLifeDimensions: base,
    };
    setSides(newSides);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">인쇄 영역 편집</h2>
          <p className="text-sm text-gray-500 mt-1">{product.title}</p>
          {saveHelpText && (
            <p className="text-xs text-indigo-700 mt-1">{saveHelpText}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            {saving ? (savingLabel ?? `${saveLabel} 중...`) : saveLabel}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Canvas Area */}
        <div className="lg:col-span-2 space-y-4">
          {/* Side Navigation */}
          <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <button
                onClick={() => goToSide(currentSideIndex - 1)}
                disabled={currentSideIndex === 0}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="text-center">
                <h3 className="font-semibold text-gray-900">{currentSide?.name}</h3>
                <p className="text-sm text-gray-500">
                  {currentSideIndex + 1} / {sides.length}
                </p>
              </div>

              <button
                onClick={() => goToSide(currentSideIndex + 1)}
                disabled={currentSideIndex === sides.length - 1}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div ref={containerRef} className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="mx-auto border border-gray-200 rounded cursor-move"
              style={{ maxWidth: '100%' }}
            />
            <p className="text-sm text-gray-500 mt-4 text-center">
              파란 영역을 드래그하여 위치를 조정하고, 모서리를 드래그하여 크기를 조절하세요.
            </p>
          </div>
        </div>

        {/* Controls Panel */}
        <div className="space-y-4">
          {/* Print Area Coordinates */}
          <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">인쇄 영역 (픽셀)</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">X 위치</label>
                <input
                  type="number"
                  value={currentSide?.printArea.x || 0}
                  onChange={(e) => updatePrintAreaField('x', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Y 위치</label>
                <input
                  type="number"
                  value={currentSide?.printArea.y || 0}
                  onChange={(e) => updatePrintAreaField('y', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">너비</label>
                <input
                  type="number"
                  value={currentSide?.printArea.width || 0}
                  onChange={(e) => updatePrintAreaField('width', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">높이</label>
                <input
                  type="number"
                  value={currentSide?.printArea.height || 0}
                  onChange={(e) => updatePrintAreaField('height', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Real Life Dimensions */}
          <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-1">인쇄영역 실제 치수 (mm) <span className="text-xs font-normal text-indigo-600">· 환산 1순위</span></h3>
            <p className="text-xs text-gray-500 mb-1">공장 인쇄 스펙 그대로 입력하세요. 이 값으로 정확한 크기 환산이 이뤄집니다.</p>
            <p className="text-xs text-indigo-600 mb-3">너비·높이는 인쇄영역 픽셀 비율로 <b>자동 연동</b>됩니다 — 한쪽만 입력하면 나머지가 맞춰집니다.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">인쇄영역 너비 (mm)</label>
                <input
                  type="number"
                  value={currentSide?.realLifeDimensions?.printAreaWidthMm || 0}
                  onChange={(e) => updateRealLifeDimensions('printAreaWidthMm', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  인쇄영역 높이 (mm)
                  <span className="text-xs font-normal text-gray-400"> · 너비와 자동 연동</span>
                </label>
                <input
                  type="number"
                  value={currentSide?.realLifeDimensions?.printAreaHeightMm || 0}
                  onChange={(e) => updateRealLifeDimensions('printAreaHeightMm', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                />
              </div>
              {currentSide?.printArea?.width > 0 && currentSide?.printArea?.height > 0 && (
                <p className="text-xs text-gray-500">
                  인쇄영역 픽셀: {currentSide.printArea.width}×{currentSide.printArea.height}px
                  {(currentSide?.realLifeDimensions?.printAreaWidthMm || 0) > 0 && (
                    <> · 환산 비율 {(((currentSide.realLifeDimensions!.printAreaWidthMm || 0) / currentSide.printArea.width)).toFixed(3)} mm/px</>
                  )}
                </p>
              )}
              <details className="pt-2 border-t border-gray-100">
                <summary className="text-sm font-medium text-gray-500 cursor-pointer select-none">제품 전체 너비 (mm) <span className="text-xs">· 레거시 · 선택</span></summary>
                <p className="text-xs text-gray-400 mt-1 mb-1">인쇄영역 실측을 입력하면 환산에 사용되지 않습니다. 인쇄영역 실측이 없는 제품의 폴백용입니다.</p>
                <input
                  type="number"
                  value={currentSide?.realLifeDimensions?.productWidthMm || 0}
                  onChange={(e) => updateRealLifeDimensions('productWidthMm', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                />
              </details>
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 rounded-md p-4">
            <h4 className="font-medium text-blue-900 mb-2">사용 방법</h4>
            <ul className="list-disc pl-5 text-sm text-blue-800 space-y-1">
              <li>파란 영역을 드래그하여 이동</li>
              <li>모서리 핸들을 드래그하여 크기 조절</li>
              <li>숫자 입력으로 정밀한 조정</li>
              <li>제품 너비(mm)를 설정하면 인쇄 영역 치수가 자동 계산됩니다</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
