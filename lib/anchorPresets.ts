/**
 * Built-in anchor presets and label resolver.
 *
 * Anchors are stored on `product_calibrations.payload.registeredAnchors[]` as
 * { id, xMm, yMm, recommendedWidthMm, recommendedHeightMm, label? }. The label
 * field was added later — older rows may lack it. This module provides a
 * resolver that prefers payload label, falls back to built-in id mapping, and
 * finally falls back to "사용자 정의".
 */

export interface AnchorPreset {
  id: string;
  xMm: number;
  yMm: number;
  recommendedWidthMm: number;
  recommendedHeightMm: number;
  /** Optional snapshot label. Newer rows include this; older rows may not. */
  label?: string;
}

export const BUILTIN_ANCHOR_LABELS: Record<string, string> = {
  'left-chest': '왼쪽 가슴',
  'right-chest': '오른쪽 가슴',
  'chest-center': '가슴 중앙',
  'back-center': '등판 중앙',
  'back-top': '등판 상단',
  'back-bottom': '등판 하단',
  'neck-back': '목뒤',
  'left-forearm': '왼팔뚝',
  'right-forearm': '오른팔뚝',
  'left-wrist': '왼손목',
  'right-wrist': '오른손목',
};

export function resolveAnchorLabel(anchor: AnchorPreset): string {
  if (anchor.label && anchor.label.trim().length > 0) return anchor.label;
  const builtin = BUILTIN_ANCHOR_LABELS[anchor.id];
  if (builtin) return builtin;
  // Custom anchors with no embedded label: degrade gracefully.
  return '사용자 정의';
}
