import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildOutlinedTextSvg } from './text-outline-export';

test('admin SVG bakes curve, bold, italic, and stroke into font-free paths', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('/fonts/')) {
      const bytes = await readFile(
        new URL(`../public${url}`, import.meta.url)
      );
      return new Response(bytes, { status: 200 });
    }
    return originalFetch(input, init);
  };

  try {
    const result = await buildOutlinedTextSvg(
      {
        objects: [
          {
            type: 'CurvedText',
            text: 'ASL',
            fontFamily: 'Arial',
            fontSize: 40,
            fontWeight: 'bold',
            fontStyle: 'italic',
            fill: '#000000',
            stroke: '#fffcd6',
            strokeWidth: 1,
            curveIntensity: -24,
            left: 200,
            top: 150,
            scaleX: 0.8,
            scaleY: 0.8,
          },
        ],
      },
      'back'
    );

    assert.equal(result.textCount, 1);
    assert.equal(result.outlinedCount, 1);
    assert.deepEqual(result.fallbackFonts, []);
    assert.ok(result.svg);
    assert.doesNotMatch(result.svg, /<text\b/i);
    assert.match(result.svg, /<path\b/);
    assert.match(result.svg, /skewX\(-12\)/);
    assert.match(result.svg, /rotate\(/);
    assert.match(result.svg, /stroke="#fffcd6" stroke-width="2\.4"/);
    assert.match(result.svg, /stroke="#000000" stroke-width="1\.4"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
