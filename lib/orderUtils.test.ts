import assert from 'node:assert/strict';
import test from 'node:test';
import { formatOrderColor, formatOrderSizeName, getOrderItemColorLabel } from './orderUtils';

test('사이즈명이 제조사 코드를 이미 포함하면 코드를 반복하지 않는다', () => {
  assert.equal(formatOrderSizeName('110 (아동용) 품절', '110'), '110 (아동용) 품절');
  assert.equal(formatOrderSizeName('L', '100'), 'L (100)');
});

test('주문 의류 색상명과 제조사 코드를 함께 표시한다', () => {
  const item = {
    quantity: 1,
    item_options: {
      variants: [{ color_name: '화이트', color_code: '001', quantity: 1 }],
    },
  };

  assert.equal(getOrderItemColorLabel(item), '화이트(001)');
  assert.equal(formatOrderColor('블랙', null), '블랙');
});

test('구형 단일 옵션 주문의 색상도 표시한다', () => {
  const item = {
    quantity: 1,
    item_options: {
      color_name: '네이비',
      color_code: '003',
    },
  };

  assert.equal(getOrderItemColorLabel(item), '네이비(003)');
});
