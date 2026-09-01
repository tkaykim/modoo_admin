import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import {
  analyzeLogoContrast,
  buildContrastLogoVariants,
  listLocalLogoFiles,
  preprocessLogo,
  preprocessPhotoWhiteLogo,
  preprocessChromaticLogo,
  type ExpoManifest,
} from './lib';

type AssetRow = {
  id: string;
  partner_mall_id: string;
  import_key: string;
  url: string;
  is_primary: boolean;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`이미지 다운로드 실패 ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function normalized(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .resize({ width: 360, height: 360, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function difference(before: Buffer, after: Buffer): Promise<{ ratio: number; before: Buffer; after: Buffer }> {
  const [a, b] = await Promise.all([normalized(before), normalized(after)]);
  let changed = 0;
  const pixels = a.width * a.height;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const alphaDelta = Math.abs(a.data[offset + 3] - b.data[offset + 3]);
    const colorDelta = Math.max(
      Math.abs(a.data[offset] - b.data[offset]),
      Math.abs(a.data[offset + 1] - b.data[offset + 1]),
      Math.abs(a.data[offset + 2] - b.data[offset + 2]),
    );
    if (alphaDelta > 8 || (a.data[offset + 3] > 16 && colorDelta > 24)) changed += 1;
  }
  return { ratio: changed / pixels, before: a.data, after: b.data };
}

async function panel(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize({ width: 560, height: 560, fit: 'contain', background: { r: 235, g: 235, b: 235, alpha: 1 } })
    .png()
    .toBuffer();
}

async function comparison(before: Buffer, after: Buffer): Promise<Buffer> {
  const [left, right] = await Promise.all([panel(before), panel(after)]);
  const labels = Buffer.from('<svg width="1200" height="640" xmlns="http://www.w3.org/2000/svg"><text x="280" y="620" text-anchor="middle" font-family="Arial" font-size="26" fill="#333">CURRENT</text><text x="920" y="620" text-anchor="middle" font-family="Arial" font-size="26" fill="#333">REPAIRED</text></svg>');
  return sharp({ create: { width: 1200, height: 640, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: left, left: 20, top: 20 }, { input: right, left: 620, top: 20 }, { input: labels, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function main() {
  const commit = process.argv.includes('--commit');
  const sourceRoot = path.resolve(process.argv.find((value) => value.startsWith('--source-root='))?.slice('--source-root='.length) || 'C:/Users/tkay/Documents/카카오톡 받은 파일/프랜차이즈 박람회');
  const outputDir = path.resolve(process.argv.find((value) => value.startsWith('--output-dir='))?.slice('--output-dir='.length) || '.tmp/franchise-logo-repair');
  const manifest = JSON.parse(await readFile('data/franchise-expo-84/manifest.json', 'utf8')) as ExpoManifest;
  const files = await listLocalLogoFiles(sourceRoot);
  const client = createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const [mallResult, assetResult] = await Promise.all([
    client.from('partner_malls').select('id,source_key,logo_url').like('source_key', 'franchise-coex:84:%'),
    client.from('partner_mall_assets').select('id,partner_mall_id,import_key,url,is_primary').like('import_key', 'franchise-coex:84:%'),
  ]);
  if (mallResult.error) throw new Error(mallResult.error.message);
  if (assetResult.error) throw new Error(assetResult.error.message);
  const malls = new Map((mallResult.data || []).map((row) => [row.source_key, row]));
  const assetsByMall = new Map<string, AssetRow[]>();
  for (const asset of (assetResult.data || []) as AssetRow[]) {
    const list = assetsByMall.get(asset.partner_mall_id) || [];
    list.push(asset);
    assetsByMall.set(asset.partner_mall_id, list);
  }
  await mkdir(outputDir, { recursive: true });
  const report: Array<Record<string, unknown>> = [];
  for (const brand of manifest.brands) {
    const mall = malls.get(brand.sourceKey);
    if (!mall) throw new Error(`${brand.brand} 몰 없음`);
    const assets = assetsByMall.get(mall.id) || [];
    const primary = assets.find((asset) => asset.import_key === `${brand.sourceKey}:logo`);
    const light = assets.find((asset) => asset.import_key === `${brand.sourceKey}:logo:light-garment`);
    const dark = assets.find((asset) => asset.import_key === `${brand.sourceKey}:logo:dark-garment`);
    if (!primary || !light || !dark) throw new Error(`${brand.brand} 대비 에셋 누락`);
    const filePath = files.find((file) => path.basename(file) === brand.logoFilename);
    if (!filePath) throw new Error(`${brand.brand} 원본 파일 없음`);
    const original = await readFile(filePath);
    const processed = brand.sourceId === '4624'
      ? await preprocessPhotoWhiteLogo(original)
      : brand.sourceId === '4724'
        ? await preprocessChromaticLogo(original)
        : await preprocessLogo(original);
    const variants = await buildContrastLogoVariants(processed, await analyzeLogoContrast(processed));
    const [oldPrimary, oldLight, oldDark] = await Promise.all([download(primary.url), download(light.url), download(dark.url)]);
    const [primaryDiff, lightDiff, darkDiff] = await Promise.all([
      difference(oldPrimary, processed),
      difference(oldLight, variants.lightGarmentLogo),
      difference(oldDark, variants.darkGarmentLogo),
    ]);
    const maxDiff = Math.max(primaryDiff.ratio, lightDiff.ratio, darkDiff.ratio);
    if (maxDiff >= 0.002) {
      await writeFile(path.join(outputDir, `${brand.sourceKey.replace(/[^a-zA-Z0-9_-]+/g, '_')}.png`), await comparison(oldPrimary, processed));
    }
    report.push({ brand: brand.brand, sourceKey: brand.sourceKey, primary: primaryDiff.ratio, light: lightDiff.ratio, dark: darkDiff.ratio, maxDiff });
    if (commit) {
      const bucket = 'user-designs';
      const basePath = `partner-mall-logos/franchise-expo-84/${brand.sourceId}`;
      const uploads = [
        [primary, processed, 'logo.png'],
        [light, variants.lightGarmentLogo, 'logo-light-garment.png'],
        [dark, variants.darkGarmentLogo, 'logo-dark-garment.png'],
      ] as const;
      for (const [asset, body, filename] of uploads) {
        const { error } = await client.storage.from(bucket).upload(`${basePath}/${filename}`, body, { contentType: 'image/png', upsert: true, cacheControl: '31536000' });
        if (error) throw new Error(`${brand.brand} ${filename} 업로드 실패: ${error.message}`);
        const { data } = client.storage.from(bucket).getPublicUrl(`${basePath}/${filename}`);
        const { error: updateError } = await client.from('partner_mall_assets').update({ url: data.publicUrl, file_size: body.byteLength, mime_type: 'image/png' }).eq('id', asset.id);
        if (updateError) throw new Error(`${brand.brand} ${filename} DB 갱신 실패: ${updateError.message}`);
        if (filename === 'logo.png') {
          const { error: mallError } = await client.from('partner_malls').update({ logo_url: data.publicUrl }).eq('id', mall.id);
          if (mallError) throw new Error(`${brand.brand} 몰 로고 URL 갱신 실패: ${mallError.message}`);
        }
      }
    }
  }
  await writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  const changed = report.filter((row) => Number(row.maxDiff) >= 0.002);
  console.log(`${commit ? '저장' : 'DRY-RUN'} 완료: 전체 ${report.length}개, 변경 후보 ${changed.length}개, 결과 ${outputDir}`);
  for (const row of changed) console.log(`${row.brand}: primary=${Number(row.primary).toFixed(4)}, light=${Number(row.light).toFixed(4)}, dark=${Number(row.dark).toFixed(4)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
