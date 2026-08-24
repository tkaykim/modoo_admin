import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNaverCombinationOptions,
  INCLUDED_10CM_PRINT_TIER,
  STANDARD_PRINT_SUPPLEMENT_GROUPS,
} from './product-options';

const colors = [
  { name: '화이트', code: '001' },
  { name: '블랙', code: '005' },
];
const sizes = [
  { label: 'M (95)', code: 'M' },
  { label: 'L (100)', code: 'L' },
];
const printTiers = [
  { name: '소형 (10×10cm 이내)', code: '10X10', optionPrice: 0 },
  { name: '중형 (A4 이내)', code: 'A4', optionPrice: 2000 },
  { name: '대형 (A3 이내)', code: 'A3', optionPrice: 4000 },
];

test('기본 10cm 포함 옵션과 추가 인쇄 상품을 기준 구조로 만든다', () => {
  const result = buildNaverCombinationOptions({
    productCode: '00085-CVT',
    colors,
    sizes,
    config: {
      colorCodes: ['005'],
      sizeCodes: ['M', 'L'],
      printTiers: [INCLUDED_10CM_PRINT_TIER],
      supplementGroups: STANDARD_PRINT_SUPPLEMENT_GROUPS,
    },
  });
  assert.equal(result.combinationCount, 2);
  assert.equal(result.supplementCount, 13);
  const combinations = result.optionInfo.optionCombinations as Array<Record<string, unknown>>;
  assert.deepEqual(combinations[0], {
    stockQuantity: 99999,
    price: 0,
    usable: true,
    optionName1: '블랙',
    optionName2: 'M (95)',
    optionName3: '기본 10cm 이내 인쇄비가 포함되어 있습니다',
    sellerManagerCode: '85C|005|M|B10',
  });
  assert.equal(result.optionInfo.useStockManagement, true);
  const supplementInfo = result.supplementProductInfo as { supplementProducts: Array<Record<string, unknown>> };
  assert.deepEqual(supplementInfo.supplementProducts[0], {
    groupName: '기본인쇄 변경(수량만큼)',
    name: '앞면 A4',
    price: 2000,
    stockQuantity: 9999999,
    sellerManagementCode: '85C|UP-A4-F',
    usable: true,
  });
  assert.equal(new Set(supplementInfo.supplementProducts.map((product) => product.sellerManagementCode)).size, 13);
});

test('A4와 A3 조합옵션 관리 코드를 서로 다르게 만든다', () => {
  const result = buildNaverCombinationOptions({
    productCode: '00085-CVT',
    colors,
    sizes,
    config: { colorCodes: ['005'], sizeCodes: ['M'], printTiers },
  });
  const combinations = result.optionInfo.optionCombinations as Array<Record<string, unknown>>;
  assert.equal(combinations[1].sellerManagerCode, '85C|005|M|A4');
  assert.equal(combinations[2].sellerManagerCode, '85C|005|M|A3');
});

test('존재하지 않는 요청 옵션은 등록 전에 차단한다', () => {
  assert.throws(() => buildNaverCombinationOptions({
    productCode: '00085-CVT',
    colors,
    sizes,
    config: { colorCodes: ['없는색'], printTiers },
  }), /자체몰에 없는 색상 옵션/);
});

test('네이버 최대 조합 수를 넘으면 등록 전에 차단한다', () => {
  assert.throws(() => buildNaverCombinationOptions({
    productCode: '00085-CVT',
    colors,
    sizes,
    config: { printTiers, maxCombinations: 11 },
  }), /옵션 조합이 12개/);
});

test('조합별 재고 합계가 네이버 상품 총재고 상한을 넘으면 차단한다', () => {
  assert.throws(() => buildNaverCombinationOptions({
    productCode: '00085-CVT',
    colors,
    sizes,
    config: { printTiers, combinationStockQuantity: 99_999_999 },
  }), /상품 총재고/);
});
