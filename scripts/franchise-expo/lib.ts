import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const EXPO_SOURCE_URL =
  'https://www.franchisecoex.co.kr/visit/join_list.php?ptype=list&code=join_list&code_page=visit&pos=2';

export const EXPO_ROUND = 84;

export const TARGET_PRODUCT_CODES = {
  common: ['00085-CVT', '00302-ADP', 'DK520'],
  study: ['00085-CVT', '00113-BCV', 'DK520'],
} as const;

export interface ExpoRow {
  page: number;
  number: number;
  sourceId: string;
  category: string;
  company: string;
  englishName: string;
  brand: string;
  item: string;
  booth: string;
  round: number;
  logoFilename: string;
  logoUrl: string;
  detailUrl: string;
}

export interface ManifestBrand extends ExpoRow {
  sourceKey: string;
  slug: string;
  localRelativePath: string;
  logoSha256: string;
  logoWidth: number;
  logoHeight: number;
  logoFormat: string;
  hasAlpha: boolean;
  productCodes: string[];
}

export interface ExpoManifest {
  schemaVersion: 1;
  expo: {
    round: number;
    sourceUrl: string;
    pages: number;
  };
  totals: {
    websiteRows: number;
    localLogoFiles: number;
    matchedRows: number;
    uniqueBrands: number;
  };
  duplicates: Array<{
    brand: string;
    keptSourceId: string;
    droppedSourceIds: string[];
  }>;
  brands: ManifestBrand[];
}

