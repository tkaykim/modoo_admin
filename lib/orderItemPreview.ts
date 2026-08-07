import type { ProductSide } from '@/types/types';

/**
 * 주문 상품 썸네일 보정.
 *
 * 배경: order_items.thumbnail_url 은 주문 시점에 "첫 번째 면"(고객앱 = 'front',
 * 관리자 에디터 = sides[0]) 캔버스만 캡처한 정적 스냅샷이다. 디자인이 뒷면·소매에만
 * 있는 주문은 앞면이 비어 있어 아무것도 없는 티셔츠 목업이 저장된다.
 * (2026-08 기준 디자인 있는 주문상품 550건 중 73건이 이 상태)
 *
 * 그래서 표시 시점에 canvas_state 를 보고 "실제로 디자인이 있는 면"을 판별하고,
 * 스냅샷이 빈 면을 찍은 경우에만 그 면의 아트워크 이미지로 대체한다.
 * 앞면에 디자인이 있는 정상 주문은 기존 스냅샷을 그대로 쓴다(동작 변화 없음).
 */

export interface OrderItemPreviewSource {
  canvas_state?: unknown;
  configuration_snapshot?: ProductSide[] | null;
  image_urls?: unknown;
  text_svg_exports?: unknown;
  thumbnail_url?: string | null;
}

export interface OrderItemPreview {
  /** 표시할 이미지. null 이면 호출부가 placeholder 아이콘을 그린다. */
  src: string | null;
  /** 'snapshot' = 저장된 썸네일 그대로 / 'artwork' = 디자인 있는 면의 아트워크로 대체 */
  mode: 'snapshot' | 'artwork';
  /** artwork 모드일 때 어느 면인지 (예: '뒷면'). snapshot 이면 null. */
  sideLabel: string | null;
}

const FALLBACK_SIDE_LABELS: Record<string, string> = {
  front: '앞면',
  back: '뒷면',
  left: '왼쪽',
  right: '오른쪽',
};

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 면별 사용자 오브젝트 수. canvas_state 의 각 면은 객체이거나 JSON 문자열이다. */
function countObjectsBySide(canvasState: unknown): Record<string, number> {
  const root = parseJson(canvasState);
  if (!isRecord(root)) return {};

  const counts: Record<string, number> = {};
  for (const [sideId, sideState] of Object.entries(root)) {
    const parsed = parseJson(sideState);
    const objects = isRecord(parsed) ? parsed.objects : null;
    counts[sideId] = Array.isArray(objects) ? objects.length : 0;
  }
  return counts;
}

/** 면 순서: configuration_snapshot 이 있으면 그 순서, 없으면 canvas_state 키 순서. */
function orderedSideIds(
  counts: Record<string, number>,
  sides: ProductSide[] | null | undefined
): string[] {
  if (!Array.isArray(sides) || sides.length === 0) return Object.keys(counts);
  const configured = sides.map((s) => s.id).filter((id) => id in counts);
  const extras = Object.keys(counts).filter((id) => !configured.includes(id));
  return [...configured, ...extras];
}

function sideLabelOf(sideId: string, sides: ProductSide[] | null | undefined): string {
  const match = Array.isArray(sides) ? sides.find((s) => s.id === sideId) : undefined;
  return match?.name || FALLBACK_SIDE_LABELS[sideId] || sideId;
}

/** image_urls[sideId] 에서 가공본(processed) 우선으로 URL 하나를 고른다. */
function artworkFromImageUrls(imageUrls: unknown, sideId: string): string | null {
  const root = parseJson(imageUrls);
  if (!isRecord(root)) return null;

  const entries = root[sideId];
  if (!Array.isArray(entries)) return null;

  const urls = entries.filter(isRecord);
  const processed = urls.find((e) => e.kind === 'processed' && typeof e.url === 'string');
  const any = urls.find((e) => typeof e.url === 'string');
  return (processed?.url as string) || (any?.url as string) || null;
}

/** 이미지 없이 텍스트만 있는 디자인 대비 — text_svg_exports.__pngs[sideId] 사용. */
function artworkFromTextExports(textSvgExports: unknown, sideId: string): string | null {
  const root = parseJson(textSvgExports);
  if (!isRecord(root)) return null;

  const pngs = parseJson(root.__pngs);
  if (!isRecord(pngs)) return null;

  const bySide = parseJson(pngs[sideId]);
  if (!isRecord(bySide)) return null;

  const first = Object.values(bySide).find((v) => typeof v === 'string' && v);
  return (first as string) || null;
}

export function resolveOrderItemPreview(item: OrderItemPreviewSource): OrderItemPreview {
  const snapshot: OrderItemPreview = {
    src: item.thumbnail_url || null,
    mode: 'snapshot',
    sideLabel: null,
  };

  const counts = countObjectsBySide(item.canvas_state);
  const sideIds = orderedSideIds(counts, item.configuration_snapshot);
  if (sideIds.length === 0) return snapshot;

  // 스냅샷이 캡처한 면 = 첫 번째 면. 여기 디자인이 있으면 스냅샷은 정상이다.
  const capturedSideId = sideIds[0];
  if ((counts[capturedSideId] ?? 0) > 0) return snapshot;

  const designedSideId = sideIds.find((id) => (counts[id] ?? 0) > 0);
  if (!designedSideId) return snapshot; // 디자인 자체가 없는 주문(간이주문 등)

  const artwork =
    artworkFromImageUrls(item.image_urls, designedSideId) ??
    artworkFromTextExports(item.text_svg_exports, designedSideId);

  if (!artwork) return snapshot; // 대체할 아트워크가 없으면 기존 동작 유지

  return {
    src: artwork,
    mode: 'artwork',
    sideLabel: sideLabelOf(designedSideId, item.configuration_snapshot),
  };
}
