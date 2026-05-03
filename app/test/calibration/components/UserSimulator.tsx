'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getAnchorLabel,
  type AnchorId,
  type CustomAnchorDef,
  type TestSide,
} from '../lib/types';
import { activeNativeMmPerPx } from '../lib/calibrationMath';
import { SimulatorCanvas, exceedsA3Bbox, type ArtworkObject } from './SimulatorCanvas';
import { trimToAlphaBounds } from '../lib/imageAlphaTrim';

interface Props {
  side: TestSide;
  customAnchors?: CustomAnchorDef[];
}

export function UserSimulator({ side, customAnchors = [] }: Props) {
  const [containerWidth, setContainerWidth] = useState(800);
  const [artworks, setArtworks] = useState<ArtworkObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredAnchorId, setHoveredAnchorId] = useState<AnchorId | null>(null);
  const [showAnchors, setShowAnchors] = useState(true);
  const [groundTruthMm, setGroundTruthMm] = useState<{ w: string; h: string }>({ w: '', h: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mmPerPx = activeNativeMmPerPx(side.mockup);

  useEffect(() => {
    setArtworks([]);
    setSelectedId(null);
    setGroundTruthMm({ w: '', h: '' });
  }, [side.id]);

  const selected = artworks.find((a) => a.id === selectedId) ?? null;

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = reader.result as string;
      try {
        const trimResult = await trimToAlphaBounds(rawDataUrl);
        const id = `aw-${Date.now().toString(36)}`;
        const aspect = trimResult.width / trimResult.height;
        const widthMm = 80;
        const heightMm = 80 / aspect;
        setArtworks((prev) => [
          ...prev,
          {
            id,
            dataUrl: trimResult.dataUrl,
            xMm: 30,
            yMm: 30,
            widthMm,
            heightMm,
            angleDeg: 0,
            naturalAspect: aspect,
            alphaTrimmed: trimResult.trimmed,
            originalRasterWh: trimResult.trimmed
              ? { w: trimResult.originalWidth, h: trimResult.originalHeight }
              : undefined,
          },
        ]);
        setSelectedId(id);
      } catch (e) {
        console.error('[CALIB-TEST] alpha trim failed, falling back to raw', e);
        const img = new Image();
        img.onload = () => {
          const id = `aw-${Date.now().toString(36)}`;
          const aspect = img.naturalWidth / img.naturalHeight;
          const widthMm = 80;
          const heightMm = 80 / aspect;
          setArtworks((prev) => [
            ...prev,
            {
              id,
              dataUrl: rawDataUrl,
              xMm: 30,
              yMm: 30,
              widthMm,
              heightMm,
              angleDeg: 0,
              naturalAspect: aspect,
            },
          ]);
          setSelectedId(id);
        };
        img.src = rawDataUrl;
      }
    };
    reader.readAsDataURL(file);
  };

  const updateArtwork = (id: string, patch: Partial<ArtworkObject>) => {
    setArtworks((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const removeArtwork = (id: string) => {
    setArtworks((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const snapToAnchor = (anchorId: AnchorId) => {
    if (!selectedId) return;
    const placement = side.registeredAnchors.find((a) => a.id === anchorId);
    if (!placement) return;
    const artwork = artworks.find((a) => a.id === selectedId);
    if (!artwork) return;

    // contain artwork inside recommended bounding box, preserving natural aspect
    const aspect = artwork.naturalAspect || artwork.widthMm / artwork.heightMm || 1;
    let widthMm = placement.recommendedWidthMm;
    let heightMm = widthMm / aspect;
    if (heightMm > placement.recommendedHeightMm) {
      heightMm = placement.recommendedHeightMm;
      widthMm = heightMm * aspect;
    }

    updateArtwork(selectedId, {
      xMm: placement.xMm - widthMm / 2,
      yMm: placement.yMm - heightMm / 2,
      widthMm,
      heightMm,
      angleDeg: 0,
    });
  };

  const a3Exceeded = selected
    ? exceedsA3Bbox(selected.widthMm, selected.heightMm, selected.angleDeg)
    : false;

  const errW =
    selected && groundTruthMm.w && parseFloat(groundTruthMm.w) > 0
      ? selected.widthMm - parseFloat(groundTruthMm.w)
      : null;
  const errH =
    selected && groundTruthMm.h && parseFloat(groundTruthMm.h) > 0
      ? selected.heightMm - parseFloat(groundTruthMm.h)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
        >
          + 아트워크 추가
        </button>
        <label className="flex items-center gap-2 text-sm font-medium px-2 py-1 rounded border bg-white cursor-pointer">
          <input
            type="checkbox"
            checked={showAnchors}
            onChange={(e) => setShowAnchors(e.target.checked)}
          />
          자주 쓰는 위치
        </label>
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
          <SimulatorCanvas
            mockup={side.mockup}
            containerWidth={containerWidth}
            artworks={artworks}
            anchors={showAnchors ? side.registeredAnchors : []}
            highlightedAnchorId={showAnchors ? hoveredAnchorId : null}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdate={updateArtwork}
            customAnchors={customAnchors}
          />
          <p className="mt-2 text-xs text-gray-600">
            아트워크를 클릭하면 선택됩니다. 모서리 핸들로 리사이즈/회전. 위치/크기는 모두 mm로 환산.
          </p>
        </div>

        <div className="space-y-3">
          <div className={`border rounded p-3 bg-white ${!showAnchors ? 'opacity-50' : ''}`}>
            <h3 className="font-semibold text-sm mb-2">앵커 자동 스냅</h3>
            <p className="text-[11px] text-gray-500 mb-2">
              {showAnchors
                ? '선택된 아트워크를 등록된 앵커 위치+권장 크기로 이동.'
                : '"자주 쓰는 위치" 토글을 켜야 사용 가능합니다.'}
            </p>
            <div className="grid grid-cols-1 gap-1">
              {side.registeredAnchors.length === 0 && (
                <span className="text-xs text-gray-400">② 탭에서 앵커를 먼저 등록하세요.</span>
              )}
              {side.registeredAnchors.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={!selectedId || !showAnchors}
                  onClick={() => snapToAnchor(a.id)}
                  onMouseEnter={() => setHoveredAnchorId(a.id)}
                  onMouseLeave={() => setHoveredAnchorId(null)}
                  className="px-2 py-1 text-xs text-left bg-gray-50 hover:bg-blue-50 rounded border disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {getAnchorLabel(a.id, customAnchors)} · {a.recommendedWidthMm}×{a.recommendedHeightMm}mm
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <div
              className={`border rounded p-3 ${
                a3Exceeded ? 'bg-red-50 border-red-300' : 'bg-white'
              }`}
            >
              <h3 className="font-semibold text-sm mb-2">선택 아트워크 측정</h3>
              <div className="text-xs space-y-1 font-mono">
                <div>
                  위치: ({selected.xMm.toFixed(1)}, {selected.yMm.toFixed(1)})mm
                </div>
                <div>
                  크기: {selected.widthMm.toFixed(1)} × {selected.heightMm.toFixed(1)}mm
                </div>
                <div>회전: {selected.angleDeg.toFixed(1)}°</div>
                {selected.alphaTrimmed && selected.originalRasterWh && (
                  <div className="text-blue-700 mt-1">
                    🔍 알파 트림됨 ({selected.originalRasterWh.w}×{selected.originalRasterWh.h} → 가시영역만)
                  </div>
                )}
                {a3Exceeded && (
                  <div className="text-red-700 font-bold mt-1">⚠ A3(297×420mm) 외접 사각형 초과</div>
                )}
              </div>
            </div>
          )}

          {selected && (
            <div className="border rounded p-3 bg-white">
              <h3 className="font-semibold text-sm mb-2">실측 ground truth (mm)</h3>
              <p className="text-[11px] text-gray-500 mb-2">
                실물 의류에 출력 후 줄자로 잰 값을 입력하면 화면 측정값과 비교됩니다.
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex flex-col gap-1">
                  실측 가로
                  <input
                    type="number"
                    className="border rounded px-2 py-1"
                    value={groundTruthMm.w}
                    onChange={(e) => setGroundTruthMm((p) => ({ ...p, w: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  실측 세로
                  <input
                    type="number"
                    className="border rounded px-2 py-1"
                    value={groundTruthMm.h}
                    onChange={(e) => setGroundTruthMm((p) => ({ ...p, h: e.target.value }))}
                  />
                </label>
              </div>
              {(errW !== null || errH !== null) && (
                <div className="mt-2 text-xs font-mono">
                  {errW !== null && (
                    <div className={Math.abs(errW) > 3 ? 'text-red-700' : 'text-green-700'}>
                      가로 오차: {errW > 0 ? '+' : ''}{errW.toFixed(1)}mm
                    </div>
                  )}
                  {errH !== null && (
                    <div className={Math.abs(errH) > 3 ? 'text-red-700' : 'text-green-700'}>
                      세로 오차: {errH > 0 ? '+' : ''}{errH.toFixed(1)}mm
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {artworks.length > 0 && (
            <div className="border rounded p-3 bg-white">
              <h3 className="font-semibold text-sm mb-2">아트워크 목록 ({artworks.length})</h3>
              <ul className="space-y-1 text-xs">
                {artworks.map((a) => (
                  <li
                    key={a.id}
                    className={`flex items-center gap-2 p-1.5 rounded border ${
                      selectedId === a.id
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(a.id)}
                      className="flex-1 text-left"
                    >
                      {a.widthMm.toFixed(0)}×{a.heightMm.toFixed(0)}mm
                    </button>
                    <button
                      type="button"
                      onClick={() => removeArtwork(a.id)}
                      className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px]"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
