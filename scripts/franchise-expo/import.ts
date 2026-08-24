import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import {
  analyzeLogoContrast,
  prepareArtwork,
  preprocessLogo,
  recolorProductImage,
  type ExpoManifest,
  type LogoPlacement,
  type ManifestBrand,
  type ProductSideInput,
} from './lib';

const DEFAULT_SOURCE_ROOT = 'C:\\Users\\tkay\\Documents\\카카오톡 받은 파일\\프랜차이즈 박람회';
const DEFAULT_MANIFEST = path.join(process.cwd(), 'data', 'franchise-expo-84', 'manifest.json');
const BUCKET = 'user-designs';
const STORAGE_ROOT = 'partner-mall-logos/franchise-expo-84';

interface ProductRow {
  id: string;
  title: string;
  product_code: string;
  is_active: boolean;
  configuration: Array<{
    id: string;
    name?: string;
    imageUrl?: string;
    layers?: Array<{ imageUrl?: string; zIndex?: number }>;
    printArea?: { x?: number; y?: number; width?: number; height?: number };
  }>;
  product_colors?: Array<{
    is_active: boolean;
    manufacturer_colors: ProductColor | null;
  }>;
}

interface ProductColor {
  id: string;
  name: string;
  hex: string;
  color_code: string;
}

interface PresetRow {
  product_id: string;
  placement: LogoPlacement;
}

