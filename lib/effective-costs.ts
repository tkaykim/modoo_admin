export type EffectiveFactoryCost = {
  effective: number;
  overlapExcluded: number;
};

/**
 * 공장 작업비와 인쇄 원가가 함께 있으면 같은 인쇄 공임의 원본/추정 장부로 본다.
 * 원본 금액은 보존하되 손익에는 한 번만 반영한다.
 */
export function effectiveFactoryCost(factoryAmount: number, printCost: number): EffectiveFactoryCost {
  const factory = Math.max(0, Number(factoryAmount || 0));
  const print = Math.max(0, Number(printCost || 0));

  return print > 0
    ? { effective: 0, overlapExcluded: factory }
    : { effective: factory, overlapExcluded: 0 };
}
