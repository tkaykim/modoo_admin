'use client';

import { Plus, Trash2, Eye, EyeOff, Save } from 'lucide-react';
import { DesignTemplate, Product, ProductSide } from '@/types/types';
import { useCanvasStore } from '@/store/useCanvasStore';
import TextStylePanel from '@/components/canvas/TextStylePanel';
import LayerColorSelector from '@/components/canvas/LayerColorSelector';
import { isCurvedText } from '@/lib/curvedText';
import * as fabric from 'fabric';

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
  onSave,
  onDelete,
  isSaving,
  isCreating,
}: TemplateModePanelProps) {
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
