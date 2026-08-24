import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNaverCombinationOptions } from './product-options';

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

test('색상·사이즈·인쇄 크기를 조합하고 관리 코드를 만든다', () => {
  const result = buildNaverCombinationOptions({
    productCode: '00085-CVT',
    colors,
    sizes,
    config: { colorCodes: ['005'], sizeCodes: ['M', 'L'], printTiers },
  });
  assert.equal(result.combinationCount, 6);
  const combinations = result.optionInfo.optionCombinations as Array<Record<string, unknown>>;
  assert.deepEqual(combinations[0], {
    stockQuantity: 9999,
    price: 0,
    usable: true,
    optionName1: '블랙',
    optionName2: 'M (95)',
    optionName3: '소형 (10×10cm 이내)',
    sellerManagerCode: '85C|005|M|1',
  });
  assert.equal(combinations.at(-1)?.price, 4000);
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