export interface ProductSideInput {
  id: string;
  name?: string;
  imageUrl: string;
  printArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface LogoPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreparedArtwork {
  placement: LogoPlacement;
  canvasState: string;
  composedBuffer: Buffer;
  previewBuffer: Buffer;
}

export type ArtworkPlacementKind = 'left-chest' | 'large-back';

export interface ContrastLogoVariants {
  lightGarmentLogo: Buffer;
  darkGarmentLogo: Buffer;
  lightGarmentMode: 'original' | 'black';
  darkGarmentMode: 'original' | 'white';
}

export interface LogoContrast {
  averageLuminance: number;
  lightPixelRatio: number;
  darkPixelRatio: number;
  needsDarkGarment: boolean;
}

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseExpoRows(html: string, page: number): ExpoRow[] {
  const rows: ExpoRow[] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const match of html.matchAll(rowPattern)) {
    const row = match[1];
    const logoMatch = row.match(
      /background-image\s*:\s*url\((?:['"])?([^)'"]+\/([^/'"]+\.(?:png|jpe?g|webp)))(?:['"])?\)/i,
    );
    const subjectMatch = row.match(
      /<td\s+class=["']subject["'][^>]*>\s*\[([^\]]+)]\s*<strong>\s*<a\s+href=["']([^"']*idx=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>\s*<\/strong>\s*\(([^)]*)\)/i,
    );
    const brandMatch = row.match(/<td\s+class=["']left["'][^>]*>([\s\S]*?)<\/td>/i);
    const itemMatch = row.match(
      /<!--\s*<td\s+class=["']left["'][^>]*>([\s\S]*?)<\/td>\s*-->/i,
    );
    const numberMatch = row.match(/^\s*<td[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>/i);
    const tailMatch = row.match(
      /<!--\s*<td\s+class=["']left["'][^>]*>[\s\S]*?<\/td>\s*-->\s*<td[^>]*>\s*([^<]*)\s*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>/i,
    );

    if (!logoMatch || !subjectMatch || !brandMatch || !itemMatch || !tailMatch) continue;

    const logoPath = logoMatch[1].startsWith('/') ? logoMatch[1] : `/${logoMatch[1]}`;
    const detailPath = subjectMatch[2].startsWith('/') ? subjectMatch[2] : `/${subjectMatch[2]}`;

    rows.push({
      page,
      number: Number(numberMatch?.[1] || 0),
      sourceId: subjectMatch[3],
      category: decodeHtml(subjectMatch[1]),
      company: decodeHtml(subjectMatch[4]),
      englishName: decodeHtml(subjectMatch[5]).replace(/^-$|^\s*$/, ''),
      brand: decodeHtml(brandMatch[1]) || decodeHtml(subjectMatch[4]),
      item: decodeHtml(itemMatch[1]),
      booth: decodeHtml(tailMatch[1]),
      round: Number(tailMatch[2]),
      logoFilename: logoMatch[2],
      logoUrl: new URL(logoPath, EXPO_SOURCE_URL).toString(),
      detailUrl: new URL(detailPath, EXPO_SOURCE_URL).toString(),
    });
  }

  return rows;
}

export function normalizeBrandKey(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

export function dedupeExpoRows(rows: ExpoRow[]): {
  rows: ExpoRow[];
  duplicates: ExpoManifest['duplicates'];
} {
  const groups = new Map<string, ExpoRow[]>();

  for (const row of rows) {
    const key = normalizeBrandKey(row.brand || row.company);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  const duplicates: ExpoManifest['duplicates'] = [];
  const uniqueRows = [...groups.values()].map((group) => {
    const sorted = [...group].sort((a, b) => Number(b.sourceId) - Number(a.sourceId));
    const kept = sorted[0];
    if (sorted.length > 1) {
      duplicates.push({
        brand: kept.brand,
        keptSourceId: kept.sourceId,
        droppedSourceIds: sorted.slice(1).map((row) => row.sourceId),
      });
    }
    return kept;
  });

  uniqueRows.sort((a, b) => Number(b.sourceId) - Number(a.sourceId));
  duplicates.sort((a, b) => a.brand.localeCompare(b.brand, 'ko'));

  return { rows: uniqueRows, duplicates };
}

export function productCodesForCategory(category: string): string[] {
  return category.includes('스터디카페')
    ? [...TARGET_PRODUCT_CODES.study]
    : [...TARGET_PRODUCT_CODES.common];
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
    }),
  );
  return nested.flat();
}

export async function listLocalLogoFiles(root: string): Promise<string[]> {
  return (await walkFiles(root))
    .filter((filePath) => /\.(?:png|jpe?g|webp)$/i.test(filePath))
    .filter((filePath) => !filePath.includes(`${path.sep}파트너몰_QR_운영본${path.sep}`))
    .sort((a, b) => a.localeCompare(b, 'ko'));
}

export async function sha256File(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

export async function buildManifest(
  websiteRows: ExpoRow[],
  localRoot: string,
): Promise<ExpoManifest> {
  const localFiles = await listLocalLogoFiles(localRoot);
  const byBasename = new Map<string, string>();

  for (const filePath of localFiles) {
    const basename = path.basename(filePath);
    if (byBasename.has(basename)) {
      throw new Error(`중복 로고 파일명이 있습니다: ${basename}`);
    }
    byBasename.set(basename, filePath);
  }

  const matchedRows = websiteRows.filter(
    (row) => row.round === EXPO_ROUND && byBasename.has(row.logoFilename),
  );
  const missingLocal = matchedRows.filter((row) => !byBasename.has(row.logoFilename));
  if (missingLocal.length > 0) {
    throw new Error(`로컬 로고가 없는 항목이 있습니다: ${missingLocal.map((row) => row.brand).join(', ')}`);
  }

  const matchedFilenames = new Set(matchedRows.map((row) => row.logoFilename));
  const unmatchedLocal = [...byBasename.keys()].filter((name) => !matchedFilenames.has(name));
  if (unmatchedLocal.length > 0) {
    throw new Error(`웹 목록과 매칭되지 않은 로고가 있습니다: ${unmatchedLocal.join(', ')}`);
  }

  const { rows: uniqueRows, duplicates } = dedupeExpoRows(matchedRows);
  const brands: ManifestBrand[] = [];

  for (const row of uniqueRows) {
    const filePath = byBasename.get(row.logoFilename);
    if (!filePath) throw new Error(`로고 경로를 찾을 수 없습니다: ${row.logoFilename}`);
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error(`로고 메타데이터를 읽을 수 없습니다: ${filePath}`);
    }

    brands.push({
      ...row,
      sourceKey: `franchise-coex:${EXPO_ROUND}:${row.sourceId}`,
      slug: `expo${EXPO_ROUND}-${row.sourceId}`,
      localRelativePath: path.relative(localRoot, filePath).split(path.sep).join('/'),
      logoSha256: await sha256File(filePath),
      logoWidth: metadata.width,
      logoHeight: metadata.height,
      logoFormat: metadata.format,
      hasAlpha: Boolean(metadata.hasAlpha),
      productCodes: productCodesForCategory(row.category),
    });
  }

  return {
    schemaVersion: 1,
    expo: {
      round: EXPO_ROUND,
      sourceUrl: EXPO_SOURCE_URL,
      pages: 6,
    },
    totals: {
      websiteRows: websiteRows.length,
      localLogoFiles: localFiles.length,
      matchedRows: matchedRows.length,
      uniqueBrands: brands.length,
    },
    duplicates,
    brands,
  };
}

function colorDistance(a: number[], b: number[]): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
      (a[1] - b[1]) ** 2 +
      (a[2] - b[2]) ** 2,
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

export async function preprocessLogo(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixel = (index: number) => {
    const offset = index * channels;
    return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
  };
  const cornerIndexes = [0, info.width - 1, (info.height - 1) * info.width, info.width * info.height - 1];
  const corners = cornerIndexes.map(pixel);
  const background = [0, 1, 2].map((channel) => median(corners.map((entry) => entry[channel])));
  const hasTransparentPixels = (() => {
    for (let offset = 3; offset < data.length; offset += channels) {
      if (data[offset] < 245) return true;
    }
    return false;
  })();
  const cornersAgree = corners.every((corner) => colorDistance(corner, background) <= 42);

  if (!hasTransparentPixels && cornersAgree) {
    const visited = new Uint8Array(info.width * info.height);
    const queue: number[] = [];
    const enqueue = (index: number) => {
      if (index < 0 || index >= visited.length || visited[index]) return;
      visited[index] = 1;
      queue.push(index);
    };

    for (let x = 0; x < info.width; x += 1) {
      enqueue(x);
      enqueue((info.height - 1) * info.width + x);
    }
    for (let y = 0; y < info.height; y += 1) {
      enqueue(y * info.width);
      enqueue(y * info.width + info.width - 1);
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      const rgba = pixel(index);
      if (rgba[3] === 0 || colorDistance(rgba, background) > 54) continue;
      data[index * channels + 3] = 0;
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      if (x > 0) enqueue(index - 1);
      if (x + 1 < info.width) enqueue(index + 1);
      if (y > 0) enqueue(index - info.width);
      if (y + 1 < info.height) enqueue(index + info.width);
    }
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function analyzeLogoContrast(input: Buffer): Promise<LogoContrast> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let alphaTotal = 0;
  let luminanceTotal = 0;
  let lightTotal = 0;
  let darkTotal = 0;

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const alpha = data[offset + 3] / 255;
    if (alpha < 0.08) continue;
    const luminance =
      data[offset] * 0.2126 +
      data[offset + 1] * 0.7152 +
      data[offset + 2] * 0.0722;
    alphaTotal += alpha;
    luminanceTotal += luminance * alpha;
    if (luminance >= 190) lightTotal += alpha;
    if (luminance <= 100) darkTotal += alpha;
  }

  const averageLuminance = alphaTotal > 0 ? luminanceTotal / alphaTotal : 0;
  const lightPixelRatio = alphaTotal > 0 ? lightTotal / alphaTotal : 0;
  const darkPixelRatio = alphaTotal > 0 ? darkTotal / alphaTotal : 0;
  return {
    averageLuminance,
    lightPixelRatio,
    darkPixelRatio,
    needsDarkGarment:
      (averageLuminance >= 178 && lightPixelRatio >= 0.52) ||
      (averageLuminance >= 170 && lightPixelRatio >= 0.58 && darkPixelRatio <= 0.25) ||
      (lightPixelRatio >= 0.68 && darkPixelRatio <= 0.16),
  };
}

export async function recolorProductImage(input: Buffer, colorHex: string): Promise<Buffer> {
  const match = colorHex.match(/^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i);
  if (!match) throw new Error(`올바르지 않은 제품 색상입니다: ${colorHex}`);
  const target = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let offset = 0; offset < data.length; offset += info.channels) {
    data[offset] = Math.round((data[offset] * target[0]) / 255);
    data[offset + 1] = Math.round((data[offset + 1] * target[1]) / 255);
    data[offset + 2] = Math.round((data[offset + 2] * target[2]) / 255);
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  }).png().toBuffer();
}

export async function recolorLogo(input: Buffer, colorHex: string): Promise<Buffer> {
  const match = colorHex.match(/^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i);
  if (!match) throw new Error(`올바르지 않은 로고 색상입니다: ${colorHex}`);
  const target = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset + 3] === 0) continue;
    data[offset] = target[0];
    data[offset + 1] = target[1];
    data[offset + 2] = target[2];
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  }).png().toBuffer();
}

export async function adaptLogoContrast(
  input: Buffer,
  target: 'light-garment' | 'dark-garment',
): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset + 3] === 0) continue;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const chroma = max - min;

    if (target === 'dark-garment' && luminance < 170) {
      if (chroma <= 45) {
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
      } else {
        const denominator = Math.max(1, max);
        data[offset] = Math.round(155 + (red / denominator) * 100);
        data[offset + 1] = Math.round(155 + (green / denominator) * 100);
        data[offset + 2] = Math.round(155 + (blue / denominator) * 100);
      }
    }

    if (target === 'light-garment' && luminance > 145) {
      if (chroma <= 45) {
        data[offset] = 17;
        data[offset + 1] = 17;
        data[offset + 2] = 17;
      } else {
        const scale = 105 / Math.max(1, luminance);
        data[offset] = Math.round(red * scale);
        data[offset + 1] = Math.round(green * scale);
        data[offset + 2] = Math.round(blue * scale);
      }
    }
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  }).png().toBuffer();
}

