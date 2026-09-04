'use client';

/**
 * 과잠(바시티) 빌더 주문 항목 요약 — 부위별 색·학번 방식·개인화 명단·견적 내역.
 *
 * 데이터 출처: order_items.item_options.personalization (modoo_app 과잠 빌더가 저장,
 * 체크아웃에서 복사) + canvas_state[side].layerColors (에디터 공통 부위 색).
 * 관리자 주문 상세와 공장 발주 패널이 같이 쓴다. 과잠이 아닌 항목은 아무것도 그리지 않는다.
 */

import React, { useState } from 'react';
import type { OrderItem } from '@/types/types';

const PART_LABELS: Record<string, string> = { body: '몸통', arms: '팔', buttons: '단추', chivory: '쉬보리' };
const MODE_LABELS: Record<string, string> = { none: '학번 없음', common: '공통 학번', individual: '개인별 학번' };

export interface VarsityPersonalization {
  mode?: 'none' | 'common' | 'individual';
  commonNumber?: string;
  rows?: Array<{ name?: string; number?: string; size?: string }>;
  sizeQuantities?: Record<string, number>;
  individualSurcharge?: boolean;
  note?: string;
  quote?: {
    unitPrice?: number;
    lines?: Array<{ label: string; amount: number }>;
    tier?: string;
    leadTimeWeeks?: number;
  };
}

export function getVarsityPersonalization(item: Pick<OrderItem, 'item_options'>): VarsityPersonalization | null {
  const raw = (item.item_options as { personalization?: unknown } | null)?.personalization;
  return raw && typeof raw === 'object' ? (raw as VarsityPersonalization) : null;
}

/** canvas_state[side].layerColors (문자열 저장본도 파싱) */
export function getLayerColors(item: Pick<OrderItem, 'canvas_state'>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const cs = item.canvas_state as Record<string, unknown> | null;
  if (!cs || typeof cs !== 'object') return out;
  for (const [side, raw] of Object.entries(cs)) {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { continue; }
    }
    const lc = (parsed as { layerColors?: Record<string, unknown> } | null)?.layerColors;
    if (lc && typeof lc === 'object') {
      const entries = Object.entries(lc).filter((e): e is [string, string] => typeof e[1] === 'string');
      if (entries.length > 0) out[side] = Object.fromEntries(entries);
    }
  }
  return out;
}

export default function VarsityPersonalizationSummary({
  item,
  compact = false,
}: {
  item: OrderItem;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(compact);
  const p = getVarsityPersonalization(item);
  const layerColors = getLayerColors(item);
  const front = layerColors.front ?? Object.values(layerColors)[0];
  if (!p && !front) return null;

  const rows = p?.rows ?? [];
  const mode = p?.mode ?? 'none';
  const textSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    <div className={`mt-1.5 rounded-md border border-amber-200 bg-amber-50/60 px-2 py-1.5 ${textSize} text-gray-700`} onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-amber-800">과잠 빌더</span>
        {front && (
          <span className="inline-flex items-center gap-1.5">
            {Object.entries(front).map(([layerId, hex]) => (
              <span key={layerId} className="inline-flex items-center gap-0.5" title={`${PART_LABELS[layerId] ?? layerId} ${hex}`}>
                <span className="w-2.5 h-2.5 rounded-full border border-gray-300 shrink-0" style={{ backgroundColor: hex }} />
                <span>{PART_LABELS[layerId] ?? layerId}</span>
              </span>
            ))}
          </span>
        )}
        {p && (
          <span>
            {MODE_LABELS[mode] ?? mode}
            {mode === 'common' && p.commonNumber ? ` ${p.commonNumber}` : ''}
            {mode === 'individual' && p.individualSurcharge ? ' (+3,000/장)' : ''}
          </span>
        )}
        {rows.length > 0 && (
          compact ? (
            <span>명단 {rows.length}명</span>
          ) : (
            <button type="button" onClick={() => setOpen((v) => !v)} className="underline underline-offset-2 text-amber-800 font-semibold">
              명단 {rows.length}명 {open ? '접기' : '보기'}
            </button>
          )
        )}
        {p?.quote?.unitPrice !== undefined && !compact && (
          <span className="ml-auto tabular-nums">
            예상 장당 {Number(p.quote.unitPrice).toLocaleString('ko-KR')}원{p.quote.tier ? ` · ${p.quote.tier}` : ''}
          </span>
        )}
      </div>
      {open && rows.length > 0 && (
        <div className={`mt-1.5 ${compact ? 'max-h-32' : 'max-h-56'} overflow-auto rounded border border-amber-100 bg-white`}>
          <table className="w-full">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-1.5 py-0.5 font-medium">#</th>
                <th className="text-left px-1.5 py-0.5 font-medium">이름</th>
                {mode === 'individual' && <th className="text-left px-1.5 py-0.5 font-medium">학번</th>}
                <th className="text-left px-1.5 py-0.5 font-medium">사이즈</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-1.5 py-0.5 text-gray-400">{i + 1}</td>
                  <td className="px-1.5 py-0.5">{r.name || '-'}</td>
                  {mode === 'individual' && <td className="px-1.5 py-0.5 tabular-nums">{r.number || '-'}</td>}
                  <td className="px-1.5 py-0.5">{r.size || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!compact && p?.note && <p className="mt-1 text-gray-600 whitespace-pre-wrap">요청: {p.note}</p>}
      {!compact && p?.quote?.lines && p.quote.lines.length > 0 && (
        <p className="mt-1 text-gray-500">
          {p.quote.lines.map((l) => `${l.label} ${l.amount > 0 ? '+' : ''}${Number(l.amount).toLocaleString('ko-KR')}`).join(' · ')}
          {p.quote.leadTimeWeeks ? ` · 납기 약 ${p.quote.leadTimeWeeks}주` : ''}
        </p>
      )}
    </div>
  );
}
