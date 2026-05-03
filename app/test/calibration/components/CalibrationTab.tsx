'use client';

import { useEffect, useState } from 'react';
import type { CalibrationLine, MockupCalibration, TestSide } from '../lib/types';
import { activeLine, lineNativePx, nativeMmPerPx } from '../lib/calibrationMath';
import { CalibrationCanvas } from './CalibrationCanvas';
import { MockupUploader } from './MockupUploader';

interface Props {
  productId: string;
  side: TestSide;
  setMockupImage: (
    productId: string,
    sideId: string,
    payload: { dataUrl: string; nativeWidth: number; nativeHeight: number },
  ) => void;
  upsertLine: (productId: string, sideId: string, line: CalibrationLine) => void;
  removeLine: (productId: string, sideId: string, lineId: string) => void;
  setActiveLine: (productId: string, sideId: string, lineId: string) => void;
}

const LINE_LABEL_OPTIONS = [
  '어깨 폭',
  '몸판 폭',
  '총 기장',
  '소매 길이',
  '후드 입구 폭',
  '기타',
];

export function CalibrationTab({
  productId,
  side,
  setMockupImage,
  upsertLine,
  removeLine,
  setActiveLine,
}: Props) {
  const mockup = side.mockup;
  const [pendingLine, setPendingLine] = useState<{
    p1: { xPx: number; yPx: number };
    p2: { xPx: number; yPx: number };
  } | null>(null);
  const [pendingMm, setPendingMm] = useState<string>('');
  const [pendingLabel, setPendingLabel] = useState<string>(LINE_LABEL_OPTIONS[0]);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    setPendingLine(null);
    setPendingMm('');
  }, [side.id]);

  const handleSavePendingLine = () => {
    if (!pendingLine) return;
    const mm = parseFloat(pendingMm);
    if (!Number.isFinite(mm) || mm <= 0) return;
    const id = `line-${Date.now().toString(36)}`;
    const line: CalibrationLine = {
      id,
      label: pendingLabel,
      p1: pendingLine.p1,
      p2: pendingLine.p2,
      measuredMm: mm,
      active: mockup.lines.length === 0,
    };
    upsertLine(productId, side.id, line);
    setPendingLine(null);
    setPendingMm('');
  };

  const active = activeLine(mockup);
  const activeRatio = active ? nativeMmPerPx(active) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MockupUploader
          hasImage={!!mockup.mockupDataUrl}
          onUpload={(payload) => setMockupImage(productId, side.id, payload)}
        />
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div>
          <CalibrationCanvas
            mockup={mockup}
            containerWidth={containerWidth}
            onLineDrawn={(p1, p2) => setPendingLine({ p1, p2 })}
          />
          <p className="mt-2 text-xs text-gray-600">
            mockup 위에 두 점을 차례로 클릭해 기준 선분을 그립니다. 같은 mockup에
            여러 후보 선분(어깨/몸판/기장)을 저장해 환산비를 비교할 수 있습니다.
          </p>
        </div>

        <div className="space-y-3">
          <div className="border rounded p-3 bg-white">
            <h3 className="font-semibold text-sm mb-2">현재 활성 캘리브</h3>
            {active ? (
              <div className="text-xs space-y-1">
                <div>이름: {active.label}</div>
                <div>실측: {active.measuredMm} mm</div>
                <div>네이티브 px: {lineNativePx(active).toFixed(2)}</div>
                <div className="font-mono">
                  nativeMmPerPx = {activeRatio.toFixed(4)} mm/px
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">아직 캘리브된 선분이 없습니다.</p>
            )}
          </div>

          {pendingLine && (
            <div className="border-2 border-blue-400 rounded p-3 bg-blue-50">
              <h3 className="font-semibold text-sm mb-2">새 선분 입력</h3>
              <div className="text-xs space-y-2">
                <div>
                  px 거리:{' '}
                  {Math.sqrt(
                    Math.pow(pendingLine.p2.xPx - pendingLine.p1.xPx, 2) +
                      Math.pow(pendingLine.p2.yPx - pendingLine.p1.yPx, 2),
                  ).toFixed(2)}
                </div>
                <label className="flex flex-col gap-1">
                  부위 이름
                  <select
                    className="border rounded px-2 py-1"
                    value={pendingLabel}
                    onChange={(e) => setPendingLabel(e.target.value)}
                  >
                    {LINE_LABEL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  실측 (mm)
                  <input
                    type="number"
                    className="border rounded px-2 py-1"
                    value={pendingMm}
                    onChange={(e) => setPendingMm(e.target.value)}
                    placeholder="예: 500"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
                    disabled={!pendingMm || !(parseFloat(pendingMm) > 0)}
                    onClick={handleSavePendingLine}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1 bg-gray-200 rounded"
                    onClick={() => {
                      setPendingLine(null);
                      setPendingMm('');
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          )}

          <LineList
            mockup={mockup}
            onActivate={(lineId) => setActiveLine(productId, side.id, lineId)}
            onRemove={(lineId) => removeLine(productId, side.id, lineId)}
          />
        </div>
      </div>
    </div>
  );
}

function LineList({
  mockup,
  onActivate,
  onRemove,
}: {
  mockup: MockupCalibration;
  onActivate: (lineId: string) => void;
  onRemove: (lineId: string) => void;
}) {
  if (mockup.lines.length === 0) return null;
  return (
    <div className="border rounded p-3 bg-white">
      <h3 className="font-semibold text-sm mb-2">저장된 선분 ({mockup.lines.length})</h3>
      <ul className="space-y-2">
        {mockup.lines.map((line) => {
          const ratio = nativeMmPerPx(line);
          return (
            <li
              key={line.id}
              className={`text-xs p-2 rounded border ${
                line.active ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{line.label}</div>
                  <div className="text-gray-600">
                    {line.measuredMm}mm · {ratio.toFixed(4)} mm/px
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {!line.active && (
                    <button
                      type="button"
                      className="px-2 py-0.5 bg-green-600 text-white rounded text-xs"
                      onClick={() => onActivate(line.id)}
                    >
                      활성
                    </button>
                  )}
                  <button
                    type="button"
                    className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs"
                    onClick={() => onRemove(line.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
