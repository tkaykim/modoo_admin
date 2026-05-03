'use client';

import { useState } from 'react';
import { Plus, X, GripVertical, Type, ChevronDown } from 'lucide-react';
import { CoBuyCustomField } from '@/types/types';

interface CustomFieldBuilderProps {
  fields: CoBuyCustomField[];
  onChange: (fields: CoBuyCustomField[]) => void;
  maxFields?: number;
}

export default function CustomFieldBuilder({
  fields,
  onChange,
  maxFields = 10,
}: CustomFieldBuilderProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const addField = (type: CoBuyCustomField['type']) => {
    if (fields.length >= maxFields) {
      alert(`최대 ${maxFields}개까지만 추가할 수 있습니다.`);
      return;
    }

    const newField: CoBuyCustomField = {
      id: `field-${Date.now()}`,
      type,
      label: getDefaultLabel(type),
      required: false,
      options: type === 'dropdown' ? ['옵션 1', '옵션 2'] : undefined,
    };

    onChange([...fields, newField]);
    setShowAddMenu(false);
  };

  const getDefaultLabel = (type: CoBuyCustomField['type']): string => {
    switch (type) {
      case 'text':
        return '텍스트 입력';
      case 'dropdown':
        return '선택 항목';
      default:
        return '필드';
    }
  };

  const updateField = (id: string, updates: Partial<CoBuyCustomField>) => {
    onChange(
      fields.map((field) =>
        field.id === id ? { ...field, ...updates } : field
      )
    );
  };

  const removeField = (id: string) => {
    onChange(fields.filter((field) => field.id !== id));
  };

  const addDropdownOption = (fieldId: string) => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field || field.type !== 'dropdown') return;

    const currentOptions = field.options || [];
    updateField(fieldId, {
      options: [...currentOptions, `옵션 ${currentOptions.length + 1}`],
    });
  };

  const updateDropdownOption = (fieldId: string, index: number, value: string) => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field || field.type !== 'dropdown') return;

    const options = [...(field.options || [])];
    options[index] = value;
    updateField(fieldId, { options });
  };

  const removeDropdownOption = (fieldId: string, index: number) => {
    const field = fields.find((f) => f.id === fieldId);
    if (!field || field.type !== 'dropdown') return;

    const options = field.options?.filter((_, i) => i !== index) || [];
    updateField(fieldId, { options });
  };

  const getFieldIcon = (type: CoBuyCustomField['type']) => {
    switch (type) {
      case 'dropdown':
        return <ChevronDown className="w-4 h-4" />;
      default:
        return <Type className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Field List */}
      <div className="space-y-3">
        {fields.map((field) => (
          <div
            key={field.id}
            className={`border rounded-lg p-4 ${
              field.fixed ? 'bg-gray-50 border-gray-300' : 'bg-white'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Drag Handle (disabled for fixed fields) */}
              <div className={field.fixed ? 'text-gray-300' : 'text-gray-400 cursor-move'}>
                <GripVertical className="w-5 h-5" />
              </div>

              {/* Field Content */}
              <div className="flex-1 space-y-3">
                {/* Field Type & Label */}
                <div className="flex items-center gap-3">
                  <div className="text-gray-500">{getFieldIcon(field.type)}</div>
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                    disabled={field.fixed}
                    placeholder="필드 이름"
                    className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(field.id, { required: e.target.checked })}
                      disabled={field.fixed}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <span className={field.fixed ? 'text-gray-400' : ''}>필수</span>
                  </label>
                </div>

                {/* Dropdown Options */}
                {field.type === 'dropdown' && !field.fixed && (
                  <div className="pl-8 space-y-2">
                    {field.options?.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => updateDropdownOption(field.id, index, e.target.value)}
                          placeholder={`옵션 ${index + 1}`}
                          className="flex-1 px-3 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => removeDropdownOption(field.id, index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addDropdownOption(field.id)}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>옵션 추가</span>
                    </button>
                  </div>
                )}

                {/* Fixed Field Notice */}
                {field.fixed && (
                  <p className="text-xs text-gray-500 pl-8">
                    이 필드는 고정되어 있어 수정하거나 삭제할 수 없습니다.
                  </p>
                )}
              </div>

              {/* Remove Button */}
              {!field.fixed && (
                <button
                  onClick={() => removeField(field.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Field Button */}
      {fields.length < maxFields && (
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span>필드 추가</span>
          </button>

          {/* Add Menu Dropdown */}
          {showAddMenu && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowAddMenu(false)}
              />

              {/* Menu */}
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-lg shadow-lg z-20 overflow-hidden">
                <button
                  onClick={() => addField('text')}
                  className="w-full px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-left"
                >
                  <Type className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium">텍스트</p>
                    <p className="text-xs text-gray-500">단답형 텍스트 입력</p>
                  </div>
                </button>

                <button
                  onClick={() => addField('dropdown')}
                  className="w-full px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-left border-t"
                >
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium">드롭다운</p>
                    <p className="text-xs text-gray-500">옵션 선택</p>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Field Count */}
      <p className="text-sm text-gray-500 text-center">
        {fields.length} / {maxFields} 필드
      </p>
    </div>
  );
}
