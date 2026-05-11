'use client';

import { Plus, Trash2, Eye, EyeOff, Save, Tag, X } from 'lucide-react';
import { DesignTemplate, Product, ProductSide } from '@/types/types';
import { useCanvasStore } from '@/store/useCanvasStore';
import TextStylePanel from '@/components/canvas/TextStylePanel';
import LayerColorSelector from '@/components/canvas/LayerColorSelector';
import { isCurvedText } from '@/lib/curvedText';
import * as fabric from 'fabric';
import { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_LABELS } from '@/lib/templateCategories';
import { useState } from 'react';

interface TemplateModePanelProps {
  product: Product;
  templates: DesignTemplate[];
  selectedTemplate: DesignTemplate | null;
  onSelectTemplate: (template: DesignTemplate | null) => void;
  onCreateNew: () => void;
  selectedTextObject: fabric.FabricObject | null;
  templateTitle: string;
  onTemplateTitleChange: (title: string) => void;
  templateDescription: string;
  onTemplateDescriptionChange: (desc: string) => void;
  templateSortOrder: number;
  onTemplateSortOrderChange: (order: number) => void;
  templateIsActive: boolean;
  onTemplateIsActiveChange: (active: boolean) => void;
  templateCategory: string | null;
  onTemplateCategoryChange: (cat: string | null) => void;
  templateTags: string[];
  onTemplateTagsChange: (tags: string[]) => void;
  templateIsFeatured: boolean;
  onTemplateIsFeaturedChange: (v: boolean) => void;
  templateImageSlots: Record<string, unknown>[];
  onTemplateImageSlotsChange: (slots: Record<string, unknown>[]) => void;
  templateTextSlots: Record<string, unknown>[];
  onTemplateTextSlotsChange: (slots: Record<string, unknown>[]) => void;
  onSave: () => void;
  onDelete?: (templateId: string) => void;
  isSaving: boolean;
  isCreating: boolean;
}

