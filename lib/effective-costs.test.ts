import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveFactoryCost } from './effective-costs';

test('excludes a factory amount when print cost already covers the same work', () => {
  assert.deepEqual(effectiveFactoryCost(4_500, 45_000), {
    effective: 0,
    overlapExcluded: 4_500,
  });
});

test('keeps a standalone factory processing cost', () => {
  assert.deepEqual(effectiveFactoryCost(130_000, 0), {
    effective: 130_000,
    overlapExcluded: 0,
  });
});
