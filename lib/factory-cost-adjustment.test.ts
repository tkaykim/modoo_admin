import assert from 'node:assert/strict';
import test from 'node:test';

import { requiresFactoryCostReason } from './factory-cost-adjustment';

test('signed factory-cost adjustments require a reason', () => {
  assert.equal(requiresFactoryCostReason(500, 'auto_match'), true);
  assert.equal(requiresFactoryCostReason(-500, 'auto_match'), true);
});

test('manual, negotiated, and override costs require a reason', () => {
  assert.equal(requiresFactoryCostReason(0, 'manual'), true);
  assert.equal(requiresFactoryCostReason(0, 'negotiated'), true);
  assert.equal(requiresFactoryCostReason(0, 'override'), true);
});

test('an unchanged auto-matched base cost does not require a reason', () => {
  assert.equal(requiresFactoryCostReason('', 'auto_match'), false);
  assert.equal(requiresFactoryCostReason(null, null), false);
});
