import fs from 'fs';
import path from 'path';
import type { InvoiceEmailParams } from './invoice-email';
import { generateInvoicePdfDocumentHtml } from './invoice-email';

function resolveChromeExecutable(): string | undefined {
  if (process.env.CHROME_EXECUTABLE_PATH && fs.existsSync(process.env.CHROME_EXECUTABLE_PATH)) {
    return process.env.CHROME_EXECUTABLE_PATH;
  }

  if (process.platform === 'win32') {
    const candidates = [
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return undefined;
  }

  if (process.platform === 'darwin') {
    const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(mac)) return mac;
    return undefined;
  }

  const linux = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'];
  for (const p of linux) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

let _fontCssCache: string | null = null;

/**
 * @fontsource/noto-sans-kr 의 CSS 를 읽고, 모든 woff2 src 경로를
 * base64 data URL 로 치환한 CSS 를 돌려줍니다.
 * 한 번 빌드하면 프로세스 수명 동안 캐시합니다.
 */
function buildEmbeddedFontCss(): string {
  if (_fontCssCache !== null) return _fontCssCache;

  const pkgBase = path.join(/*turbopackIgnore: true*/ process.cwd(), 'node_modules', '@fontsource', 'noto-sans-kr');

  const cssFiles = ['400.css', '700.css'].map((f) => path.join(pkgBase, f));
  const fallbackCss = path.join(pkgBase, 'index.css');

  let rawCss = '';

  for (const cssPath of cssFiles) {
    if (fs.existsSync(cssPath)) {
      rawCss += fs.readFileSync(cssPath, 'utf-8') + '\n';
    }
  }

  if (!rawCss && fs.existsSync(fallbackCss)) {
    const full = fs.readFileSync(fallbackCss, 'utf-8');
    rawCss = full
      .split(/(?=\/\*\s*noto-sans-kr-)/)
      .filter((block) => block.includes('-400-') || block.includes('-700-'))
      .join('\n');
  }

  if (!rawCss) {
    console.warn('[invoice PDF] @fontsource/noto-sans-kr 를 찾지 못했습니다.');
    _fontCssCache = '';
    return '';
  }

  const filesDir = path.join(pkgBase, 'files');

  const replaced = rawCss.replace(
    /url\(\.\/(files\/[^)]+\.woff2)\)\s*format\(['"]woff2['"]\)/g,
    (_match, relPath: string) => {
      const absPath = path.join(pkgBase, relPath);
      if (!fs.existsSync(absPath)) return _match;
      const buf = fs.readFileSync(absPath);
      const b64 = buf.toString('base64');
      return `url(data:font/woff2;base64,${b64}) format('woff2')`;
    },
  );

  const withoutWoff = replaced.replace(
    /,\s*url\(\.\/(files\/[^)]+\.woff)\)\s*format\(['"]woff['"]\)/g,
    '',
  );

  _fontCssCache = withoutWoff;

  const sizeKb = Math.round(Buffer.byteLength(withoutWoff, 'utf-8') / 1024);
  console.log(`[invoice PDF] 한글 폰트 CSS 임베드 완료 (${sizeKb}KB, 캐시됨)`);

  return withoutWoff;
}

export async function renderInvoicePdfBuffer(params: InvoiceEmailParams): Promise<Buffer | null> {
  let html = generateInvoicePdfDocumentHtml(params);

  const fontCss = buildEmbeddedFontCss();
  if (fontCss) {
    html = html.replace('</head>', `<style>${fontCss}</style>\n</head>`);
  }

  const puppeteer = (await import('puppeteer-core')).default;
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    if (process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      const chromium = (await import('@sparticuz/chromium')).default;
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } else {
      const executablePath = resolveChromeExecutable();
      if (!executablePath) {
        console.warn(
          '[invoice PDF] Chrome/Chromium을 찾지 못했습니다. CHROME_EXECUTABLE_PATH를 설정하거나 Chrome을 설치하세요.',
        );
        return null;
      }
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60_000);
    page.setDefaultTimeout(60_000);
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });

    try {
      await Promise.race([
        page.evaluate(() => document.fonts.ready),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch {
      /* 폰트 API 실패 시에도 PDF 시도 */
    }
    await new Promise((r) => setTimeout(r, 300));

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    await browser.close();
    browser = undefined;
    return Buffer.from(pdf);
  } catch (e) {
    console.error('[invoice PDF] 생성 실패:', e);
    if (browser) {
      await browser.close().catch(() => {});
    }
    return null;
  }
}
