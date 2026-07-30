import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindCustomFontsToCanvasState,
  extractCustomFontsFromCanvasState,
  mergeCustomFonts,
} from './font-contract';

const font = {
  fontFamily: 'Modoo Custom Customer Font abc12345',
  displayName: 'Customer Font',
  fileName: 'customer.otf',
  url: 'https://example.com/user-fonts/customer.otf',
  path: 'fonts/customer.otf',
  format: 'otf',
};

test('admin recovers the exact uploaded font from object-level metadata', () => {
  const fonts = extractCustomFontsFromCanvasState({
    front: JSON.stringify({
      objects: [{
        type: 'CurvedText',
        fontFamily: font.fontFamily,
        data: { fontUrl: font.url, fontMetadata: font },
      }],
    }),
  });
  assert.deepEqual(fonts, [font]);
});

test('font identity includes its immutable URL', () => {
  assert.equal(mergeCustomFonts(
    [font],
    [{ ...font, url: `${font.url}?version=2` }],
  ).length, 2);
});

test('admin save re-embeds immutable font metadata into the canvas object', () => {
  const bound = bindCustomFontsToCanvasState(
    {
      front: {
        objects: [{
          type: 'i-text',
          fontFamily: font.fontFamily,
          text: 'ASL',
        }],
      },
    },
    [font]
  );
  const state = bound.canvasState.front as {
    objects: Array<{ data?: Record<string, unknown> }>;
  };
  assert.equal(state.objects[0].data?.fontUrl, font.url);
  assert.deepEqual(state.objects[0].data?.fontMetadata, font);
  assert.equal(state.objects[0].data?.fontDisplayName, font.displayName);
});
