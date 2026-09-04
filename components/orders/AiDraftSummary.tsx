'use client';

/**
 * AI 디자이너 초안 요약 — 주문 항목의 canvas_state 이미지 오브젝트 중 AI 생성/품질 검사 결과가 있는 것을 표시.
 *
 * 데이터 출처: order_items.canvas_state[side].objects[].data
 *   aiGenerated / aiPrompt / aiGenerationId / originalSvgUrl / originalFileUrl / artworkQuality
 * (modoo_app /api/ai-designer/order 가 기록, lib/aiDesigner/quality.ts compactQuality 형식)
 * 주문 상세와 공장 발주 패널이 같이 쓴다. 해당 데이터가 없으면 아무것도 그리지 않는다.
 */

import React from 'react';
import type { OrderItem } from '@/types/types';

interface Verdict { grade?: 'ok' | 'review'; labels?: string[]; flags?: string[] }
interface ArtworkQuality {
  metrics?: { colorCount?: number; minStrokeMm?: number | null; widthMm?: number | null; transparent?: boolean };
  dtf?: Verdict;
  screen?: Verdict;
  embroidery?: Verdict;
}

export interface AiArtworkInfo {
  side: string;
  aiGenerated: boolean;
  prompt: string | null;
  originalUrl: string | null;
  svgUrl: string | null;
  printMethod: string | null;
  widthMm: number | null;
  quality: ArtworkQuality | null;
}

const SIDE_LABELS: Record<string, string> = { front: '앞면', back: '뒷면', left: '왼쪽', right: '오른쪽', 'sleeve-left': '왼소매', 'sleeve-right': '오른소매' };
const METHOD_LABELS: Record<string, string> = { dtf: 'DTF', embroidery: '자수', applique: '아플리케', screen: '나염', silkscreen: '나염' };

export function getAiArtworks(item: Pick<OrderItem, 'canvas_state'>): AiArtworkInfo[] {
  const out: AiArtworkInfo[] = [];
  const cs = item.canvas_state as Record<string, unknown> | null;
  if (!cs || typeof cs !== 'object') return out;
  for (const [side, raw] of Object.entries(cs)) {
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { continue; }
    }
    const objects = (parsed as { objects?: unknown[] } | null)?.objects;
    if (!Array.isArray(objects)) continue;
    for (const obj of objects) {
      const data = (obj as { data?: Record<string, unknown> } | null)?.data;
      if (!data || typeof data !== 'object') continue;
      const aiGenerated = data.aiGenerated === true;
      const quality = (data.artworkQuality as ArtworkQuality | undefined) ?? null;
      if (!aiGenerated && !quality) continue;
      out.push({
        side,
        aiGenerated,
        prompt: typeof data.aiPrompt === 'string' ? data.aiPrompt : null,
        originalUrl: typeof data.originalFileUrl === 'string' ? data.originalFileUrl : null,
        svgUrl: typeof data.originalSvgUrl === 'string' ? data.originalSvgUrl : null,
        printMethod: typeof data.printMethod === 'string' ? data.printMethod : null,
        widthMm: typeof data.widthMm === 'number' ? data.widthMm : null,
        quality,
      });
    }
  }
  return out;
}

function verdictFor(a: AiArtworkInfo): { label: string; review: boolean; labels: string[] } | null {
  if (!a.quality) return null;
  const method = a.printMethod === 'embroidery' || a.printMethod === 'applique' ? 'embroidery'
    : a.printMethod === 'screen' || a.printMethod === 'silkscreen' ? 'screen' : 'dtf';
  const v = a.quality[method];
  if (!v) return null;
  return { label: METHOD_LABELS[a.printMethod ?? 'dtf'] ?? method, review: v.grade === 'review', labels: v.labels ?? [] };
}

export default function AiDraftSummary({ item, compact = false }: { item: OrderItem; compact?: boolean }) {
  const artworks = getAiArtworks(item);
  if (artworks.length === 0) return null;
  const anyAi = artworks.some((a) => a.aiGenerated);
  const anyReview = artworks.some((a) => verdictFor(a)?.review);
  const textSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    <div
      className={`mt-1.5 rounded-md border px-2 py-1.5 ${textSize} text-gray-700 ${anyReview ? 'border-amber-200 bg-amber-50/60' : 'border-violet-200 bg-violet-50/60'}`}
      onClick={(e) => e.stopPropagation()}
      data-testid="ai-draft-summary"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {anyAi && <span className="font-semibold text-violet-800">AI 초안 · 디자이너 확정 필요</span>}
        {!anyAi && <span className="font-semibold text-gray-700">도안 검사</span>}
        {anyReview && <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white font-semibold">보정 필요</span>}
        {!anyReview && <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-semibold">인쇄 적합</span>}
      </div>
      <ul className={`mt-1 space-y-0.5 ${compact ? 'max-h-24 overflow-auto' : ''}`}>
        {artworks.map((a, i) => {
          const v = verdictFor(a);
          const emb = a.quality?.embroidery;
          return (
            <li key={i} className="flex flex-wrap items-center gap-x-1.5">
              <span className="text-gray-500">{SIDE_LABELS[a.side] ?? a.side}</span>
              {a.aiGenerated && a.prompt && !compact && <span className="text-gray-700 truncate max-w-[18rem]" title={a.prompt}>“{a.prompt}”</span>}
              {a.widthMm !== null && <span className="text-gray-400">{Math.round(a.widthMm)}mm</span>}
              {v && v.review && <span className="text-amber-700">{v.label}: {v.labels.join(' · ')}</span>}
              {v && !v.review && <span className="text-emerald-700">{v.label} 적합</span>}
              {v && !v.review && emb?.grade === 'review' && !compact && (
                <span className="text-gray-400">(자수 전환 시: {(emb.labels ?? []).join(' · ')})</span>
              )}
              {!compact && a.svgUrl && (
                <a href={a.svgUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 text-violet-700 font-semibold">SVG</a>
              )}
              {!compact && a.originalUrl && (
                <a href={a.originalUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 text-gray-600">원본 PNG</a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
