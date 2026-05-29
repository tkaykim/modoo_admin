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
  productId: string;
  side: TestSide;
  customAnchors?: CustomAnchorDef[];
  setPrintAreaRealSize?: (productId: string, sideId: string, widthMm: number | undefined, heightMm: number | undefined) => void;
}

export function UserSimulator({ productId, side, customAnchors = [], setPrintAreaRealSize }: Props) {
  const [containerWidth, setContainerWidth] = useState(800);
  const [artworks, setArtworks] = useState<ArtworkObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredAnchorId, setHoveredAnchorId] = useState<AnchorId | null>(null);
  const [showAnchors, setShowAnchors] = useState(true);
  const [groundTruthMm, setGroundTruthMm] = useState<{ w: string; h: string }>({ w: '', h: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 두 환산비 (둘 다 mm per native mockup px → 직접 비교 가능)
  const calibRatio = activeNativeMmPerPx(side.mockup); // ② 캘리브 선분 기준
  const printAreaRatio =
    side.printAreaWidthMm && side.printAreaPx?.width
      ? side.printAreaWidthMm / side.printAreaPx.width
      : 0; // ① 인쇄영역 실측 기준 (환산 1순위)
  // 시뮬레이터 캔버스는 캘리브 비율로 배치하므로, selected.widthMm는 '캘리브 기준' 값.
  // 동일 아트워크를 인쇄영역 비율로 재면: widthMm × (printAreaRatio / calibRatio).
  const mmPerPx = calibRatio;

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
          {/* 인쇄영역 실측(mm) 입력 — 환산 1순위 소스 */}
          <div className="border-2 border-indigo-200 rounded p-3 bg-indigo-50/40">
            <h3 className="font-semibold text-sm mb-1 text-indigo-900">인쇄영역 실측 (mm) <span className="text-[10px] font-normal text-indigo-600">· 환산 1순위</span></h3>
            <p className="text-[11px] text-gray-500 mb-2">
              공장 인쇄 스펙(최대 인쇄영역)을 입력. 인쇄영역 픽셀폭과 함께 환산비가 됩니다.
              {!side.printAreaPx?.width && <span className="text-orange-600"> (이 면에 인쇄영역 픽셀 정보가 없습니다)</span>}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex flex-col gap-1">
                가로(mm)
                <input
                  type="number"
                  className="border rounded px-2 py-1"
                  value={side.printAreaWidthMm ?? ''}
                  onChange={(e) =>
                    setPrintAreaRealSize?.(
                      productId,
                      side.id,
                      e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value)),
                      side.printAreaHeightMm,
                    )
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                세로(mm)
                <input
                  type="number"
                  className="border rounded px-2 py-1"
                  value={side.printAreaHeightMm ?? ''}
                  onChange={(e) =>
                    setPrintAreaRealSize?.(
                      productId,
                      side.id,
                      side.printAreaWidthMm,
                      e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value)),
                    )
                  }
                />
              </label>
            </div>
            <div className="mt-2 text-[11px] font-mono text-gray-600 space-y-0.5">
              <div>인쇄영역 픽셀폭: {side.printAreaPx?.width ? `${side.printAreaPx.width}px` : '—'}</div>
              <div className={printAreaRatio ? 'text-indigo-700 font-semibold' : 'text-gray-400'}>
                ① 인쇄영역 비율: {printAreaRatio ? `${printAreaRatio.toFixed(4)} mm/px` : '미설정'}
              </div>
              <div className={calibRatio ? 'text-gray-700' : 'text-gray-400'}>
                ② 캘리브 비율: {calibRatio ? `${calibRatio.toFixed(4)} mm/px` : '미설정'}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">앱 환산: ①이 있으면 ① 사용, 없으면 ②로 fallback. 저장은 "현재 면 DB 저장".</p>
            </div>
          </div>

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
                <div>회전: {selected.angleDeg.toFixed(1)}°</div>
                <div className="border-t border-dashed border-gray-200 pt-1.5 mt-1.5 space-y-0.5 not-italic">
                  <div className="text-[10px] text-gray-400">크기 — 기준별 비교</div>
                  <div className="text-gray-700">② 캘리브 기준: {selected.widthMm.toFixed(1)} × {selected.heightMm.toFixed(1)}mm</div>
                  {printAreaRatio && calibRatio ? (
                    <>
                      <div className="text-indigo-700 font-semibold">① 인쇄영역 기준: {(selected.widthMm * printAreaRatio / calibRatio).toFixed(1)} × {(selected.heightMm * printAreaRatio / calibRatio).toFixed(1)}mm</div>
                      {(() => {
                        const pct = (printAreaRatio / calibRatio - 1) * 100;
                        return (
                          <div className={Math.abs(pct) > 5 ? 'text-red-700 font-bold' : 'text-green-700'}>
                            두 기준 차이: {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <div className="text-gray-400">① 인쇄영역 기준: 위에 실측(mm) 입력 시 표시</div>
                  )}
                </div>
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