export async function buildContrastLogoVariants(
  logo: Buffer,
  contrast: LogoContrast,
): Promise<ContrastLogoVariants> {
  const needsWhiteOnDark =
    (contrast.averageLuminance <= 145 && contrast.darkPixelRatio >= 0.34) ||
    contrast.darkPixelRatio >= 0.58;
  const lightGarmentMode = contrast.needsDarkGarment ? 'black' : 'original';
  const darkGarmentMode = needsWhiteOnDark ? 'white' : 'original';

  return {
    lightGarmentLogo: lightGarmentMode === 'black'
      ? await adaptLogoContrast(logo, 'light-garment')
      : logo,
    darkGarmentLogo: darkGarmentMode === 'white'
      ? await adaptLogoContrast(logo, 'dark-garment')
      : logo,
    lightGarmentMode,
    darkGarmentMode,
  };
}

export function buildLogoPlacement(
  side: ProductSideInput,
  logoWidth: number,
  logoHeight: number,
  preset?: LogoPlacement | null,
  placementKind: ArtworkPlacementKind = 'left-chest',
): LogoPlacement {
  if (preset) return { ...preset };

  const isBack = placementKind === 'large-back';
  const boxWidth = Math.max(isBack ? 180 : 64, Math.round(side.printArea.width * (isBack ? 0.70 : 0.28)));
  const boxHeight = Math.max(isBack ? 160 : 54, Math.round(side.printArea.height * (isBack ? 0.44 : 0.18)));
  const scale = Math.min(boxWidth / logoWidth, boxHeight / logoHeight);
  const width = Math.max(1, Math.round(logoWidth * scale));
  const height = Math.max(1, Math.round(logoHeight * scale));
  const centerX = side.printArea.width * (isBack ? 0.5 : 0.72);
  const x = Math.round(centerX - width / 2);
  const y = Math.round(side.printArea.height * (isBack ? 0.16 : 0.10));

  return {
    x: Math.max(0, Math.min(side.printArea.width - width, x)),
    y: Math.max(0, Math.min(side.printArea.height - height, y)),
    width,
    height,
  };
}