interface RuntimeProduct {
  row: ProductRow;
  side: ProductSideInput;
  image: Buffer;
  preset: LogoPlacement | null;
  lightColor: ProductColor;
  darkColor: ProductColor;
  darkImage: Buffer;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

function publicUrl(client: SupabaseClient, storagePath: string): string {
  return client.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

async function upload(
  client: SupabaseClient,
  storagePath: string,
  body: Buffer,
  contentType: string,
) {
  const { error } = await client.storage.from(BUCKET).upload(storagePath, body, {
    contentType,
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw new Error(`${storagePath} 업로드 실패: ${error.message}`);
  return publicUrl(client, storagePath);
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`이미지를 불러오지 못했습니다: ${url} (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

function primarySide(product: ProductRow): ProductSideInput {
  const source = product.configuration?.find((side) => {
    const imageUrl = side.imageUrl || side.layers?.find((layer) => layer.imageUrl)?.imageUrl;
    return Boolean(imageUrl && side.printArea?.width && side.printArea?.height);
  });
  if (!source?.printArea) {
    throw new Error(`${product.product_code} 제품의 사용 가능한 인쇄면이 없습니다.`);
  }
  const imageUrl = source.imageUrl || source.layers?.find((layer) => layer.imageUrl)?.imageUrl;
  if (!imageUrl) throw new Error(`${product.product_code} 제품 이미지가 없습니다.`);
  return {
    id: source.id,
    name: source.name,
    imageUrl,
    printArea: {
      x: Number(source.printArea.x || 0),
      y: Number(source.printArea.y || 0),
      width: Number(source.printArea.width),
      height: Number(source.printArea.height),
    },
  };
}

function colorLuminance(colorHex: string): number {
  const match = colorHex.match(/^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i);
  if (!match) return 128;
  const [red, green, blue] = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function productColors(product: ProductRow): { light: ProductColor; dark: ProductColor } {
  const colors = (product.product_colors || [])
    .filter((entry) => entry.is_active && entry.manufacturer_colors)
    .map((entry) => entry.manufacturer_colors!);
  if (colors.length === 0) throw new Error(`${product.product_code} 제품에 활성 색상이 없습니다.`);
  const light = colors.find((color) => /화이트|white/i.test(color.name)) ||
    [...colors].sort((a, b) => colorLuminance(b.hex) - colorLuminance(a.hex))[0];
  const dark = colors.find((color) => /블랙|검정|black/i.test(color.name)) ||
    [...colors].sort((a, b) => colorLuminance(a.hex) - colorLuminance(b.hex))[0];
  return { light, dark };
}

async function loadRuntimeProducts(client: SupabaseClient, manifest: ExpoManifest) {
  const codes = [...new Set(manifest.brands.flatMap((brand) => brand.productCodes))];
  const { data, error } = await client
    .from('products')
    .select('id,title,product_code,is_active,configuration,product_colors(is_active,manufacturer_colors(id,name,hex,color_code))')
    .in('product_code', codes)
    .eq('is_active', true);
  if (error) throw new Error(`제품 조회 실패: ${error.message}`);

  const productRows = (data || []) as unknown as ProductRow[];
  const byCode = new Map(productRows.map((row) => [row.product_code, row]));
  const missing = codes.filter((code) => !byCode.has(code));
  if (missing.length > 0) throw new Error(`활성 제품을 찾을 수 없습니다: ${missing.join(', ')}`);

  const productIds = [...byCode.values()].map((product) => product.id);
  const { data: presetData, error: presetError } = await client
    .from('partner_mall_presets')
    .select('product_id,placement')
    .in('product_id', productIds)
    .order('name');
  if (presetError) throw new Error(`파트너몰 프리셋 조회 실패: ${presetError.message}`);
  const presetByProduct = new Map<string, LogoPlacement>();
  for (const preset of (presetData || []) as PresetRow[]) {
    if (!presetByProduct.has(preset.product_id)) presetByProduct.set(preset.product_id, preset.placement);
  }

  const runtime = new Map<string, RuntimeProduct>();
  for (const [code, row] of byCode) {
    const side = primarySide(row);
    const image = await fetchBuffer(side.imageUrl);
    const colors = productColors(row);
    runtime.set(code, {
      row,
      side,
      image,
      preset: presetByProduct.get(row.id) || null,
      lightColor: colors.light,
      darkColor: colors.dark,
      darkImage: await recolorProductImage(image, colors.dark.hex),
    });
  }
  return runtime;
}

async function assertMigration(client: SupabaseClient) {
  const { error } = await client.from('partner_malls').select('source_key').limit(1);
  if (error) {
    throw new Error(`먼저 20260824120000_franchise_expo_partner_malls.sql을 적용해야 합니다: ${error.message}`);
  }
}

async function findOrCreateMall(
  client: SupabaseClient,
  brand: ManifestBrand,
  originalLogoUrl: string,
  processedLogoUrl: string,
) {
  const { data: existing, error: lookupError } = await client
    .from('partner_malls')
    .select('id,is_active,share_token,team_meta')
    .eq('source_key', brand.sourceKey)
    .maybeSingle();
  if (lookupError) throw new Error(`${brand.brand} 몰 조회 실패: ${lookupError.message}`);

  const now = new Date().toISOString();
  const teamMeta = {
    ...((existing?.team_meta as Record<string, unknown> | null) || {}),
    franchise_expo_import: {
      round: brand.round,
      source_id: brand.sourceId,
      source_url: brand.detailUrl,
      category: brand.category,
      item: brand.item,
      booth: brand.booth,
      company: brand.company,
      logo_filename: brand.logoFilename,
      logo_sha256: brand.logoSha256,
      imported_at: now,
    },
  };
  const values = {
    source_key: brand.sourceKey,
    name: brand.brand,
    slug: brand.slug,
    logo_url: processedLogoUrl,
    original_logo_url: originalLogoUrl,
    share_token: existing?.share_token || randomBytes(16).toString('hex'),
    team_meta: teamMeta,
    updated_at: now,
  };

  if (existing) {
    const { data, error } = await client
      .from('partner_malls')
      .update(values)
      .eq('id', existing.id)
      .select('id,is_active,share_token')
      .single();
    if (error) throw new Error(`${brand.brand} 몰 업데이트 실패: ${error.message}`);
    return data;
  }

  const { data, error } = await client
    .from('partner_malls')
    .insert({ ...values, is_active: false, created_at: now })
    .select('id,is_active,share_token')
    .single();
  if (error) throw new Error(`${brand.brand} 몰 생성 실패: ${error.message}`);
  return data;
}

async function upsertAsset(
  client: SupabaseClient,
  brand: ManifestBrand,
  mallId: string,
  processedLogoUrl: string,
  processedLogo: Buffer,
) {
  const importKey = `${brand.sourceKey}:logo`;
  const values = {
    partner_mall_id: mallId,
    import_key: importKey,
    asset_type: 'logo',
    url: processedLogoUrl,
    name: `${brand.brand} 로고`,
    description: `제84회 프랜차이즈 창업박람회 ${brand.booth}`,
    file_size: processedLogo.byteLength,
    mime_type: 'image/png',
    is_primary: true,
    sort_order: 0,
    created_by_role: 'admin',
  };
  const { data: existing, error: lookupError } = await client
    .from('partner_mall_assets')
    .select('id')
    .eq('import_key', importKey)
    .maybeSingle();
  if (lookupError) throw new Error(`${brand.brand} 에셋 조회 실패: ${lookupError.message}`);
  const query = existing
    ? client.from('partner_mall_assets').update(values).eq('id', existing.id)
    : client.from('partner_mall_assets').insert(values);
  const { error } = await query;
  if (error) throw new Error(`${brand.brand} 에셋 저장 실패: ${error.message}`);
}

async function upsertProduct(
  client: SupabaseClient,
  brand: ManifestBrand,
  mallId: string,
  runtime: RuntimeProduct,
  logo: Buffer,
  logoUrl: string,
  needsDarkGarment: boolean,
) {
  const importKey = `${brand.sourceKey}:product:${runtime.row.product_code}`;
  const selectedColor = needsDarkGarment ? runtime.darkColor : runtime.lightColor;
  const artwork = await prepareArtwork({
    side: runtime.side,
    productImage: needsDarkGarment ? runtime.darkImage : runtime.image,
    logo,
    logoUrl,
    preset: runtime.preset,
    productColor: selectedColor.hex,
  });
  const previewPath = `${STORAGE_ROOT}/${brand.sourceId}/products/${runtime.row.product_code}.png`;
  const previewUrl = await upload(client, previewPath, artwork.previewBuffer, 'image/png');
  const now = new Date().toISOString();
  const values = {
    partner_mall_id: mallId,
    import_key: importKey,
    product_id: runtime.row.id,
    display_name: `${brand.brand} ${runtime.row.title}`,
    manufacturer_color_id: selectedColor.id,
    color_hex: selectedColor.hex,
    color_name: selectedColor.name,
    color_code: selectedColor.color_code,
    logo_placements: { [runtime.side.id]: artwork.placement },
    canvas_state: { [runtime.side.id]: artwork.canvasState },
    preview_url: previewUrl,
    price: null,
    created_by_role: 'admin',
    updated_at: now,
  };
  const { data: existing, error: lookupError } = await client
    .from('partner_mall_products')
    .select('id')
    .eq('import_key', importKey)
    .maybeSingle();
  if (lookupError) throw new Error(`${brand.brand} ${runtime.row.product_code} 조회 실패: ${lookupError.message}`);
  const query = existing
    ? client.from('partner_mall_products').update(values).eq('id', existing.id)
    : client.from('partner_mall_products').insert({ ...values, created_at: now });
  const { error } = await query;
  if (error) throw new Error(`${brand.brand} ${runtime.row.product_code} 저장 실패: ${error.message}`);
}

async function validateBrand(
  brand: ManifestBrand,
  sourceRoot: string,
  runtimeProducts: Map<string, RuntimeProduct>,
) {
  const original = await readFile(path.join(sourceRoot, ...brand.localRelativePath.split('/')));
  const processed = await preprocessLogo(original);
  const contrast = await analyzeLogoContrast(processed);
  const metadata = await sharp(processed).metadata();
  if (!metadata.width || !metadata.height || !metadata.hasAlpha) {
    throw new Error(`${brand.brand} 전처리 로고 검증에 실패했습니다.`);
  }
  for (const code of brand.productCodes) {
    const runtime = runtimeProducts.get(code);
    if (!runtime) throw new Error(`${brand.brand}의 ${code} 제품이 없습니다.`);
    const selectedColor = contrast.needsDarkGarment ? runtime.darkColor : runtime.lightColor;
    await prepareArtwork({
      side: runtime.side,
      productImage: contrast.needsDarkGarment ? runtime.darkImage : runtime.image,
      logo: processed,
      logoUrl: `https://preview.invalid/${brand.sourceId}.png`,
      preset: runtime.preset,
      productColor: selectedColor.hex,
    });
  }
  return { original, processed, contrast };
}

async function main() {
  const commit = process.argv.includes('--commit');
  const manifestPath = path.resolve(arg('--manifest') || DEFAULT_MANIFEST);
  const sourceRoot = path.resolve(arg('--source-root') || DEFAULT_SOURCE_ROOT);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ExpoManifest;
  if (manifest.totals.uniqueBrands !== 76) {
    throw new Error(`manifest 브랜드 수가 76개가 아닙니다: ${manifest.totals.uniqueBrands}`);
  }

  const client = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const runtimeProducts = await loadRuntimeProducts(client, manifest);
  if (commit) await assertMigration(client);

  console.log(`${commit ? 'COMMIT' : 'DRY-RUN'}: ${manifest.brands.length}개 브랜드를 검증합니다.`);
  let productCount = 0;
  for (const [index, brand] of manifest.brands.entries()) {
    const { original, processed, contrast } = await validateBrand(brand, sourceRoot, runtimeProducts);
    productCount += brand.productCodes.length;

    if (commit) {
      const extension = brand.logoFormat === 'jpeg' ? 'jpg' : brand.logoFormat;
      const basePath = `${STORAGE_ROOT}/${brand.sourceId}`;
      const originalUrl = await upload(
        client,
        `${basePath}/original.${extension}`,
        original,
        extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
      );
      const processedUrl = await upload(
        client,
        `${basePath}/processed.png`,
        processed,
        'image/png',
      );
      const mall = await findOrCreateMall(client, brand, originalUrl, processedUrl);
      if (!mall) throw new Error(`${brand.brand} 몰 저장 결과가 없습니다.`);
      await upsertAsset(client, brand, mall.id, processedUrl, processed);
      for (const code of brand.productCodes) {
        await upsertProduct(
          client,
          brand,
          mall.id,
          runtimeProducts.get(code)!,
          processed,
          processedUrl,
          contrast.needsDarkGarment,
        );
      }
    }

    console.log(`[${index + 1}/${manifest.brands.length}] ${brand.brand} · ${contrast.needsDarkGarment ? '어두운 의류' : '밝은 의류'} · ${brand.productCodes.join(', ')}`);
  }

  console.log(`${commit ? '저장' : '검증'} 완료: 몰 ${manifest.brands.length}개, 제품 ${productCount}개, 로고 ${manifest.brands.length}개`);
  if (!commit) console.log('데이터베이스와 Storage에는 아무것도 쓰지 않았습니다.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
