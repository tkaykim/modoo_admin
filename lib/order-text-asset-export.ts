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
    try {
      const state = parseCanvasState(rawState);
      const outlined = await buildOutlinedTextSvg(state, sideId, { customFonts });
      if (!outlined.svg || outlined.textCount === 0) continue;

      if (outlined.outlinedCount !== outlined.textCount) {
        console.warn(
          `[order-text-export] ${sideId}: path 변환 불가 폰트는 원본 <text> SVG로 저장합니다.`,
          outlined.fallbackFonts
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
        console.warn(
          `[order-text-export] ${sideId}: SVG 업로드 실패로 기존 생산 자산을 유지합니다.`,
          upload.error
        );
        continue;
      }
      results[sideId] = upload.url;
    } catch (error) {
      // Canvas JSON + immutable font metadata are the save source of truth.
      // Asset generation is best-effort and must not block an order edit.
      console.warn(
        `[order-text-export] ${sideId}: SVG 생성 실패로 기존 생산 자산을 유지합니다.`,
        error
      );
    }
  }

  return results;
}
