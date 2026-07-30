import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { buildOutlinedTextSvg } from '../lib/text-outline-export';

const require = createRequire(
  join(process.cwd(), 'e2e', 'font-vector-fidelity.ts')
);
const { chromium } = require('playwright') as {
  chromium: {
    launch: () => Promise<{
      // Runtime-only global Playwright is intentionally not a package dependency.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      newPage: (options?: Record<string, unknown>) => Promise<any>;
      close: () => Promise<void>;
    }>;
  };
};

async function main(): Promise<void> {
const customerFontFamily = 'Modoo Custom E2E Customer a1b2c3d4';
const appRoot = process.env.MODOO_APP_ROOT || join(process.cwd(), '..', 'modoo_app');
const fontPath = join(appRoot, 'public', 'fonts', 'Arimo-Regular.ttf');
const fabricBundlePath = join(
  appRoot,
  'node_modules',
  'fabric',
  'dist',
  'index.min.js'
);
const fontBytes = await readFile(fontPath);
const fontUrl = 'font-test://customer-font';
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  if (String(input) === fontUrl) {
    return new Response(fontBytes, { status: 200 });
  }
  return originalFetch(input, init);
};

const canvasState = {
  objects: [
    {
      type: 'i-text',
      text: 'ASL',
      fontFamily: customerFontFamily,
      fontSize: 96,
      fontWeight: 'bold',
      fontStyle: 'italic',
      fill: '#000000',
      stroke: '#fffcd6',
      strokeWidth: 4,
      paintFirst: 'stroke',
      charSpacing: 0,
      textAlign: 'left',
      lineHeight: 1.16,
      left: 120,
      top: 100,
      originX: 'left',
      originY: 'top',
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      opacity: 1,
    },
  ],
};

const outlined = await buildOutlinedTextSvg(canvasState, 'front', {
  customFonts: [
    {
      fontFamily: customerFontFamily,
      displayName: 'E2E Customer',
      fileName: 'customer.ttf',
      url: fontUrl,
      path: 'e2e/customer.ttf',
      format: 'ttf',
    },
  ],
});
globalThis.fetch = originalFetch;

assert.equal(outlined.textCount, 1);
assert.equal(outlined.outlinedCount, 1);
assert.ok(outlined.svg);
assert.doesNotMatch(outlined.svg, /<text\b/i);

const browser = await chromium.launch();
const screenshotPath = join(tmpdir(), 'modoo-font-vector-e2e.png');

try {
  const page = await browser.newPage({ viewport: { width: 1660, height: 700 } });
  await page.setContent(
    '<main><section><h2>Customer Fabric canvas</h2><canvas id="customer"></canvas></section>' +
      '<section><h2>Admin font-free SVG</h2><div id="vector"></div></section></main>'
  );
  await page.addStyleTag({
    content:
      'body{margin:20px;background:#444;color:white;font-family:Arial}' +
      'main{display:grid;grid-template-columns:800px 800px;gap:20px}' +
      'section{background:#666;padding:10px}h2{font-size:16px;margin:0 0 8px}' +
      'canvas,svg{display:block;background:white;width:800px;height:600px}',
  });
  await page.addScriptTag({ path: fabricBundlePath });
  await page.addScriptTag({
    content: 'globalThis.__name = (target) => target;',
  });

  const metrics = await page.evaluate(
    async ({
      family,
      fontDataUrl,
      svgMarkup,
      object,
    }: {
      family: string;
      fontDataUrl: string;
      svgMarkup: string;
      object: typeof canvasState.objects[number];
    }) => {
      const fontFace = new FontFace(family, `url(${fontDataUrl})`);
      await fontFace.load();
      document.fonts.add(fontFace);
      await document.fonts.ready;

      // Playwright injects the Fabric UMD bundle into this isolated browser page.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fabricApi = (globalThis as any).fabric;
      fabricApi.cache.clearFontCache(family);
      const canvas = new fabricApi.StaticCanvas('customer', {
        width: 800,
        height: 600,
        enableRetinaScaling: false,
        renderOnAddRemove: true,
      });
      const textValue = object.text;
      const fabricOptions = { ...object };
      Reflect.deleteProperty(fabricOptions, 'type');
      Reflect.deleteProperty(fabricOptions, 'text');
      const text = new fabricApi.IText(textValue, fabricOptions);
      canvas.add(text);
      canvas.renderAll();

      const vectorHost = document.getElementById('vector')!;
      vectorHost.innerHTML = svgMarkup.replace(/<\?xml[^>]*>\s*/i, '');
      const vectorSvg = vectorHost.querySelector('svg')!;

      const referenceCanvas = canvas.getElement();
      const serializedSvg = new XMLSerializer().serializeToString(vectorSvg);
      const vectorImage = new Image();
      const vectorLoaded = new Promise<void>((resolve, reject) => {
        vectorImage.onload = () => resolve();
        vectorImage.onerror = () => reject(new Error('vector SVG rasterization failed'));
      });
      vectorImage.src = `data:image/svg+xml;base64,${btoa(
        unescape(encodeURIComponent(serializedSvg))
      )}`;
      await vectorLoaded;

      const raster = document.createElement('canvas');
      raster.width = 800;
      raster.height = 600;
      const rasterContext = raster.getContext('2d')!;
      rasterContext.drawImage(vectorImage, 0, 0, 800, 600);

      const maskMetrics = (target: HTMLCanvasElement) => {
        const context = target.getContext('2d')!;
        const pixels = context.getImageData(0, 0, target.width, target.height).data;
        let minX = target.width;
        let minY = target.height;
        let maxX = -1;
        let maxY = -1;
        let count = 0;
        const mask = new Uint8Array(target.width * target.height);
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] <= 8) continue;
          const pixelIndex = index / 4;
          const x = pixelIndex % target.width;
          const y = Math.floor(pixelIndex / target.width);
          mask[pixelIndex] = 1;
          count += 1;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        return {
          mask,
          count,
          box: {
            left: minX,
            top: minY,
            width: maxX >= minX ? maxX - minX + 1 : 0,
            height: maxY >= minY ? maxY - minY + 1 : 0,
          },
        };
      };

      const reference = maskMetrics(referenceCanvas);
      const vector = maskMetrics(raster);
      let intersection = 0;
      let union = 0;
      for (let index = 0; index < reference.mask.length; index += 1) {
        const a = reference.mask[index];
        const b = vector.mask[index];
        if (a && b) intersection += 1;
        if (a || b) union += 1;
      }

      return {
        fontStatus: fontFace.status,
        reference: { count: reference.count, box: reference.box },
        vector: { count: vector.count, box: vector.box },
        maskIou: union > 0 ? intersection / union : 0,
      };
    },
    {
      family: customerFontFamily,
      fontDataUrl: `data:font/ttf;base64,${fontBytes.toString('base64')}`,
      svgMarkup: outlined.svg,
      object: canvasState.objects[0],
    }
  );

  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert.equal(metrics.fontStatus, 'loaded');
  assert.ok(metrics.reference.count > 1000);
  assert.ok(metrics.vector.count > 1000);
  assert.ok(
    Math.abs(metrics.reference.box.width - metrics.vector.box.width) <= 12,
    JSON.stringify(metrics)
  );
  assert.ok(
    Math.abs(metrics.reference.box.height - metrics.vector.box.height) <= 12,
    JSON.stringify(metrics)
  );
  assert.ok(metrics.maskIou >= 0.72, JSON.stringify(metrics));
  console.log(JSON.stringify({ ...metrics, screenshotPath }, null, 2));
} finally {
  await browser.close();
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
