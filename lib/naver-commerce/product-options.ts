import type { JsonRecord, NaverProductOptionConfig } from './types';

export type LocalProductColor = {
  name: string;
  code: string;
};

export type LocalProductSize = {
  label: string;
  code: string;
};

export type NaverOptionBuildResult = {
  optionInfo: JsonRecord;
  colors: LocalProductColor[];
  sizes: LocalProductSize[];
  combinationCount: number;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase('ko-KR');
const safeCode = (value: string) => value.trim().replace(/[|\r\n]/g, '-');
const compactProductCode = (value: string) => {
  const match = value.trim().match(/^0*(\d+)[-_ ]*([A-Za-z가-힣])?/);
  return match ? `${match[1]}${(match[2] || '').toUpperCase()}` : safeCode(value).slice(0, 5);
};

function selectRequested<T extends { name?: string; code: string; label?: string }>(
  available: T[],
  requested: string[] | undefined,
  kind: string,
) {
  if (!requested?.length) return available;
  const selected: T[] = [];
  for (const requestedValue of requested) {
    const target = normalize(requestedValue);
    const match = available.find((item) => (
      normalize(item.code) === target
      || ('name' in item && item.name && normalize(item.name) === target)
      || ('label' in item && item.label && normalize(item.label) === target)
    ));
    if (!match) throw new Error(`자체몰에 없는 ${kind} 옵션입니다: ${requestedValue}`);
    if (!selected.includes(match)) selected.push(match);
  }
  return selected;
}

export function buildNaverCombinationOptions(input: {
  productCode: string;
  colors: LocalProductColor[];
  sizes: LocalProductSize[];
  config: NaverProductOptionConfig;
}): NaverOptionBuildResult {
  const colors = selectRequested(input.colors, input.config.colorCodes, '색상');
  const sizes = selectRequested(input.sizes, input.config.sizeCodes, '사이즈');
  const printTiers = input.config.printTiers;
  if (!colors.length) throw new Error('네이버에 등록할 색상 옵션이 없습니다.');
  if (!sizes.length) throw new Error('네이버에 등록할 사이즈 옵션이 없습니다.');
  if (!printTiers.length) throw new Error('네이버에 등록할 인쇄 옵션이 없습니다.');
  for (const tier of printTiers) {
    if (!Number.isSafeInteger(tier.optionPrice) || tier.optionPrice < 0) {
      throw new Error(`인쇄 옵션가는 0 이상의 정수여야 합니다: ${tier.name}`);
    }
  }
  const combinationCount = colors.length * sizes.length * printTiers.length;
  const maxCombinations = input.config.maxCombinations ?? 500;
  if (combinationCount > maxCombinations) {
    throw new Error(`네이버 옵션 조합이 ${combinationCount}개입니다. ${maxCombinations}개 이하로 색상이나 사이즈를 줄여 주세요.`);
  }
  const optionCombinations = colors.flatMap((color) => sizes.flatMap((size) => printTiers.map((tier) => ({
    stockQuantity: 9999,
    price: tier.optionPrice,
    usable: true,
    optionName1: color.name,
    optionName2: size.label,
    optionName3: tier.name,
    sellerManagerCode: [
      compactProductCode(input.productCode),
      safeCode(color.code || color.name),
      safeCode(size.code || size.label),
      safeCode(tier.code).slice(0, 1),
    ].join('|'),
  }))));
  const tooLongCode = optionCombinations.find((option) => option.sellerManagerCode.length >= 20);
  if (tooLongCode) throw new Error(`네이버 옵션 관리 코드는 20자 미만이어야 합니다: ${tooLongCode.sellerManagerCode}`);
  return {
    colors,
    sizes,
    combinationCount,
    optionInfo: {
      simpleOptionSortType: 'CREATE',
      optionSimple: [],
      optionCustom: [],
      optionCombinationSortType: 'CREATE',
      optionCombinationGroupNames: {
        optionGroupName1: '색상',
        optionGroupName2: '사이즈',
        optionGroupName3: '인쇄 크기',
      },
      optionCombinations,
      standardOptionGroups: [],
      optionStandards: [],
      useStockManagement: false,
      optionDeliveryAttributes: [],
    },
  };
}
