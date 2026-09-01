import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import {
  analyzeLogoContrast,
  buildContrastLogoVariants,
  combineArtworkPreviews,
  prepareArtwork,
  preprocessLogo,
  preprocessPhotoWhiteLogo,
  preprocessChromaticLogo,
  recolorProductImage,
  type ExpoManifest,
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

interface RuntimeProduct {
  row: ProductRow;
  frontSide: ProductSideInput;
  backSide: ProductSideInput;
  whiteColor: ProductColor;
  blackColor: ProductColor;
  whiteFrontImage: Buffer;
  whiteBackImage: Buffer;
  blackFrontImage: Buffer;
  blackBackImage: Buffer;
}

type GarmentColor = 'white' | 'black';

function safeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '_');
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

function productSide(product: ProductRow, kind: 'front' | 'back'): ProductSideInput {
  const pattern = kind === 'front' ? /^(앞면|front)$/i : /^(뒷면|등판|back)$/i;
  const source = product.configuration?.find((side) => {
    const imageUrl = side.imageUrl || side.layers?.find((layer) => layer.imageUrl)?.imageUrl;
    return Boolean(
      imageUrl &&
      side.printArea?.width &&
      side.printArea?.height &&
      (side.id.toLowerCase() === kind || pattern.test(side.name || '')),
    );
  });
  if (!source?.printArea) {
    throw new Error(`${product.product_code} 제품의 ${kind === 'front' ? '앞면' : '뒷면'} 인쇄면이 없습니다.`);
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

function productColors(product: ProductRow): { white: ProductColor; black: ProductColor } {
  const colors = (product.product_colors || [])
    .filter((entry) => entry.is_active && entry.manufacturer_colors)
    .map((entry) => entry.manufacturer_colors!);
  if (colors.length === 0) throw new Error(`${product.product_code} 제품에 활성 색상이 없습니다.`);
  const white = colors.find((color) => /화이트|white/i.test(color.name));
  const black = colors.find((color) => /블랙|검정|black/i.test(color.name));
  if (!white || colorLuminance(white.hex) < 220) {
    throw new Error(`${product.product_code} 제품에 정확한 화이트 색상이 없습니다.`);
  }
  if (!black || colorLuminance(black.hex) > 80) {
    throw new Error(`${product.product_code} 제품에 정확한 블랙 색상이 없습니다.`);
  }
  return { white, black };
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

  const runtime = new Map<string, RuntimeProduct>();
  for (const [code, row] of byCode) {
    const frontSide = productSide(row, 'front');
    const backSide = productSide(row, 'back');
    const [whiteFrontImage, whiteBackImage] = await Promise.all([
      fetchBuffer(frontSide.imageUrl),
      fetchBuffer(backSide.imageUrl),
    ]);
    const colors = productColors(row);
    runtime.set(code, {
      row,
      frontSide,
      backSide,
      whiteColor: colors.white,
      blackColor: colors.black,
      whiteFrontImage,
      whiteBackImage,
      blackFrontImage: await recolorProductImage(whiteFrontImage, colors.black.hex),
      blackBackImage: await recolorProductImage(whiteBackImage, colors.black.hex),
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
  input: {
    suffix: '' | ':light-garment' | ':dark-garment';
    url: string;
    body: Buffer;
    name: string;
    description: string;
    isPrimary: boolean;
    sortOrder: number;
  },
) {
  const importKey = `${brand.sourceKey}:logo${input.suffix}`;
  const values = {
    partner_mall_id: mallId,
    import_key: importKey,
    asset_type: 'logo',
    url: input.url,
    name: input.name,
    description: input.description,
    file_size: input.body.byteLength,
    mime_type: 'image/png',
    is_primary: input.isPrimary,
    sort_order: input.sortOrder,
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

async function buildColorwayArtwork(
  runtime: RuntimeProduct,
  logo: Buffer,
  logoUrl: string,
  garmentColor: GarmentColor,
) {
  const selectedColor = garmentColor === 'white' ? runtime.whiteColor : runtime.blackColor;
  const frontArtwork = await prepareArtwork({
    side: runtime.frontSide,
    productImage: garmentColor === 'white' ? runtime.whiteFrontImage : runtime.blackFrontImage,
    logo,
    logoUrl,
    productColor: selectedColor.hex,
    placementKind: 'left-chest',
  });
  const backArtwork = await prepareArtwork({
    side: runtime.backSide,
    productImage: garmentColor === 'white' ? runtime.whiteBackImage : runtime.blackBackImage,
    logo,
    logoUrl,
    productColor: selectedColor.hex,
    placementKind: 'large-back',
  });
  return {
    selectedColor,
    frontArtwork,
    backArtwork,
    preview: await combineArtworkPreviews(frontArtwork, backArtwork),
  };
}

async function upsertProduct(
  client: SupabaseClient,
  brand: ManifestBrand,
  mallId: string,
  runtime: RuntimeProduct,
  logo: Buffer,
  logoUrl: string,
  garmentColor: GarmentColor,
) {
  const importKey = `${brand.sourceKey}:product:${runtime.row.product_code}:${garmentColor}`;
  const { selectedColor, frontArtwork, backArtwork, preview } = await buildColorwayArtwork(
    runtime,
    logo,
    logoUrl,
    garmentColor,
  );
  const previewPath = `${STORAGE_ROOT}/${brand.sourceId}/products/${runtime.row.product_code}-${garmentColor}.png`;
  const previewUrl = await upload(client, previewPath, preview, 'image/png');
  const now = new Date().toISOString();
  const values = {
    partner_mall_id: mallId,
    import_key: importKey,
    product_id: runtime.row.id,
    display_name: `${brand.brand} ${runtime.row.title} · ${garmentColor === 'white' ? '화이트' : '블랙'}`,
    manufacturer_color_id: selectedColor.id,
    color_hex: selectedColor.hex,
    color_name: selectedColor.name,
    color_code: selectedColor.color_code,
    logo_placements: {
      [runtime.frontSide.id]: frontArtwork.placement,
      [runtime.backSide.id]: backArtwork.placement,
    },
    canvas_state: {
      [runtime.frontSide.id]: frontArtwork.canvasState,
      [runtime.backSide.id]: backArtwork.canvasState,
    },
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
  let reusable = existing;
  if (!reusable && garmentColor === 'white') {
    const legacyProductCode = runtime.row.product_code === 'DK520' ? 'JK115' : runtime.row.product_code;
    const legacyKey = `${brand.sourceKey}:product:${legacyProductCode}`;
    const { data: legacy, error: legacyError } = await client
      .from('partner_mall_products')
      .select('id')
      .eq('import_key', legacyKey)
      .maybeSingle();
    if (legacyError) throw new Error(`${brand.brand} ${legacyProductCode} 기존 제품 조회 실패: ${legacyError.message}`);
    reusable = legacy;
  }
  const query = reusable
    ? client.from('partner_mall_products').update(values).eq('id', reusable.id)
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
  const processed = brand.sourceId === '4624'
    ? await preprocessPhotoWhiteLogo(original)
    : brand.sourceId === '4724'
      ? await preprocessChromaticLogo(original)
      : await preprocessLogo(original);
  const contrast = await analyzeLogoContrast(processed);
  const metadata = await sharp(processed).metadata();
  if (!metadata.width || !metadata.height || !metadata.hasAlpha) {
    throw new Error(`${brand.brand} 전처리 로고 검증에 실패했습니다.`);
  }
  const logoVariants = await buildContrastLogoVariants(processed, contrast);
  for (const code of brand.productCodes) {
    const runtime = runtimeProducts.get(code);
    if (!runtime) throw new Error(`${brand.brand}의 ${code} 제품이 없습니다.`);
    for (const garmentColor of ['white', 'black'] as const) {
      const selectedColor = garmentColor === 'white' ? runtime.whiteColor : runtime.blackColor;
      const selectedLogo = garmentColor === 'white'
        ? logoVariants.lightGarmentLogo
        : logoVariants.darkGarmentLogo;
      for (const [side, productImage, placementKind] of [
        [runtime.frontSide, garmentColor === 'white' ? runtime.whiteFrontImage : runtime.blackFrontImage, 'left-chest'],
        [runtime.backSide, garmentColor === 'white' ? runtime.whiteBackImage : runtime.blackBackImage, 'large-back'],
      ] as const) {
        await prepareArtwork({
          side,
          productImage,
          logo: selectedLogo,
          logoUrl: `https://preview.invalid/${brand.sourceId}-${garmentColor}.png`,
          productColor: selectedColor.hex,
          placementKind,
        });
      }
    }
  }
  return { original, processed, contrast, logoVariants };
}

async function main() {
  const commit = process.argv.includes('--commit');
  const manifestPath = path.resolve(arg('--manifest') || DEFAULT_MANIFEST);
  const sourceRoot = path.resolve(arg('--source-root') || DEFAULT_SOURCE_ROOT);
  const previewDirArg = arg('--preview-dir');
  const previewDir = previewDirArg ? path.resolve(previewDirArg) : null;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ExpoManifest;
  if (manifest.totals.uniqueBrands !== 76) {
    throw new Error(`manifest 브랜드 수가 76개가 아닙니다: ${manifest.totals.uniqueBrands}`);
  }
  const onlySourceId = arg('--only-source-id');
  const brands = onlySourceId
    ? manifest.brands.filter((brand) => brand.sourceId === onlySourceId)
    : manifest.brands;
  if (onlySourceId && brands.length !== 1) throw new Error(`sourceId ${onlySourceId} 브랜드를 찾을 수 없습니다.`);

  const client = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const runtimeProducts = await loadRuntimeProducts(client, manifest);
  if (commit) await assertMigration(client);
  if (previewDir) await mkdir(previewDir, { recursive: true });

  console.log(`${commit ? 'COMMIT' : 'DRY-RUN'}: ${brands.length}개 브랜드를 검증합니다.`);
  let productCount = 0;
  for (const [index, brand] of brands.entries()) {
    const { original, processed, logoVariants } = await validateBrand(brand, sourceRoot, runtimeProducts);
    productCount += brand.productCodes.length * 2;

    if (previewDir && (index % 10 === 0 || index === brands.length - 1)) {
      const runtime = runtimeProducts.get(brand.productCodes[0])!;
      for (const garmentColor of ['white', 'black'] as const) {
        const artwork = await buildColorwayArtwork(
          runtime,
          garmentColor === 'white' ? logoVariants.lightGarmentLogo : logoVariants.darkGarmentLogo,
          `https://preview.invalid/${brand.sourceId}-${garmentColor}.png`,
          garmentColor,
        );
        await writeFile(
          path.join(previewDir, `${String(index + 1).padStart(3, '0')}_${safeFilename(brand.brand)}_${garmentColor}.png`),
          artwork.preview,
        );
      }
    }

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
      const lightGarmentLogoUrl = await upload(
        client,
        `${basePath}/logo-light-garment.png`,
        logoVariants.lightGarmentLogo,
        'image/png',
      );
      const darkGarmentLogoUrl = await upload(
        client,
        `${basePath}/logo-dark-garment.png`,
        logoVariants.darkGarmentLogo,
        'image/png',
      );
      const mall = await findOrCreateMall(client, brand, originalUrl, processedUrl);
      if (!mall) throw new Error(`${brand.brand} 몰 저장 결과가 없습니다.`);
      await upsertAsset(client, brand, mall.id, {
        suffix: '',
        url: processedUrl,
        body: processed,
        name: `${brand.brand} 원본 로고`,
        description: `제84회 프랜차이즈 창업박람회 ${brand.booth} 원본 색상`,
        isPrimary: true,
        sortOrder: 0,
      });
      await upsertAsset(client, brand, mall.id, {
        suffix: ':light-garment',
        url: lightGarmentLogoUrl,
        body: logoVariants.lightGarmentLogo,
        name: `${brand.brand} 밝은 의류용 로고`,
        description: `화이트 의류에서 선명하게 보이도록 대비 보정 · ${logoVariants.lightGarmentMode}`,
        isPrimary: false,
        sortOrder: 1,
      });
      await upsertAsset(client, brand, mall.id, {
        suffix: ':dark-garment',
        url: darkGarmentLogoUrl,
        body: logoVariants.darkGarmentLogo,
        name: `${brand.brand} 어두운 의류용 로고`,
        description: `블랙 의류에서 선명하게 보이도록 대비 보정 · ${logoVariants.darkGarmentMode}`,
        isPrimary: false,
        sortOrder: 2,
      });
      for (const code of brand.productCodes) {
        for (const garmentColor of ['white', 'black'] as const) {
          await upsertProduct(
            client,
            brand,
            mall.id,
            runtimeProducts.get(code)!,
            garmentColor === 'white' ? logoVariants.lightGarmentLogo : logoVariants.darkGarmentLogo,
            garmentColor === 'white' ? lightGarmentLogoUrl : darkGarmentLogoUrl,
            garmentColor,
          );
        }
      }
    }

    console.log(`[${index + 1}/${brands.length}] ${brand.brand} · 화이트/블랙 · 앞면 왼쪽 가슴/등판 · ${brand.productCodes.join(', ')}`);
  }

  console.log(`${commit ? '저장' : '검증'} 완료: 몰 ${brands.length}개, 제품 ${productCount}개, 로고 ${brands.length}개`);
  if (!commit) console.log('데이터베이스와 Storage에는 아무것도 쓰지 않았습니다.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
