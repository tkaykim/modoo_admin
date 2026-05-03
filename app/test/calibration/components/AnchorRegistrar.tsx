'use client';

import { useEffect, useState } from 'react';
import {
  BUILTIN_ANCHOR_IDS,
  getAnchorLabel,
  type AnchorId,
  type AnchorPlacement,
  type CustomAnchorDef,
  type TestSide,
} from '../lib/types';
import { activeNativeMmPerPx } from '../lib/calibrationMath';
import { AnchorCanvas } from './AnchorCanvas';

interface Props {
  productId: string;
  side: TestSide;
  customAnchors: CustomAnchorDef[];
  upsertAnchor: (productId: string, sideId: string, anchor: AnchorPlacement) => void;
  removeAnchor: (productId: string, sideId: string, anchorId: AnchorId) => void;
  setApplicableAnchors: (productId: string, sideId: string, anchors: AnchorId[]) => void;
  addCustomAnchor: (id: string, label: string) => void;
  removeCustomAnchor: (id: string) => void;
}

export function AnchorRegistrar({
  productId,
  side,
  customAnchors,
  upsertAnchor,
  removeAnchor,
  setApplicableAnchors,
  addCustomAnchor,
  removeCustomAnchor,
}: Props) {
  const allAnchorIds: string[] = [
    ...BUILTIN_ANCHOR_IDS,
    ...customAnchors.map((c) => c.id).filter((id) => !BUILTIN_ANCHOR_IDS.includes(id as any)),
  ];

  const handleAddAnchor = () => {
    const label = window.prompt('새 앵커 이름 (예: "겨드랑이")');
    if (!label) return;
    const id = `custom-${label.replace(/\s+/g, '-').toLowerCase()}-${Date.now().toString(36).slice(-4)}`;
    addCustomAnchor(id, label);
  };

  const [selectedAnchor, setSelectedAnchor] = useState<AnchorId | null>(
    side.applicableAnchors[0] ?? null,
  );
  const [widthMm, setWidthMm] = useState('80');
  const [heightMm, setHeightMm] = useState('80');
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    setSelectedAnchor(side.applicableAnchors[0] ?? null);
  }, [side.id, side.applicableAnchors]);

  const mmPerPx = activeNativeMmPerPx(side.mockup);
  const registered = new Map(side.registeredAnchors.map((a) => [a.id, a]));

  const handleCanvasClick = (xMm: number, yMm: number) => {
    if (!selectedAnchor) return;
    const w = parseFloat(widthMm);
    const h = parseFloat(heightMm);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return;
    upsertAnchor(productId, side.id, {
      id: selectedAnchor,
      xMm,
      yMm,
      recommendedWidthMm: w,
      recommendedHeightMm: h,
    });
  };

  const toggleApplicable = (id: AnchorId) => {
    const next = side.applicableAnchors.includes(id)
      ? side.applicableAnchors.filter((a) => a !== id)
      : [...side.applicableAnchors, id];
    setApplicableAnchors(productId, side.id, next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          캔버스 폭(시뮬):
          <input
            type="range"
            min={300}
            max={1400}
            step={20}
            value={containerWidth}
            onChange={(e) => setContainerWidth(parseInt(e.target.value, 10))}
          />
          <span className="text-xs text-gray-600 w-12">{containerWidth}px</span>
        </label>
        {!mmPerPx && (
          <span className="text-xs text-orange-700">
            ⚠ ① 캘리브 탭에서 환산비를 먼저 만드세요.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <div>
          <AnchorCanvas
            mockup={side.mockup}
            anchors={side.registeredAnchors}
            containerWidth={containerWidth}
            selectedAnchorId={selectedAnchor}
            onCanvasClick={handleCanvasClick}
            customAnchors={customAnchors}
          />
          <p className="mt-2 text-xs text-gray-600">
            왼쪽 패널에서 앵커를 선택하고, mockup의 해당 위치를 클릭하면 mm 좌표가
            저장됩니다. 권장 크기(가로×세로 mm)는 점선 사각형으로 미리보기됩니다.
          </p>
        </div>

        <div className="space-y-3">
          <div className="border rounded p-3 bg-white">
            <h3 className="font-semibold text-sm mb-2">권장 크기 (mm)</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex flex-col gap-1">
                가로 mm
                <input
                  type="number"
                  className="border rounded px-2 py-1"
                  value={widthMm}
                  onChange={(e) => setWidthMm(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                세로 mm
                <input
                  type="number"
                  className="border rounded px-2 py-1"
                  value={heightMm}
                  onChange={(e) => setHeightMm(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="border rounded p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">앵커 목록</h3>
              <button
                type="button"
                onClick={handleAddAnchor}
                className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-[11px]"
              >
                + 앵커 추가
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              체크된 앵커만 이 면에 활성. 라디오로 선택 후 캔버스 클릭 → 위치 저장.
            </p>
            <ul className="space-y-1 text-xs">
              {allAnchorIds.map((id) => {
                const isCustom = !BUILTIN_ANCHOR_IDS.includes(id as any);
                const applicable = side.applicableAnchors.includes(id);
                const placement = registered.get(id);
                const isSelected = selectedAnchor === id;
                return (
                  <li
                    key={id}
                    className={`flex items-center gap-2 p-1.5 rounded border ${
                      isSelected
                        ? 'border-blue-400 bg-blue-50'
                        : applicable
                          ? 'border-gray-200 bg-gray-50'
                          : 'border-gray-100 bg-white opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={applicable}
                      onChange={() => toggleApplicable(id)}
                      title="이 면에 적용 가능 여부"
                    />
                    <button
                      type="button"
                      disabled={!applicable}
                      className="flex-1 text-left disabled:cursor-not-allowed"
                      onClick={() => setSelectedAnchor(id)}
                    >
                      <span className="font-medium">{getAnchorLabel(id, customAnchors)}</span>
                      {isCustom && <span className="ml-1 text-[10px] text-purple-600">(custom)</span>}
                      {placement ? (
                        <span className="ml-1 text-green-700">
                          · ({placement.xMm.toFixed(0)}, {placement.yMm.toFixed(0)})mm
                          · {placement.recommendedWidthMm}×{placement.recommendedHeightMm}
                        </span>
                      ) : (
                        <span className="ml-1 text-gray-400">· 미등록</span>
                      )}
                    </button>
                    {placement && (
                      <button
                        type="button"
                        className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px]"
                        onClick={() => removeAnchor(productId, side.id, id)}
                      >
                        삭제
                      </button>
                    )}
                    {isCustom && !placement && (
                      <button
                        type="button"
                        className="px-2 py-0.5 bg-gray-100 hover:bg-red-100 hover:text-red-700 rounded text-[10px]"
                        onClick={() => {
                          if (window.confirm(`"${getAnchorLabel(id, customAnchors)}" 앵커 정의를 삭제할까요?`)) {
                            removeCustomAnchor(id);
                          }
                        }}
                        title="앵커 정의 자체 삭제"
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
