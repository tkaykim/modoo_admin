import type { CustomFont } from '@/types/types';
import { createClient } from './supabase-client';
import { buildOutlinedTextSvg } from './text-outline-export';
import { uploadSVGToStorage } from './supabase-storage';
import { STORAGE_BUCKETS, STORAGE_FOLDERS } from './storage-config';
import { parseCanvasState } from './downloadUtils';

export async function exportOrderTextAssets(
  canvasStateMap: Record<string, unknown>,
  customFonts: CustomFont[],
  orderItemId: string
): Promise<Record<string, string>> {
  const supabase = createClient();
  const results: Record<string, string> = {};

  for (const [sideId, rawState] of Object.entries(canvasStateMap)) {
    const state = parseCanvasState(rawState);
    const outlined = await buildOutlinedTextSvg(state, sideId, { customFonts });
    if (!outlined.svg || outlined.textCount === 0) continue;

    // Never replace a production asset with an SVG that still depends on a
    // locally installed font.
    if (outlined.outlinedCount !== outlined.textCount) {
      throw new Error(
        `텍스트를 벡터 경로로 확정할 수 없습니다: ${sideId} ` +
        `(${outlined.fallbackFonts.join(', ') || 'font unavailable'})`
      );
    }

    const upload = await uploadSVGToStorage(
      supabase,
      outlined.svg,
      STORAGE_BUCKETS.TEXT_EXPORTS,
      STORAGE_FOLDERS.SVG,
      `admin-order-${orderItemId}-${sideId}-${Date.now()}.svg`
    );
    if (!upload.success || !upload.url) {
      throw new Error(`관리자 텍스트 SVG 저장 실패: ${sideId}`);
    }
    results[sideId] = upload.url;
  }

  return results;
}
