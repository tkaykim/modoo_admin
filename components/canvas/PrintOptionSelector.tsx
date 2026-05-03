'use client'

import React from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '@/store/useCanvasStore';
import { PrintMethod } from '@/types/types';

interface PrintOptionSelectorProps {
  selectedObject: fabric.FabricObject;
}

const PRINT_METHODS: { method: PrintMethod; label: string; description: string }[] = [
  { method: 'dtf', label: 'DTF', description: '다양한 색상과 그라데이션에 적합' },
  { method: 'dtg', label: 'DTG', description: '고품질 디지털 프린팅' },
  { method: 'screen_printing', label: '나염', description: '대량 주문에 경제적' },
  { method: 'embroidery', label: '자수', description: '고급스러운 느낌, 내구성 우수' },
  { method: 'applique', label: '아플리케', description: '입체감 있는 디자인' },
];

const PrintOptionSelector: React.FC<PrintOptionSelectorProps> = ({ selectedObject }) => {
  const { setObjectPrintMethod, getObjectPrintMethod } = useCanvasStore();

  // Get the object's unique ID
  // @ts-expect-error - Accessing custom data property
  const objectId = selectedObject?.data?.objectId;

  // Get current print method
  const currentMethod = getObjectPrintMethod(selectedObject) || 'dtf';

  // Don't show for image objects (they default to DTF/DTG)
  if (selectedObject.type === 'image') {
    return null;
  }

  const handleMethodChange = (method: PrintMethod) => {
    if (objectId) {
      setObjectPrintMethod(objectId, method);
    }
  };

  const currentMethodInfo = PRINT_METHODS.find(m => m.method === currentMethod);

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 border border-gray-200">
      <h3 className="text-sm font-semibold mb-3 text-gray-700">인쇄 방식 선택</h3>

      <div className="grid grid-cols-5 gap-1">
        {PRINT_METHODS.map(({ method, label }) => (
          <button
            key={method}
            onClick={() => handleMethodChange(method)}
            className={`px-2 py-2.5 rounded-lg border-2 transition-all ${
              currentMethod === method
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="text-center">
              <div className="font-semibold text-xs">{label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Info text */}
      <div className="mt-3 text-xs text-gray-500">
        <p>{currentMethodInfo?.description}</p>
      </div>
    </div>
  );
};

export default PrintOptionSelector;
