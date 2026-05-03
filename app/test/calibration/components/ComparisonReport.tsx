'use client';

import { useMemo, useState } from 'react';
import type { ComparisonScenario, TestSide } from '../lib/types';
import { activeNativeMmPerPx } from '../lib/calibrationMath';
import { legacyMmFromNewMm, legacyMmPerPx } from '../lib/legacyComparison';
import { dtfPrice } from '../lib/pricing';

interface Props {
  productId: string;
  side: TestSide;
  setLegacyProductWidthMm: (productId: string, sideId: string, widthMm: number | undefined) => void;
  upsertScenario: (productId: string, sideId: string, scenario: ComparisonScenario) => void;
  removeScenario: (productId: string, sideId: string, scenarioId: string) => void;
}

export function ComparisonReport({
  productId,
  side,
  setLegacyProductWidthMm,
  upsertScenario,
  removeScenario,
}: Props) {
  const newRatio = activeNativeMmPerPx(side.mockup);
  const legacyRatio = legacyMmPerPx(side.mockup);
  const scenarios = side.scenarios ?? [];

  const [legacyInput, setLegacyInput] = useState(
    side.mockup.legacyProductWidthMm?.toString() ?? '',
  );
  const [draft, setDraft] = useState({ name: '', w: '', h: '', gtW: '', gtH: '' });

  const rows = useMemo(() => {
    return scenarios.map((s) => {
      const newPrice = dtfPrice(s.widthMmNew, s.heightMmNew);
      const legacyDims = legacyMmFromNewMm(side.mockup, s.widthMmNew, s.heightMmNew);
      const legacyPrice = legacyDims ? dtfPrice(legacyDims.widthMm, legacyDims.heightMm) : null;
      const errNewW =
        s.groundTruthWidthMm && s.groundTruthWidthMm > 0
          ? s.widthMmNew - s.groundTruthWidthMm
          : null;
      const errNewH =
        s.groundTruthHeightMm && s.groundTruthHeightMm > 0
          ? s.heightMmNew - s.groundTruthHeightMm
          : null;
      const errLegacyW =
        legacyDims && s.groundTruthWidthMm && s.groundTruthWidthMm > 0
          ? legacyDims.widthMm - s.groundTruthWidthMm
          : null;
      const errLegacyH =
        legacyDims && s.groundTruthHeightMm && s.groundTruthHeightMm > 0
          ? legacyDims.heightMm - s.groundTruthHeightMm
          : null;
      return {
        s,
        newPrice,
        legacyDims,
        legacyPrice,
        errNewW,
        errNewH,
        errLegacyW,
        errLegacyH,
        deltaPrice: legacyPrice ? newPrice.price - legacyPrice.price : 0,
      };
    });
  }, [scenarios, side.mockup]);

  const totalDeltaPrice = rows.reduce((sum, r) => sum + r.deltaPrice, 0);

  const handleLegacyBlur = () => {
    const v = parseFloat(legacyInput);
    setLegacyProductWidthMm(productId, side.id, Number.isFinite(v) && v > 0 ? v : undefined);
  };

  const handleAddScenario = () => {
    const w = parseFloat(draft.w);
    const h = parseFloat(draft.h);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return;
    const gtW = parseFloat(draft.gtW);
    const gtH = parseFloat(draft.gtH);
    upsertScenario(productId, side.id, {
      id: `scn-${Date.now().toString(36)}`,
      name: draft.name || `시나리오 ${scenarios.length + 1}`,
      widthMmNew: w,
      heightMmNew: h,
      groundTruthWidthMm: Number.isFinite(gtW) && gtW > 0 ? gtW : undefined,
      groundTruthHeightMm: Number.isFinite(gtH) && gtH > 0 ? gtH : undefined,
      createdAt: Date.now(),
    });
    setDraft({ name: '', w: '', h: '', gtW: '', gtH: '' });
  };

  const handleExport = () => {
    const payload = {
      product: productId,
      side: { id: side.id, name: side.name },
      mockup: {
        nativeWidth: side.mockup.imageNativeWidthPx,
        nativeHeight: side.mockup.imageNativeHeightPx,
        nativeMmPerPx_new: newRatio,
        nativeMmPerPx_legacy: legacyRatio,
        legacyProductWidthMm: side.mockup.legacyProductWidthMm,
      },
      scenarios: rows.map((r) => ({
        ...r.s,
        new: { widthMm: r.s.widthMmNew, heightMm: r.s.heightMmNew, ...r.newPrice },
        legacy: r.legacyDims ? { ...r.legacyDims, ...r.legacyPrice } : null,
        errors: {
          new: { w: r.errNewW, h: r.errNewH },
          legacy: { w: r.errLegacyW, h: r.errLegacyH },
        },
        deltaPrice: r.deltaPrice,
      })),
      totalDeltaPrice,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calib-report-${side.name}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="border rounded p-3 bg-white">
        <h3 className="font-semibold text-sm mb-2">환산비 비교 (mockup 단위)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-green-50 border border-green-200 rounded p-2">
            <div className="font-medium text-green-800">새 방식 (캘리브)</div>
            <div className="font-mono">
              {newRatio ? `${newRatio.toFixed(4)} mm/px` : '없음 — ① 탭에서 캘리브 필요'}
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded p-2">
            <div className="font-medium text-amber-800 mb-1">현재 방식 (productWidthMm)</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="예: 500"
                value={legacyInput}
                onChange={(e) => setLegacyInput(e.target.value)}
                onBlur={handleLegacyBlur}
                className="border rounded px-2 py-1 text-xs w-24"
              />
              <span>mm</span>
              <span className="font-mono ml-2">
                {legacyRatio ? `→ ${legacyRatio.toFixed(4)} mm/px` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="border rounded p-3 bg-white">
        <h3 className="font-semibold text-sm mb-2">시나리오 추가</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <label className="flex flex-col gap-1">
            이름
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              placeholder="로고 A"
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            새 가로 mm
            <input
              type="number"
              value={draft.w}
              onChange={(e) => setDraft((p) => ({ ...p, w: e.target.value }))}
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            새 세로 mm
            <input
              type="number"
              value={draft.h}
              onChange={(e) => setDraft((p) => ({ ...p, h: e.target.value }))}
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            실측 가로 (선택)
            <input
              type="number"
              value={draft.gtW}
              onChange={(e) => setDraft((p) => ({ ...p, gtW: e.target.value }))}
              className="border rounded px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            실측 세로 (선택)
            <input
              type="number"
              value={draft.gtH}
              onChange={(e) => setDraft((p) => ({ ...p, gtH: e.target.value }))}
              className="border rounded px-2 py-1"
            />
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={handleAddScenario}
            className="px-3 py-1 bg-blue-600 text-white text-xs rounded"
            disabled={!draft.w || !draft.h}
          >
            + 시나리오 추가
          </button>
        </div>
      </div>

      <div className="border rounded bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr className="text-left">
              <th className="p-2">이름</th>
              <th className="p-2">새 mm</th>
              <th className="p-2">현재 mm</th>
              <th className="p-2">실측 mm</th>
              <th className="p-2">새 오차</th>
              <th className="p-2">현재 오차</th>
              <th className="p-2">새 단계</th>
              <th className="p-2">현재 단계</th>
              <th className="p-2">새 가격</th>
              <th className="p-2">현재 가격</th>
              <th className="p-2">Δ가격</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="p-4 text-center text-gray-400">
                  아직 시나리오가 없습니다.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.s.id} className="border-b hover:bg-gray-50">
                <td className="p-2 font-medium">{r.s.name}</td>
                <td className="p-2 font-mono">
                  {r.s.widthMmNew.toFixed(0)}×{r.s.heightMmNew.toFixed(0)}
                </td>
                <td className="p-2 font-mono">
                  {r.legacyDims
                    ? `${r.legacyDims.widthMm.toFixed(0)}×${r.legacyDims.heightMm.toFixed(0)}`
                    : '—'}
                </td>
                <td className="p-2 font-mono">
                  {r.s.groundTruthWidthMm && r.s.groundTruthHeightMm
                    ? `${r.s.groundTruthWidthMm.toFixed(0)}×${r.s.groundTruthHeightMm.toFixed(0)}`
                    : '—'}
                </td>
                <td className="p-2 font-mono">
                  {fmtErr(r.errNewW)}/{fmtErr(r.errNewH)}
                </td>
                <td className="p-2 font-mono">
                  {fmtErr(r.errLegacyW)}/{fmtErr(r.errLegacyH)}
                </td>
                <td className="p-2">{r.newPrice.bucket}</td>
                <td className="p-2">{r.legacyPrice?.bucket ?? '—'}</td>
                <td className="p-2 font-mono">{r.newPrice.price.toLocaleString()}</td>
                <td className="p-2 font-mono">
                  {r.legacyPrice ? r.legacyPrice.price.toLocaleString() : '—'}
                </td>
                <td
                  className={`p-2 font-mono ${
                    r.deltaPrice === 0
                      ? ''
                      : r.deltaPrice > 0
                        ? 'text-red-700'
                        : 'text-green-700'
                  }`}
                >
                  {r.legacyPrice
                    ? `${r.deltaPrice > 0 ? '+' : ''}${r.deltaPrice.toLocaleString()}`
                    : '—'}
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    onClick={() => removeScenario(productId, side.id, r.s.id)}
                    className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px]"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="p-2" colSpan={10}>
                  합계 차액 (새 − 현재)
                </td>
                <td
                  className={`p-2 font-mono ${
                    totalDeltaPrice === 0
                      ? ''
                      : totalDeltaPrice > 0
                        ? 'text-red-700'
                        : 'text-green-700'
                  }`}
                >
                  {totalDeltaPrice > 0 ? '+' : ''}
                  {totalDeltaPrice.toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          disabled={rows.length === 0}
          className="px-3 py-1 bg-gray-800 text-white text-xs rounded disabled:opacity-40"
        >
          JSON export
        </button>
      </div>
    </div>
  );
}

function fmtErr(v: number | null): string {
  if (v === null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}
