import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMallDraft, extractMallFonts, mallDraftPayload, normalizeMallCanvas, requireMallPrices } from './partner-mall-design';
import type { Product, SavedDesign } from '@/types/types';

const product = { id: 'product', title: 'Shirt', configuration: [] } as unknown as Product;
test('new mall products require an explicit price before persistence', () => {
  const draft = createMallDraft(product);
  for (const price of [null, -1, 1.5, NaN, Infinity]) assert.throws(() => requireMallPrices([{ ...draft, price }]));
  for (const price of [0, 11900]) assert.doesNotThrow(() => requireMallPrices([{ ...draft, price }]));
  assert.throws(() => requireMallPrices([{ ...draft, price: 11900 }, draft]));
});
test('copies all mixed-format sides and nested font/image metadata without mutating source', () => {
  const source = { title: 'Original', product_id: product.id, color_selections: { productColor: '#123456' }, price_per_item: 99999, canvas_state: { front: { objects: [{ type: 'IText', text: 'KEEP', data: { fontUrl: '/font.woff2' } }] }, back: JSON.stringify({ objects: [{ type: 'Image', src: '/logo.png' }] }), left: { objects: [] }, right: { objects: [] }, retired: { objects: [{ type: 'Rect' }] } } } as unknown as SavedDesign;
  const before = structuredClone(source);
  const draft = createMallDraft(product, source);
  assert.equal(draft.color_hex, '#123456');
  assert.equal(draft.price, null);
  assert.deepEqual(Object.keys(draft.canvas_state), ['front', 'back', 'left', 'right', 'retired']);
  draft.canvas_state.front = JSON.stringify({ objects: [] });
  assert.deepEqual(source, before);
  assert.equal(JSON.parse(draft.canvas_state.back).objects[0].src, '/logo.png');
});
test('rejects broken data instead of dropping an unparsed side', () => {
  for (const raw of [[], null, { back: '{broken' }, { back: {} }]) assert.throws(() => normalizeMallCanvas(raw));
});
test('recovers custom fonts inside nested groups when reopening a mall copy', () => {
  const fonts = extractMallFonts({ front: JSON.stringify({ objects: [{ type: 'Group', objects: [{ type: 'Group', objects: [{ type: 'IText', fontFamily: 'CustomFace', data: { fontUrl: 'https://example.test/font.woff2' } }] }] }] }) });
  assert.equal(fonts.length, 1);
  assert.equal(fonts[0].fontFamily, 'CustomFace');
});
test('price validation and payload never forward a source design/order id', () => {
  const draft = createMallDraft(product);
  for (const price of [-1, NaN, Infinity, 1.5]) assert.throws(() => mallDraftPayload({ ...draft, price }));
  for (const price of [null, 0, 24200]) assert.equal(mallDraftPayload({ ...draft, price }).price, price);
  assert.throws(() => mallDraftPayload({ ...draft, display_name: ' ' }));
  const payload = mallDraftPayload(draft);
  assert(!('design_id' in payload)); assert(!('order_id' in payload)); assert(!('id' in payload));
});
