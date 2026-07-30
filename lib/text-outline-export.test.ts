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

test('admin SVG outlines Pretendard text instead of blocking order saves', async () => {
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
            type: 'i-text',
            text: '모두',
            fontFamily: 'Pretendard',
            fontSize: 40,
            fill: '#111111',
            stroke: '#fffcd6',
            strokeWidth: 1,
            left: 100,
            top: 100,
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
    assert.match(result.svg, /stroke="#fffcd6" stroke-width="1"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin SVG keeps font text with bold, italic, and stroke when outlining is unavailable', async () => {
  const result = await buildOutlinedTextSvg(
    {
      objects: [
        {
          type: 'i-text',
          text: 'ASL',
          fontFamily: 'Unavailable Customer Font',
          fontSize: 40,
          fontWeight: 'bold',
          fontStyle: 'italic',
          fill: '#000000',
          stroke: '#fffcd6',
          strokeWidth: 2,
          paintFirst: 'stroke',
          left: 100,
          top: 100,
        },
      ],
    },
    'back'
  );

  assert.equal(result.textCount, 1);
  assert.equal(result.outlinedCount, 0);
  assert.deepEqual(result.fallbackFonts, ['Unavailable Customer Font']);
  assert.ok(result.svg);
  assert.match(result.svg, /<text\b/);
  assert.match(result.svg, /font-family="Unavailable Customer Font"/);
  assert.match(result.svg, /font-weight="bold"/);
  assert.match(result.svg, /font-style="italic"/);
  assert.match(result.svg, /stroke="#fffcd6"/);
  assert.match(result.svg, /stroke-width="2"/);
  assert.match(result.svg, /paint-order="stroke fill"/);
});
