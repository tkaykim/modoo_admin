// 실행: npx tsx --test lib/orderEffectivePrice.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateOrderAdjustments, getPaidForItems } from './orderEffectivePrice';

const sum = (map: Map<string, { effectiveSubtotal: number }>) =>
  [...map.values()].reduce((s, v) => s + v.effectiveSubtotal, 0);

test('할인이 없으면 정가 그대로', () => {
  const paid = getPaidForItems(62700, 3000);
  const map = allocateOrderAdjustments([{ id: 'a', unitPrice: 19900, quantity: 3 }], paid);
  assert.deepEqual(map.get('a'), { listSubtotal: 59700, effectiveSubtotal: 59700, effectiveUnitPrice: 19900 });
});

test('단일 품목 관리자 할인 1만 원 (179,300원·11벌 → 실결제 172,300원, 배송비 3,000원)', () => {
  const paid = getPaidForItems(172300, 3000);
  const map = allocateOrderAdjustments([{ id: 'a', unitPrice: 16300, quantity: 11 }], paid);
  assert.equal(map.get('a')?.effectiveSubtotal, 169300);
  assert.equal(map.get('a')?.effectiveUnitPrice, 15391);
});

test('여러 품목 쿠폰+관리자 할인은 정가 소계 비율로 나누고 합계가 실결제와 정확히 같다', () => {
  // 쿠폰 10,000 + 관리자 할인 48,000, 총액 278,000, 배송비 3,000 → 품목 몫 275,000
  const paid = getPaidForItems(278000, 3000);
  const items = [
    { id: 'a', unitPrice: 19900, quantity: 7 },
    { id: 'b', unitPrice: 15000, quantity: 5 },
    { id: 'c', unitPrice: 23740, quantity: 5 },
  ];
  const listTotal = 19900 * 7 + 15000 * 5 + 23740 * 5;
  assert.equal(listTotal, 333000);
  const map = allocateOrderAdjustments(items, paid);
  assert.equal(sum(map), 275000);
  for (const item of items) {
    const effective = map.get(item.id)!;
    const expected = (item.unitPrice * item.quantity * 275000) / 333000;
    assert.ok(Math.abs(effective.effectiveSubtotal - expected) < 1, `${item.id} 비율 배분`);
    assert.ok(effective.effectiveUnitPrice < item.unitPrice, `${item.id} 할인 반영`);
  }
});

test('추가금이 있으면 정가보다 높아진다', () => {
  const paid = getPaidForItems(65700, 3000); // 정가 59,700 + 추가금 3,000
  const map = allocateOrderAdjustments([{ id: 'a', unitPrice: 19900, quantity: 3 }], paid);
  assert.equal(map.get('a')?.effectiveSubtotal, 62700);
  assert.equal(map.get('a')?.effectiveUnitPrice, 20900);
});

test('수량 0 품목(고객 입력 대기)은 배분하지 않는다', () => {
  const map = allocateOrderAdjustments(
    [{ id: 'a', unitPrice: 19900, quantity: 3 }, { id: 'b', unitPrice: 45300, quantity: 0 }],
    54700,
  );
  assert.equal(map.has('b'), false);
  assert.equal(map.get('a')?.effectiveSubtotal, 54700);
});

test('전액 할인(총액 0원)이면 0원', () => {
  const map = allocateOrderAdjustments(
    [{ id: 'a', unitPrice: 36000, quantity: 2 }, { id: 'b', unitPrice: 36000, quantity: 2 }],
    getPaidForItems(0, 0),
  );
  assert.equal(map.get('a')?.effectiveUnitPrice, 0);
  assert.equal(sum(map), 0);
});

test('배송비가 총액보다 커도 음수가 되지 않는다', () => {
  assert.equal(getPaidForItems(0, 3000), 0);
});

test('나머지 원은 소수점이 큰 품목부터 1원씩 채운다', () => {
  // 3개 품목 동일 소계, 품목 몫 100원 → 34, 33, 33
  const map = allocateOrderAdjustments(
    [{ id: 'a', unitPrice: 10, quantity: 1 }, { id: 'b', unitPrice: 10, quantity: 1 }, { id: 'c', unitPrice: 10, quantity: 1 }],
    100,
  );
  assert.equal(sum(map), 100);
  assert.deepEqual([...map.values()].map((v) => v.effectiveSubtotal).sort(), [33, 33, 34]);
});
