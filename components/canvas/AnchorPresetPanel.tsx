'use client';

import React from 'react';
import type { AnchorPreset } from '@/lib/anchorPresets';
import { resolveAnchorLabel } from '@/lib/anchorPresets';

interface AnchorPresetPanelProps {
  open: boolean;
  onClose: () => void;
  anchors: AnchorPreset[];
  hasSelectedArtwork: boolean;
  onPick: (anchor: AnchorPreset) => void;
  variant?: 'mobile' | 'desktop';
}

const AnchorPresetPanel: React.FC<AnchorPresetPanelProps> = ({
  open,
  onClose,
  anchors,
  hasSelectedArtwork,
  onPick,
  variant = 'mobile',
}) => {
  if (!open) return null;

  const isMobile = variant === 'mobile';

  const list = (
    <>
      {!hasSelectedArtwork && (
        <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-2 mb-2">
          먼저 이미지를 선택하세요. 선택된 이미지가 자동으로 위치와 크기에 맞춰집니다.
        </div>
      )}
      {anchors.length === 0 ? (
        <div className="text-xs text-gray-500 px-2 py-4 text-center">
          이 면에 등록된 위치가 아직 없습니다.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {anchors.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={!hasSelectedArtwork}
                onClick={() => onPick(a)}
                className="w-full text-left px-3 py-2 rounded border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <div className="font-medium text-sm text-gray-900">
                  📍 {resolveAnchorLabel(a)}
                </div>
                <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                  ({a.xMm.toFixed(0)}, {a.yMm.toFixed(0)})mm · 권장 {a.recommendedWidthMm.toFixed(0)}×{a.recommendedHeightMm.toFixed(0)}mm
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={onClose}
          aria-hidden
        />
        <div className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[60vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-base">자주 쓰는 위치</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-800 text-xl leading-none px-2"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">{list}</div>
        </div>
      </>
    );
  }

  // Desktop side panel
  return (
    <div className="fixed top-20 right-4 z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[70vh]">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <h3 className="font-semibold text-sm">자주 쓰는 위치</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-800 text-xl leading-none px-2"
          aria-label="닫기"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">{list}</div>
    </div>
  );
};

export default AnchorPresetPanel;
