import type { JsonRecord, NaverProductOptionConfig, NaverSupplementGroup } from './types';

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
  supplementProductInfo: JsonRecord;
  colors: LocalProductColor[];
  sizes: LocalProductSize[];
  combinationCount: number;
  supplementCount: number;
};

export const INCLUDED_10CM_PRINT_TIER = {
  code: 'B10',
  name: '기본 10cm 이내 인쇄비가 포함되어 있습니다',
  optionPrice: 0,
} as const;

export const STANDARD_PRINT_SUPPLEMENT_GROUPS: NaverSupplementGroup[] = [
  {
    groupName: '기본인쇄 변경(수량만큼)',
    products: [
      { code: 'UP-A4-F', name: '앞면 A4', price: 2_000 },
      { code: 'UP-A4-B', name: '뒷면 A4', price: 2_000 },
      { code: 'UP-A3-F', name: '앞면 A3', price: 4_000 },
      { code: 'UP-A3-B', name: '뒷면 A3', price: 4_000 },
    ],
  },
  {
    groupName: '추가인쇄 10cm(수량만큼)',
    products: [
      { code: 'ADD-S-RC', name: '오른쪽 가슴', price: 2_000 },
      { code: 'ADD-S-LC', name: '왼쪽 가슴', price: 2_000 },
      { code: 'ADD-S-RS', name: '오른쪽 소매', price: 2_000 },
      { code: 'ADD-S-LS', name: '왼쪽 소매', price: 2_000 },
      { code: 'ADD-S-BN', name: '뒷목', price: 2_000 },
    ],
  },
  {
    groupName: '추가인쇄 A4(수량만큼)',
    products: [
      { code: 'ADD-A4-F', name: '앞면', price: 4_000 },
      { code: 'ADD-A4-B', name: '뒷면', price: 4_000 },
    ],
  },
  {
    groupName: '추가인쇄 A3(수량만큼)',
    products: [
      { code: 'ADD-A3-F', name: '앞면', price: 6_000 },
      { code: 'ADD-A3-B', name: '뒷면', price: 6_000 },
    ],
  },
];

const normalize = (value: string) => value.trim().toLocaleLowerCase('ko-KR');
const safeCode = (value: string) => value.trim().replace(/[|\r\n]/g, '-');
const compactOptionCode = (value: string) => safeCode(value).replace(/[^0-9A-Za-z가-힣-]/g, '').toUpperCase().slice(0, 4);
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
  const combinationStockQuantity = input.config.combinationStockQuantity ?? 99_999;
  const supplementStockQuantity = input.config.supplementStockQuantity ?? 9_999_999;
  const supplementGroups = input.config.supplementGroups ?? [];
  if (!colors.length) throw new Error('네이버에 등록할 색상 옵션이 없습니다.');
  if (!sizes.length) throw new Error('네이버에 등록할 사이즈 옵션이 없습니다.');
  if (!printTiers.length) throw new Error('네이버에 등록할 인쇄 옵션이 없습니다.');
  for (const tier of printTiers) {
    if (!Number.isSafeInteger(tier.optionPrice) || tier.optionPrice < 0) {
      throw new Error(`인쇄 옵션가는 0 이상의 정수여야 합니다: ${tier.name}`);
    }
  }
  for (const [label, quantity] of [
    ['조합옵션 재고', combinationStockQuantity],
    ['추가상품 재고', supplementStockQuantity],
  ] as const) {
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 99_999_999) {
      throw new Error(`${label}는 1 이상 99,999,999 이하의 정수여야 합니다.`);
    }
  }
  const combinationCount = colors.length * sizes.length * printTiers.length;
  const maxCombinations = input.config.maxCombinations ?? 500;
  if (combinationCount > maxCombinations) {
    throw new Error(`네이버 옵션 조합이 ${combinationCount}개입니다. ${maxCombinations}개 이하로 색상이나 사이즈를 줄여 주세요.`);
  }
  const optionCombinations = colors.flatMap((color) => sizes.flatMap((size) => printTiers.map((tier) => ({
    stockQuantity: combinationStockQuantity,
    price: tier.optionPrice,
    usable: true,
    optionName1: color.name,
    optionName2: size.label,
    optionName3: tier.name,
    sellerManagerCode: [
      compactProductCode(input.productCode),
      compactOptionCode(color.code || color.name),
      compactOptionCode(size.code || size.label),
      compactOptionCode(tier.code),
    ].join('|'),
  }))));
  const tooLongCode = optionCombinations.find((option) => option.sellerManagerCode.length >= 20);
  if (tooLongCode) throw new Error(`네이버 옵션 관리 코드는 20자 미만이어야 합니다: ${tooLongCode.sellerManagerCode}`);
  const compactCode = compactProductCode(input.productCode);
  const supplementProducts = supplementGroups.flatMap((group) => group.products.map((product) => {
    if (!group.groupName.trim() || !product.name.trim() || !product.code.trim()) {
      throw new Error('추가상품 그룹명, 상품명, 관리 코드는 비워 둘 수 없습니다.');
    }
    if (group.groupName.trim().length >= 20 || product.name.trim().length >= 20) {
      throw new Error(`네이버 추가상품 그룹명과 상품명은 20자 미만이어야 합니다: ${group.groupName} / ${product.name}`);
    }
    if (!Number.isSafeInteger(product.price) || product.price < 0) {
      throw new Error(`추가상품가는 0 이상의 정수여야 합니다: ${product.name}`);
    }
    const sellerManagementCode = `${compactCode}|${safeCode(product.code).toUpperCase()}`;
    if (sellerManagementCode.length >= 20) {
      throw new Error(`네이버 추가상품 관리 코드는 20자 미만이어야 합니다: ${sellerManagementCode}`);
    }
    return {
      groupName: group.groupName.trim(),
      name: product.name.trim(),
      price: product.price,
      stockQuantity: supplementStockQuantity,
      sellerManagementCode,
      usable: true,
    };
  }));
  const managementCodes = [
    ...optionCombinations.map((option) => option.sellerManagerCode),
    ...supplementProducts.map((product) => product.sellerManagementCode),
  ];
  if (new Set(managementCodes).size !== managementCodes.length) {
    throw new Error('네이버 옵션 또는 추가상품 관리 코드가 중복됩니다.');
  }
  if (combinationCount * combinationStockQuantity > 99_999_999) {
    throw new Error(`네이버 상품 총재고가 ${combinationCount * combinationStockQuantity}개입니다. 99,999,999개 이하로 조합별 재고를 줄여 주세요.`);
  }
  return {
    colors,
    sizes,
    combinationCount,
    supplementCount: supplementProducts.length,
    supplementProductInfo: {
      sortType: 'CREATE',
      supplementProducts,
    },
    optionInfo: {
      simpleOptionSortType: 'CREATE',
      optionSimple: [],
      optionCustom: [],
      optionCombinationSortType: 'CREATE',
      optionCombinationGroupNames: {
        optionGroupName1: '색상',
        optionGroupName2: '사이즈',
        optionGroupName3: '인쇄',
      },
      optionCombinations,
      standardOptionGroups: [],
      optionStandards: [],
      useStockManagement: true,
      optionDeliveryAttributes: [],
    },
  };
}
