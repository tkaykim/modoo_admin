export const BUILTIN_ANCHOR_IDS = [
  'left-chest',
  'right-chest',
  'chest-center',
  'neck-back',
  'back-top',
  'back-center',
  'back-bottom',
  'left-forearm',
  'right-forearm',
  'left-wrist',
  'right-wrist',
] as const;

export type AnchorId = string;

export const ANCHOR_LABELS_KO: Record<string, string> = {
  'left-chest': '왼쪽 가슴',
  'right-chest': '오른쪽 가슴',
  'chest-center': '가슴 중앙',
  'neck-back': '목뒤',
  'back-top': '등판 상단',
  'back-center': '등판 중앙',
  'back-bottom': '등판 하단',
  'left-forearm': '왼팔뚝',
  'right-forearm': '오른팔뚝',
  'left-wrist': '왼손목',
  'right-wrist': '오른손목',
};

export interface CustomAnchorDef {
  id: string;
  label: string;
}

export interface CalibrationLine {
  id: string;
  label: string;
  p1: { xPx: number; yPx: number };
  p2: { xPx: number; yPx: number };
  measuredMm: number;
  active: boolean;
}

export interface MockupCalibration {
  mockupDataUrl: string | null;
  imageNativeWidthPx: number;
  imageNativeHeightPx: number;
  lines: CalibrationLine[];
  legacyProductWidthMm?: number;
}

export interface AnchorPlacement {
  id: AnchorId;
  xMm: number;
  yMm: number;
  recommendedWidthMm: number;
  recommendedHeightMm: number;
  /**
   * Human-readable label snapshot at save time (resolved via getAnchorLabel).
   * Embedded so user/admin canvases can render labels without access to the
   * test page's customAnchors localStorage. Optional for backwards compat.
   */
  label?: string;
}

export interface ComparisonScenario {
  id: string;
  name: string;
  widthMmNew: number;
  heightMmNew: number;
  groundTruthWidthMm?: number;
  groundTruthHeightMm?: number;
  createdAt: number;
}

export interface TestSide {
  id: string;
  name: string;
  mockup: MockupCalibration;
  applicableAnchors: AnchorId[];
  registeredAnchors: AnchorPlacement[];
  scenarios?: ComparisonScenario[];
}

export interface TestProduct {
  id: string;
  name: string;
  productCode?: string | null;
  manufacturerName?: string | null;
  sides: TestSide[];
}

export interface CalibrationState {
  products: TestProduct[];
  selectedProductId: string | null;
  selectedSideId: string | null;
  customAnchors: CustomAnchorDef[];
  schemaVersion: 1;
}

export const EMPTY_MOCKUP: MockupCalibration = {
  mockupDataUrl: null,
  imageNativeWidthPx: 0,
  imageNativeHeightPx: 0,
  lines: [],
};

export const DEFAULT_APPLICABLE_ANCHORS: Record<string, AnchorId[]> = {
  front: ['left-chest', 'right-chest', 'chest-center'],
  back: ['neck-back', 'back-top', 'back-center', 'back-bottom'],
  'left-sleeve': ['left-forearm', 'left-wrist'],
  'right-sleeve': ['right-forearm', 'right-wrist'],
  hood: [],
};

export function getAnchorLabel(
  id: AnchorId,
  custom: CustomAnchorDef[] = [],
): string {
  return ANCHOR_LABELS_KO[id] ?? custom.find((c) => c.id === id)?.label ?? id;
}
