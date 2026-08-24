import assert from 'node:assert/strict';
import test from 'node:test';
import { isNaverUnifiedOrder, projectNaverOrdersForAdmin, type NaverProductOrderProjectionRow } from './unified-orders';

function row(overrides: Partial<NaverProductOrderProjectionRow> = {}): NaverProductOrderProjectionRow {
  return {
    product_order_id: 'PO-1',
    naver_order_id: 'ORDER 1',
    product_order_status: 'PAYED',
    claim_status: null,
    last_changed_type: 'PAYED',
    last_changed_at: '2026-08-24T10:01:00.000Z',
    order_date: '2026-08-24T09:00:00.000Z',
    payment_date: '2026-08-24T10:00:00.000Z',
    origin_product_no: 1,
    channel_product_no: 2,
    product_name: '085-CVT 라운드 반팔',
    option_name: '검정 / XL',
    option_manage_code: '085-CVT-BK-XL',
    local_product_id: 'local-1',
    quantity: 10,
    unit_price: 12000,
    total_payment_amount: 120000,
    buyer_name: '주문자',
    buyer_tel: '010-1111-2222',
    receiver_name: '수령인',
    receiver_tel1: '010-3333-4444',
    receiver_tel2: null,
    receiver_zip_code: '01234',
    receiver_base_address: '서울시 중구',
    receiver_detail_address: '1층',
    shipping_memo: '문 앞',
    delivery_method: 'DELIVERY',
    delivery_company_code: null,
    tracking_number: null,
    dispatched_at: null,
    synced_at: '2026-08-24T10:02:00.000Z',
    updated_at: '2026-08-24T10:02:00.000Z',
    ...overrides,
  };
}

test('groups product orders by Naver order without mutating source rows', () => {
  const rows = [row(), row({ product_order_id: 'PO-2', product_name: '113-BCV 맨투맨', quantity: 2, total_payment_amount: 50000 })];
  const snapshot = structuredClone(rows);
  const result = projectNaverOrdersForAdmin(rows);

  assert.deepEqual(rows, snapshot);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'NAVER-ORDER 1');
  assert.equal(result[0].external_order_id, 'ORDER 1');
  assert.equal(result[0].naver_management_href, '/naver-commerce?orderId=ORDER%201');
  assert.equal(result[0].total_amount, 170000);
  assert.equal(result[0].order_items.length, 2);
  assert.equal(result[0].payment_status, 'completed');
  assert.equal(result[0].order_status, 'payment_completed');
  assert.equal(isNaverUnifiedOrder(result[0]), true);
});

test('maps delivery, cancellation, and claim states to read-only list summaries', () => {
  const shipping = projectNaverOrdersForAdmin([row({ product_order_status: 'DELIVERING' })])[0];
  const cancelled = projectNaverOrdersForAdmin([row({ product_order_status: 'CANCELED', claim_status: 'CANCEL_DONE' })])[0];
  const partial = projectNaverOrdersForAdmin([
    row({ product_order_status: 'PAYED' }),
    row({ product_order_id: 'PO-2', product_order_status: 'RETURNED', claim_status: 'RETURN_DONE' }),
  ])[0];

  assert.equal(shipping.order_status, 'shipping');
  assert.equal(cancelled.order_status, 'cancelled');
  assert.equal(cancelled.payment_status, 'refunded');
  assert.equal(cancelled.naver_status_label, '취소 완료');
  assert.equal(partial.order_status, 'partially_cancelled');
});

test('keeps a no-payment cancellation distinct from a refund', () => {
  const result = projectNaverOrdersForAdmin([row({
    product_order_status: 'CANCELED_BY_NOPAYMENT',
    payment_date: null,
  })])[0];

  assert.equal(result.order_status, 'cancelled');
  assert.equal(result.payment_status, 'failed');
  assert.equal(result.naver_status_label, '미결제 취소');
});

test('projects design intake progress without changing the Naver order source', () => {
  const result = projectNaverOrdersForAdmin([row()], new Map([
    ['ORDER 1', { status: 'submitted', job_count: 2, submitted_job_count: 2 }],
  ]))[0];
  assert.equal(result.naver_design_status_label, '디자인 접수 완료');
  assert.equal(result.naver_design_progress, '2/2');
  assert.equal(result.order_source, 'naver_smartstore');
});
