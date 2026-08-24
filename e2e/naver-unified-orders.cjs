/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3105';
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error('E2E_ADMIN_EMAIL과 E2E_ADMIN_PASSWORD가 필요합니다.');
}

const regularOrder = {
  id: 'ORDER-E2E-REGULAR-1001',
  user_id: null,
  customer_name: '기존 주문 고객',
  customer_email: 'existing@example.com',
  customer_phone: '010-1111-2222',
  recipient_name: '기존 주문 고객',
  recipient_phone: '010-1111-2222',
  recipient_same_as_orderer: true,
  order_category: 'regular',
  parent_order_id: null,
  inquiry_id: null,
  delivery_fee: 3500,
  created_at: '2026-08-24T08:00:00.000Z',
  paid_at: '2026-08-24T08:01:00.000Z',
  updated_at: '2026-08-24T08:01:00.000Z',
  total_amount: 30000,
  order_status: 'payment_completed',
  payment_status: 'completed',
  payment_method: 'toss',
  payment_key: null,
  shipping_method: 'domestic',
  country_code: 'KR',
  postal_code: '01234',
  state: null,
  city: null,
  address_line_1: '서울시 중구',
  address_line_2: '1층',
  tracking_number: null,
  tracking_carrier: null,
  logen_registered_at: null,
  logen_slip_printed: false,
  refund_reason: null,
  customer_note: null,
  attachment_urls: [],
  notes: null,
  original_amount: null,
  custom_unit_price: null,
  admin_discount: 0,
  admin_surcharge: 0,
  coupon_discount: 0,
  applied_coupon_id: null,
  pricing_note: null,
  payment_link_token: null,
  share_token: null,
  partner_mall_id: null,
  partner_mall: null,
  salesman_id: null,
  attributed_salesman: null,
  order_items: [{
    id: 'ITEM-E2E-REGULAR-1',
    purchase_order_status: 'pending',
    design_title: '기존 자체몰 디자인',
    product_title: '기존 자체몰 상품',
    quantity: 1,
    assigned_manufacturer_id: null,
    factory_assigned_at: null,
    factory_status: null,
    factory_amount: null,
    deadline: null,
  }],
};

const naverOrder = {
  ...regularOrder,
  id: 'NAVER-E2E-NAVER-ORDER-1001',
  customer_name: '네이버 주문 고객',
  customer_email: '',
  order_source: 'naver_smartstore',
  external_order_id: 'E2E-NAVER-ORDER-1001',
  naver_management_href: '/naver-commerce?orderId=E2E-NAVER-ORDER-1001',
  naver_status_label: '결제 완료',
  naver_product_summary: '085-CVT 라운드 반팔',
  naver_option_summary: '검정 / XL',
  payment_method: 'admin',
  total_amount: 120000,
  order_items: [{
    id: 'E2E-NAVER-PRODUCT-ORDER-1',
    purchase_order_status: null,
    design_title: '085-CVT 라운드 반팔',
    product_title: '085-CVT 라운드 반팔',
    quantity: 10,
    assigned_manufacturer_id: null,
    factory_assigned_at: null,
    factory_status: null,
    factory_amount: null,
    deadline: null,
  }],
};

