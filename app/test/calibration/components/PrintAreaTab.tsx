'use client';

import { useEffect, useRef, useState } from 'react';
import type { TestSide } from '../lib/types';
import { activeNativeMmPerPx } from '../lib/calibrationMath';

interface Props {
  productId: string;
  side: TestSide;
  setPrintAreaRealSize?: (
    productId: string,
    sideId: string,
    widthMm: number | undefined,
    heightMm: number | undefined,
  ) => void;
}

/**
 * 인쇄영역 실측 도구 (환산 1순위 소스).
 *
 * mockup 위에 인쇄영역(printArea) 픽셀 사각형을 그려 보여주고, 그 영역의 실제
 * 물리 크기(mm)를 입력받는다. printAreaWidthMm / printAreaPx.width = native mm/px.
 * 손클릭 캘리(선분)보다 정확하며, 둘이 모두 있으면 시뮬레이션 탭에서 비교한다.
 */
export function PrintAreaTab({ productId, side, setPrintAreaRealSize }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(560);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(Math.min(w, 720));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const imgW = side.mockup.imageNativeWidthPx || 0;
  const imgH = side.mockup.imageNativeHeightPx || 0;
  const pa = side.printAreaPx;
  const displayScale = imgW > 0 ? containerWidth / imgW : 1;

  const printAreaRatio =
    side.printAreaWidthMm && pa?.width ? side.printAreaWidthMm / pa.width : 0;
  const calibRatio = activeNativeMmPerPx(side.mockup);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      {/* 좌: mockup + 인쇄영역 사각형 */}
      <div ref={containerRef} className="border rounded bg-white p-3">
        {side.mockup.mockupDataUrl && imgW > 0 ? (
          <div
            className="relative mx-auto"
            style={{ width: containerWidth, height: imgH * displayScale }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={side.mockup.mockupDataUrl}
              alt={side.name}
              className="absolute inset-0 w-full h-full object-contain select-none"
              draggable={false}
            />
            {pa && pa.width > 0 ? (
              <div
                className="absolute border-2 border-dashed border-indigo-600 bg-indigo-500/10"
                style={{
                  left: pa.x * displayScale,
                  top: pa.y * displayScale,
                  width: pa.width * displayScale,
                  height: pa.height * displayScale,
                }}
              >
                <span className="absolute -top-5 left-0 text-[11px] font-semibold text-indigo-700 bg-white/90 px-1 rounded whitespace-nowrap">
                  인쇄영역 {pa.width}×{pa.height}px
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="p-12 text-center text-sm text-gray-400">
            이 면에 mockup 이미지가 없습니다.
          </div>
        )}
        <p className="mt-2 text-[11px] text-gray-500 text-center">
          파란 점선이 인쇄영역(printArea)입니다. 이 영역의 실제 크기를 우측에 입력하세요.
          영역 자체 위치/크기 수정은 admin 상품편집 → "인쇄 영역" 탭에서.
        </p>
      </div>

      {/* 우: 실측 입력 */}
      <div className="space-y-3">
        <div className="border-2 border-indigo-200 rounded p-3 bg-indigo-50/40">
          <h3 className="font-semibold text-sm mb-1 text-indigo-900">
            인쇄영역 실측 (mm) <span className="text-[10px] font-normal text-indigo-600">· 환산 1순위</span>
          </h3>
          <p className="text-[11px] text-gray-500 mb-2">
            공장 인쇄 스펙(최대 인쇄영역)을 입력. 예: A4 210×297, A3 297×420, 28×35cm → 280×350.
            {!pa?.width && <span className="text-orange-600"> (이 면에 인쇄영역 픽셀 정보가 없습니다)</span>}
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
            <div>인쇄영역 픽셀폭: {pa?.width ? `${pa.width}px` : '—'}</div>
            <div className={printAreaRatio ? 'text-indigo-700 font-semibold' : 'text-gray-400'}>
              ① 인쇄영역 비율: {printAreaRatio ? `${printAreaRatio.toFixed(4)} mm/px` : '미설정'}
            </div>
            <div className={calibRatio ? 'text-gray-700' : 'text-gray-400'}>
              ② 캘리브 비율: {calibRatio ? `${calibRatio.toFixed(4)} mm/px` : '미설정 (① 탭)'}
            </div>
            {printAreaRatio && calibRatio ? (
              (() => {
                const pct = (printAreaRatio / calibRatio - 1) * 100;
                return (
                  <div className={Math.abs(pct) > 5 ? 'text-red-700 font-bold' : 'text-green-700'}>
                    두 비율 차이: {pct > 0 ? '+' : ''}{pct.toFixed(1)}% (실제 시뮬레이션은 ④ 탭)
                  </div>
                );
              })()
            ) : null}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            저장은 상단 "현재 면 DB 저장". 앱 환산: ①이 있으면 ① 사용, 없으면 ②로 fallback.
          </p>
        </div>
      </div>
    </div>
  );
}
