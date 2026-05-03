import type { CoBuyParticipant } from '@/types/types';

/**
 * 참가자 한 명의 라인아이템을 size → 총 수량 맵에 누적한다.
 * selected_items가 있으면 우선 사용하고, 없으면 selected_size 문자열
 * (예: "M(2)", "S(1), L(1)")을 파싱한다.
 */
export function addParticipantLineItemsToSizeCounts(
  counts: Map<string, number>,
  p: Pick<CoBuyParticipant, 'selected_items' | 'selected_size'>
): void {
  const items = p.selected_items;
  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      const q =
        typeof item.quantity === 'number' && Number.isFinite(item.quantity)
          ? Math.max(0, item.quantity)
          : 0;
      const size = item.size?.trim();
      if (!size || q <= 0) continue;
      counts.set(size, (counts.get(size) || 0) + q);
    }
    return;
  }

  const raw = p.selected_size?.trim();
  if (!raw) return;

  for (const part of raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = part.match(/^(.+)\((\d+)\)\s*$/);
    if (m) {
      const sizeLabel = m[1].trim();
      const qty = Math.max(0, parseInt(m[2], 10) || 0);
      if (sizeLabel && qty > 0) counts.set(sizeLabel, (counts.get(sizeLabel) || 0) + qty);
    } else {
      counts.set(part, (counts.get(part) || 0) + 1);
    }
  }
}