export default function TemplateModePanel({
  product,
  templates,
  selectedTemplate,
  onSelectTemplate,
  onCreateNew,
  selectedTextObject,
  templateTitle,
  onTemplateTitleChange,
  templateDescription,
  onTemplateDescriptionChange,
  templateSortOrder,
  onTemplateSortOrderChange,
  templateIsActive,
  onTemplateIsActiveChange,
  templateCategory,
  onTemplateCategoryChange,
  templateTags,
  onTemplateTagsChange,
  templateIsFeatured,
  onTemplateIsFeaturedChange,
  templateImageSlots,
  onTemplateImageSlotsChange,
  templateTextSlots,
  onTemplateTextSlotsChange,
  onSave,
  onDelete,
  isSaving,
  isCreating,
}: TemplateModePanelProps) {
  const [tagInput, setTagInput] = useState('');
  const [slotLabel, setSlotLabel] = useState('');
  const [slotAspect, setSlotAspect] = useState('1');
  const [slotPrintMethod, setSlotPrintMethod] = useState('');
  const [slotAccepts, setSlotAccepts] = useState<'photo' | 'logo'>('photo');
  const [slotBgRemove, setSlotBgRemove] = useState(true);

  const { activeSideId } = useCanvasStore();

  const sides: ProductSide[] = product.configuration || [];
  const currentSide = sides.find((s) => s.id === activeSideId) || sides[0];
  const hasLayers = currentSide?.layers && currentSide.layers.length > 0;

  const isTextSelected = selectedTextObject && (
    selectedTextObject.type === 'i-text' ||
    selectedTextObject.type === 'text' ||
    isCurvedText(selectedTextObject)
  );

  const isEditingTemplate = isCreating || !!selectedTemplate;

  // Selected canvas object for slot tagging (activeSideId already destructured above)
  const { canvasMap } = useCanvasStore();
  const activeCanvas = activeSideId ? canvasMap[activeSideId] : null;
  const selectedCanvasObject = (activeCanvas?.getActiveObject() as fabric.FabricObject & { data?: Record<string, unknown> }) || null;
  const selectedIsImage = selectedCanvasObject?.type === 'image';
  const selectedIsText = !!selectedCanvasObject && (
    selectedCanvasObject.type === 'i-text' ||
    selectedCanvasObject.type === 'text' ||
    selectedCanvasObject.type === 'textbox'
  );
  const selectedSlotId = selectedCanvasObject?.data?.slot_id as string | undefined;
  const selectedSlotEntry = selectedSlotId
    ? [...templateImageSlots, ...templateTextSlots].find((s) => s.slot_id === selectedSlotId)
    : null;

  const generateSlotId = (): string =>
    `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const tagSelectedAsImageSlot = () => {
    if (!selectedCanvasObject || !activeSideId) return;
    if (!slotLabel.trim()) {
      alert('슬롯 라벨을 입력해 주세요.');
      return;
    }
    const slotId = (selectedSlotId as string) || generateSlotId();
    if (!selectedCanvasObject.data) selectedCanvasObject.data = {};
    selectedCanvasObject.data.slot_id = slotId;
    activeCanvas?.requestRenderAll();

    // capture default URL from current image src
    const defaultUrl = (selectedCanvasObject as fabric.FabricImage).getSrc?.() ?? '';
    const newSlot = {
      slot_id: slotId,
      side_id: activeSideId,
      label: slotLabel.trim(),
      default_image_url: defaultUrl,
      aspect_ratio: parseFloat(slotAspect) || 1,
      print_method_id: slotPrintMethod.trim(),
      accepts: slotAccepts,
      bg_removal_default: slotBgRemove,
    };
    const next = templateImageSlots.filter((s) => s.slot_id !== slotId);
    next.push(newSlot);
    onTemplateImageSlotsChange(next);
    setSlotLabel('');
  };

  const tagSelectedAsTextSlot = () => {
    if (!selectedCanvasObject || !activeSideId) return;
    if (!slotLabel.trim()) {
      alert('슬롯 라벨을 입력해 주세요.');
      return;
    }
    const slotId = (selectedSlotId as string) || generateSlotId();
    if (!selectedCanvasObject.data) selectedCanvasObject.data = {};
    selectedCanvasObject.data.slot_id = slotId;
    activeCanvas?.requestRenderAll();

    const newSlot = {
      slot_id: slotId,
      side_id: activeSideId,
      label: slotLabel.trim(),
      lock_style: true,
    };
    const next = templateTextSlots.filter((s) => s.slot_id !== slotId);
    next.push(newSlot);
    onTemplateTextSlotsChange(next);
    setSlotLabel('');
  };

  const removeSlot = (slotId: string) => {
    onTemplateImageSlotsChange(templateImageSlots.filter((s) => s.slot_id !== slotId));
    onTemplateTextSlotsChange(templateTextSlots.filter((s) => s.slot_id !== slotId));
    // Also unstamp on canvas if visible
    if (selectedSlotId === slotId && selectedCanvasObject?.data) {
      delete selectedCanvasObject.data.slot_id;
    }
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    if (templateTags.includes(v)) { setTagInput(''); return; }
    onTemplateTagsChange([...templateTags, v]);
    setTagInput('');
  };


  return (
    <>
      {/* Text Style Panel */}
      {isTextSelected && isEditingTemplate && (
        <div className="p-2.5 border-b">
          <TextStylePanel
            selectedObject={selectedTextObject as fabric.IText}
            onClose={() => {}}
            variant="desktop"
            compact
          />
        </div>
      )}

      {/* Layer Colors */}
      {isEditingTemplate && hasLayers && currentSide?.layers && (
        <div className="p-2.5 border-b">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">레이어 색상</h3>
          <LayerColorSelector sideId={activeSideId || ''} layers={currentSide.layers} compact />
        </div>
      )}

      {/* Template Metadata Form */}
      {isEditingTemplate && (
        <div className="p-2.5 border-b space-y-2.5">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            {isCreating ? '새 템플릿' : '템플릿 정보'}
          </h3>

          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">제목</label>
            <input
              type="text"
              value={templateTitle}
              onChange={(e) => onTemplateTitleChange(e.target.value)}
              placeholder="템플릿 제목"
              className="w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">설명</label>
            <textarea
              value={templateDescription}
              onChange={(e) => onTemplateDescriptionChange(e.target.value)}
              placeholder="템플릿 설명 (선택)"
              rows={2}
              className="w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-gray-400 mb-0.5">정렬</label>
              <input
                type="number"
                value={templateSortOrder}
                onChange={(e) => onTemplateSortOrderChange(parseInt(e.target.value) || 0)}
                className="w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => onTemplateIsActiveChange(!templateIsActive)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  templateIsActive
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-gray-50 text-gray-400 border border-gray-200'
                }`}
              >
                {templateIsActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {templateIsActive ? '활성' : '비활성'}
              </button>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">카테고리</label>
            <select
              value={templateCategory ?? ''}
              onChange={(e) => onTemplateCategoryChange(e.target.value || null)}
              className="w-full px-2 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">(없음)</option>
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{TEMPLATE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-0.5">태그</label>
            <div className="flex gap-1 mb-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="태그 입력 후 Enter"
                className="flex-1 px-2 py-1 border rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button onClick={addTag} className="px-2 rounded bg-gray-100 hover:bg-gray-200 text-[11px]">추가</button>
            </div>
            {templateTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {templateTags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[10px]">
                    #{t}
                    <button
                      onClick={() => onTemplateTagsChange(templateTags.filter((x) => x !== t))}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Featured */}
          <label className="flex items-center gap-1.5 text-[11px] text-gray-700">
            <input
              type="checkbox"
              checked={templateIsFeatured}
              onChange={(e) => onTemplateIsFeaturedChange(e.target.checked)}
            />
            홈/갤러리 상단 노출 (Featured)
          </label>

          {/* Slot manifest tagging */}
          <div className="border-t pt-2 mt-2">
            <h4 className="text-[11px] font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              교체 슬롯 ({templateImageSlots.length + templateTextSlots.length})
            </h4>

            {selectedCanvasObject ? (
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={slotLabel}
                  onChange={(e) => setSlotLabel(e.target.value)}
                  placeholder="라벨 (예: 메인 사진)"
                  className="w-full px-2 py-1 border rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {selectedIsImage && (
                  <>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={slotAspect}
                        onChange={(e) => setSlotAspect(e.target.value)}
                        placeholder="비율 W/H (예: 1)"
                        className="flex-1 px-2 py-1 border rounded text-[11px]"
                      />
                      <select
                        value={slotAccepts}
                        onChange={(e) => setSlotAccepts(e.target.value as 'photo' | 'logo')}
                        className="px-2 py-1 border rounded text-[11px]"
                      >
                        <option value="photo">사진</option>
                        <option value="logo">로고</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      value={slotPrintMethod}
                      onChange={(e) => setSlotPrintMethod(e.target.value)}
                      placeholder="잠금 인쇄 방식 ID"
                      className="w-full px-2 py-1 border rounded text-[11px]"
                    />
                    <label className="flex items-center gap-1.5 text-[10px] text-gray-700">
                      <input type="checkbox" checked={slotBgRemove} onChange={(e) => setSlotBgRemove(e.target.checked)} />
                      배경 제거 기본 ON
                    </label>
                    <button
                      onClick={tagSelectedAsImageSlot}
                      className="w-full py-1 bg-purple-600 text-white rounded text-[11px] font-medium hover:bg-purple-700"
                    >
                      {selectedSlotEntry ? '슬롯 정보 갱신' : '이미지 슬롯으로 지정'}
                    </button>
                  </>
                )}
                {selectedIsText && (
                  <button
                    onClick={tagSelectedAsTextSlot}
                    className="w-full py-1 bg-purple-600 text-white rounded text-[11px] font-medium hover:bg-purple-700"
                  >
                    {selectedSlotEntry ? '슬롯 정보 갱신' : '텍스트 슬롯으로 지정'}
                  </button>
                )}
                {!selectedIsImage && !selectedIsText && (
                  <p className="text-[10px] text-gray-400">이미지 또는 텍스트 객체만 슬롯으로 지정할 수 있습니다.</p>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-gray-400">캔버스에서 객체를 선택하면 슬롯으로 지정할 수 있습니다.</p>
            )}

            {(templateImageSlots.length + templateTextSlots.length) > 0 && (
              <div className="mt-2 space-y-1">
                {templateImageSlots.map((s) => (
                  <div key={String(s.slot_id)} className="flex items-center justify-between gap-1 px-2 py-1 bg-gray-50 rounded text-[10px]">
                    <span className="truncate"><strong>📷</strong> {String(s.label)}</span>
                    <button onClick={() => removeSlot(String(s.slot_id))} className="text-gray-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {templateTextSlots.map((s) => (
                  <div key={String(s.slot_id)} className="flex items-center justify-between gap-1 px-2 py-1 bg-gray-50 rounded text-[10px]">
                    <span className="truncate"><strong>T</strong> {String(s.label)}</span>
                    <button onClick={() => removeSlot(String(s.slot_id))} className="text-gray-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onSave}
            disabled={isSaving || !templateTitle.trim()}
            className="w-full py-1.5 bg-blue-600 text-white rounded text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                저장 중...
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                {isCreating ? '템플릿 생성' : '템플릿 저장'}
              </>
            )}
          </button>

          {selectedTemplate && onDelete && (
            <button
              onClick={() => onDelete(selectedTemplate.id)}
              className="w-full py-1.5 text-red-500 border border-red-200 rounded text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              템플릿 삭제
            </button>
          )}
        </div>
      )}

      {/* Template List */}
      <div className="p-2.5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">템플릿 목록</h3>
          <button
            onClick={onCreateNew}
            className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="w-3 h-3" />
            새 템플릿
          </button>
        </div>

        {templates.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-3">등록된 템플릿이 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => onSelectTemplate(template)}
                className={`w-full p-2 rounded border text-left transition-colors ${
                  selectedTemplate?.id === template.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  {template.preview_url && (
                    <img
                      src={template.preview_url}
                      alt={template.title}
                      className="w-9 h-9 rounded object-cover bg-gray-100 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-gray-800 truncate">{template.title}</p>
                    {template.description && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{template.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[10px] px-1 py-0.5 rounded ${
                        template.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {template.is_active ? '활성' : '비활성'}
                      </span>
                      <span className="text-[10px] text-gray-400">#{template.sort_order ?? 0}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
