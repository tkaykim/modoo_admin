import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveObjectSizeMm } from './canvasUtils';

test('live canvas dimensions override stale alpha-stamped dimensions', () => {
  const result = resolveObjectSizeMm({
    sizeBasis: 'alpha',
    storedWidthMm: 343.5,
    storedHeightMm: 475.7,
    liveWidthMm: 292.1,
    liveHeightMm: 404.4,
  });

  assert.deepEqual(result, {
    widthMm: 292.1,
    heightMm: 404.4,
  });
});

test('stored dimensions remain available while the live canvas is not measurable', () => {
  const result = resolveObjectSizeMm({
    sizeBasis: 'alpha',
    storedWidthMm: 343.5,
    storedHeightMm: 475.7,
  });

  assert.deepEqual(result, {
    widthMm: 343.5,
    heightMm: 475.7,
  });
});

test('invalid live dimensions do not replace valid stored dimensions', () => {
  const result = resolveObjectSizeMm({
    storedWidthMm: 120,
    storedHeightMm: 160,
    liveWidthMm: 0,
    liveHeightMm: Number.NaN,
  });

  assert.deepEqual(result, {
    widthMm: 120,
    heightMm: 160,
  });
});
