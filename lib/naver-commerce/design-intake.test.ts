import assert from 'node:assert/strict';
import test from 'node:test';
import { extractNaverColorCode, isDesignIntakeEligible, normalizeMobilePhone, toDesignIngestItem } from './design-intake';

test('extracts color from the four-part Naver management code', () => {
  assert.equal(extractNaverColorCode('085-CVT|BK|XL|PRINT-S', '검정 / XL'), 'BK');
  assert.equal(extractNaverColorCode(null, '멜란지 / M'), '멜란지');
});

test('accepts paid non-terminal orders only', () => {
  assert.equal(isDesignIntakeEligible({ payment_date: '2026-08-25T00:00:00Z', product_order_status: 'PAYED', claim_status: null }), true);
  assert.equal(isDesignIntakeEligible({ payment_date: null, product_order_status: 'PAYMENT_WAITING', claim_status: null }), false);
  assert.equal(isDesignIntakeEligible({ payment_date: '2026-08-25T00:00:00Z', product_order_status: 'CANCELED', claim_status: 'CANCEL_DONE' }), false);
});

test('does not send a design link to masked Naver numbers', () => {
  assert.equal(normalizeMobilePhone('050-1234-5678', '010-1111-2222'), '01011112222');
  assert.equal(normalizeMobilePhone('050-1234-5678'), null);
});

test('groups the same product and color independently from size and print options', () => {
  const base = {
    naver_order_id: 'N-1', product_order_status: 'PAYED', claim_status: null, payment_date: '2026-08-25T00:00:00Z',
    origin_product_no: 1, channel_product_no: 2, local_product_id: '7f44e406-35c4-49ec-b5d6-32a5a5e6f511',
    product_name: '085-CVT', option_name: '검정 / XL / 소형', quantity: 3, buyer_name: '고객', buyer_tel: null,
    receiver_tel1: null, receiver_tel2: null,
  };
  const first = toDesignIngestItem({ ...base, product_order_id: 'PO-1', option_manage_code: '085-CVT|BK|XL|PRINT-S' });
  const second = toDesignIngestItem({ ...base, product_order_id: 'PO-2', option_manage_code: '085-CVT|BK|M|PRINT-L' });
  assert.equal(first.group_key, second.group_key);
});