const naverDashboard = {
  configured: true,
  products: [],
  orders: [{
    product_order_id: 'E2E-NAVER-PRODUCT-ORDER-1',
    naver_order_id: 'E2E-NAVER-ORDER-1001',
    product_name: '085-CVT 라운드 반팔',
    option_name: '검정 / XL',
    quantity: 10,
    product_order_status: 'PAYED',
    receiver_name: '네이버 주문 고객',
    receiver_tel1: '010-3333-4444',
    total_payment_amount: 120000,
    payment_date: '2026-08-24T09:00:00.000Z',
    local_product_id: 'local-085',
    tracking_number: null,
  }],
  shipments: [],
  settlements: [],
  settlementSummary: { sale: 0, settlement: 0, commission: 0 },
  qnas: [],
  syncRuns: [],
  localProducts: [],
  reviewApiAvailable: false,
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  const mutationRequests = [];
  const orderRequestUrls = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(baseUrl).origin && url.pathname.startsWith('/api/admin/') && request.method() !== 'GET') {
      mutationRequests.push(`${request.method()} ${url.pathname}`);
    }
  });

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(document.querySelector('#email')?._valueTracker), null, { timeout: 15000 });
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 }),
      page.getByRole('button', { name: '로그인' }).click(),
    ]);

    const liveChecks = await page.evaluate(async () => {
      const urls = [
        '/api/admin/orders',
        '/api/admin/orders?includeNaver=1',
        '/api/admin/orders?status=all&withMedia=1',
      ];
      const checks = [];
      for (const url of urls) {
        let response;
        let payload;
        let attempts = 0;
        do {
          attempts += 1;
          response = await fetch(url);
          payload = await response.json();
          if (response.status < 500) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } while (attempts < 2);
        checks.push({
          url,
          status: response.status,
          count: Array.isArray(payload.data) ? payload.data.length : -1,
          naverCount: Array.isArray(payload.data) ? payload.data.filter((row) => row.order_source === 'naver_smartstore').length : -1,
          attempts,
          error: payload.error || null,
        });
      }
      return checks;
    });
    liveChecks.forEach((check) => assert.equal(check.status, 200, `${check.url} 응답 실패`));
    assert.equal(liveChecks[0].count, liveChecks[2].count, '기존 배송용 주문 조회 행 수가 바뀌었습니다.');
    assert.equal(liveChecks[2].naverCount, 0, '배송용 주문 조회에 네이버 행이 포함됐습니다.');

    await page.route('**/api/admin/orders?*', async (route) => {
      orderRequestUrls.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [regularOrder, naverOrder] }) });
    });
    await page.route('**/api/admin/order-assignments', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { enabled: true, can_claim: true, can_assign_others: false, viewer_id: 'e2e', viewer_name: 'E2E', assignments: [] } }),
    }));
    await page.route('**/api/admin/factories', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
    await page.route('**/api/admin/naver-commerce', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: naverDashboard }) }));

    await page.goto(`${baseUrl}/orders`, { waitUntil: 'domcontentloaded' });
    const naverRow = page.locator('tr[data-order-source="naver_smartstore"]');
    const regularRow = page.locator('tr[data-order-source="modoo"]').filter({ hasText: '기존 주문 고객' });
    await naverRow.waitFor({ state: 'visible', timeout: 15000 });
    await regularRow.waitFor({ state: 'visible', timeout: 15000 });

    assert.equal(await naverRow.count(), 1, '네이버 주문이 한 행으로 묶이지 않았습니다.');
    assert.equal(await naverRow.getByText('네이버 스마트스토어', { exact: true }).count(), 1, '주문 경로 배지가 없습니다.');
    assert.equal(await naverRow.getByText('네이버페이 · 결제완료', { exact: true }).count(), 1, '네이버 결제 표기가 없습니다.');
    assert.equal(await naverRow.locator('select').count(), 0, '네이버 주문에 수정 가능한 select가 노출됐습니다.');
    assert.equal(await naverRow.getByRole('button', { name: '공장배정' }).count(), 0, '네이버 주문에 공장배정 버튼이 노출됐습니다.');
    assert.equal(await naverRow.getByRole('button', { name: '환불' }).count(), 0, '네이버 주문에 자체몰 환불 버튼이 노출됐습니다.');
    assert.equal(await naverRow.getByRole('button', { name: '삭제' }).count(), 0, '네이버 주문에 삭제 버튼이 노출됐습니다.');
    assert.equal(await regularRow.getByRole('button', { name: '공장배정' }).count(), 1, '기존 주문 공장배정 버튼이 사라졌습니다.');
    assert.equal(await regularRow.getByRole('button', { name: '환불' }).count(), 1, '기존 주문 환불 버튼이 사라졌습니다.');
    assert.ok(orderRequestUrls.some((url) => url.includes('includeNaver=1')), '주문 목록이 네이버 포함 조회를 요청하지 않았습니다.');

    fs.mkdirSync(path.join(process.cwd(), '.artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(process.cwd(), '.artifacts', 'naver-unified-orders-e2e.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileNaverCard = page.locator('div[data-order-source="naver_smartstore"]');
    await mobileNaverCard.waitFor({ state: 'visible' });
    assert.equal(await mobileNaverCard.locator('select').count(), 0, '모바일 네이버 주문에 수정 가능한 select가 노출됐습니다.');
    assert.equal(await mobileNaverCard.getByRole('button', { name: '공장배정' }).count(), 0, '모바일 네이버 주문에 공장배정 버튼이 노출됐습니다.');
    assert.equal(await mobileNaverCard.getByRole('button', { name: '환불' }).count(), 0, '모바일 네이버 주문에 자체몰 환불 버튼이 노출됐습니다.');
    await page.screenshot({ path: path.join(process.cwd(), '.artifacts', 'naver-unified-orders-mobile-e2e.png'), fullPage: true });

    await mobileNaverCard.getByTestId('naver-order-manage').click();
    await page.waitForURL('**/naver-commerce?orderId=E2E-NAVER-ORDER-1001', { timeout: 10000 });
    await page.getByText('E2E-NAVER-ORDER-1001', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(mutationRequests.length, 0, `조회 E2E 중 변경 요청이 발생했습니다: ${mutationRequests.join(', ')}`);

    process.stdout.write(JSON.stringify({
      ok: true,
      liveChecks,
      interceptedOrderRows: 2,
      mutationRequests,
      consoleErrors,
      screenshots: ['.artifacts/naver-unified-orders-e2e.png', '.artifacts/naver-unified-orders-mobile-e2e.png'],
    }, null, 2));
  } catch (error) {
    fs.mkdirSync(path.join(process.cwd(), '.artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(process.cwd(), '.artifacts', 'naver-unified-orders-e2e-failed.png'), fullPage: true });
    const failedUrl = new URL(page.url());
    process.stderr.write(`E2E page URL: ${failedUrl.origin}${failedUrl.pathname}\n`);
    process.stderr.write(`E2E page text: ${(await page.locator('body').innerText()).slice(0, 2000)}\n`);
    process.stderr.write(`E2E order requests: ${orderRequestUrls.join(', ')}\n`);
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