export async function prepareArtwork(input: {
  side: ProductSideInput;
  productImage: Buffer;
  logo: Buffer;
  logoUrl: string;
  preset?: LogoPlacement | null;
  canvasWidth?: number;
  canvasHeight?: number;
  productColor?: string;
  placementKind?: ArtworkPlacementKind;
}): Promise<PreparedArtwork> {
  const canvasWidth = input.canvasWidth || 400;
  const canvasHeight = input.canvasHeight || 500;
  const productMetadata = await sharp(input.productImage).metadata();
  const logoMetadata = await sharp(input.logo).metadata();
  if (!productMetadata.width || !productMetadata.height || !logoMetadata.width || !logoMetadata.height) {
    throw new Error('제품 또는 로고 이미지 크기를 읽을 수 없습니다.');
  }

  const placement = buildLogoPlacement(
    input.side,
    logoMetadata.width,
    logoMetadata.height,
    input.preset,
    input.placementKind,
  );
  const productScale = Math.min(
    canvasWidth / productMetadata.width,
    canvasHeight / productMetadata.height,
  );
  const imageLeft = canvasWidth / 2 - (productMetadata.width * productScale) / 2;
  const imageTop = canvasHeight / 2 - (productMetadata.height * productScale) / 2;
  const printAreaLeft = imageLeft + input.side.printArea.x * productScale;
  const printAreaTop = imageTop + input.side.printArea.y * productScale;
  const objectScale = Math.min(
    placement.width / logoMetadata.width,
    placement.height / logoMetadata.height,
  ) * productScale;

  const canvasObject = {
    type: 'Image',
    version: '7.0.0',
    originX: 'left',
    originY: 'top',
    left: printAreaLeft + placement.x * productScale,
    top: printAreaTop + placement.y * productScale,
    width: logoMetadata.width,
    height: logoMetadata.height,
    fill: 'rgb(0,0,0)',
    stroke: null,
    strokeWidth: 0,
    scaleX: objectScale,
    scaleY: objectScale,
    angle: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    visible: true,
    src: input.logoUrl,
    crossOrigin: 'anonymous',
    filters: [],
    data: {
      id: 'partner-mall-logo',
      source: 'franchise_expo_import',
      supabaseUrl: input.logoUrl,
      placementKind: input.placementKind || 'left-chest',
      printMethod: 'dtf',
    },
  };
  const canvasState = JSON.stringify({
    version: '7.0.0',
    objects: [canvasObject],
    productColor: input.productColor || '#FFFFFF',
  });

  const resizedLogo = await sharp(input.logo)
    .resize({
      width: placement.width,
      height: placement.height,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const logoForComposite = await sharp(resizedLogo).metadata();
  const compositeLeft = Math.max(
    0,
    Math.round(input.side.printArea.x + placement.x + (placement.width - (logoForComposite.width || placement.width)) / 2),
  );
  const compositeTop = Math.max(
    0,
    Math.round(input.side.printArea.y + placement.y + (placement.height - (logoForComposite.height || placement.height)) / 2),
  );
  const composed = await sharp(input.productImage)
    .ensureAlpha()
    .composite([{ input: resizedLogo, left: compositeLeft, top: compositeTop }])
    .png()
    .toBuffer();
  const previewBuffer = await sharp({
    create: {
      width: 800,
      height: 1000,
      channels: 4,
      background: { r: 243, g: 241, b: 237, alpha: 1 },
    },
  })
    .composite([
      {
        input: await sharp(composed)
          .resize({
            width: 720,
            height: 900,
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer(),
        gravity: 'center',
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { placement, canvasState, composedBuffer: composed, previewBuffer };
}

export async function combineArtworkPreviews(
  front: PreparedArtwork,
  back: PreparedArtwork,
): Promise<Buffer> {
  const [frontPanel, backPanel] = await Promise.all(
    [front.composedBuffer, back.composedBuffer].map((buffer) =>
      sharp(buffer)
        .resize({
          width: 520,
          height: 820,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
    ),
  );
  const labels = Buffer.from(`
    <svg width="1200" height="1000" xmlns="http://www.w3.org/2000/svg">
      <text x="300" y="950" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#78716c">FRONT</text>
      <text x="900" y="950" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#78716c">BACK</text>
    </svg>
  `);

  return sharp({
    create: {
      width: 1200,
      height: 1000,
      channels: 4,
      background: { r: 243, g: 241, b: 237, alpha: 1 },
    },
  })
    .composite([
      { input: frontPanel, left: 40, top: 65 },
      { input: backPanel, left: 640, top: 65 },
      { input: labels, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function fetchExpoRows(fetchImpl: typeof fetch = fetch): Promise<ExpoRow[]> {
  const pages = await Promise.all(
    Array.from({ length: 6 }, async (_, index) => {
      const page = index + 1;
      const url = `${EXPO_SOURCE_URL}&page=${page}`;
      const response = await fetchImpl(url, {
        headers: { 'user-agent': 'modoo-franchise-expo-importer/1.0' },
      });
      if (!response.ok) throw new Error(`참가업체 ${page}페이지를 불러오지 못했습니다: ${response.status}`);
      return parseExpoRows(await response.text(), page);
    }),
  );
  return pages.flat();
}
