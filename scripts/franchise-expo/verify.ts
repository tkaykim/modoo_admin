import { createClient } from '@supabase/supabase-js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

async function main() {
  const client = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const [mallResult, productResult, assetResult] = await Promise.all([
    client
      .from('partner_malls')
      .select('id,is_active,share_token,source_key')
      .like('source_key', 'franchise-coex:84:%'),
    client
      .from('partner_mall_products')
      .select('id,partner_mall_id,product_id,import_key,color_name,color_hex,logo_placements,canvas_state,preview_url,product:products(product_code,configuration)')
      .like('import_key', 'franchise-coex:84:%'),
    client
      .from('partner_mall_assets')
      .select('id,partner_mall_id,import_key,url,is_primary,sort_order')
      .like('import_key', 'franchise-coex:84:%'),
  ]);
  const error = mallResult.error || productResult.error || assetResult.error;
  if (error) throw new Error(error.message);

  const malls = mallResult.data || [];
  const products = productResult.data || [];
  const assets = assetResult.data || [];
  const productsByMall = new Map<string, number>();
  const assetsByMall = new Map<string, number>();
  for (const product of products) {
    productsByMall.set(product.partner_mall_id, (productsByMall.get(product.partner_mall_id) || 0) + 1);
  }
  for (const asset of assets) {
    assetsByMall.set(asset.partner_mall_id, (assetsByMall.get(asset.partner_mall_id) || 0) + 1);
  }

  const failures: string[] = [];
  if (malls.length !== 76) failures.push(`몰 ${malls.length}/76`);
  if (products.length !== 456) failures.push(`제품 ${products.length}/456`);
  if (assets.length !== 228) failures.push(`에셋 ${assets.length}/228`);
  for (const mall of malls) {
    if (mall.is_active) failures.push(`${mall.source_key}: 활성 상태`);
    if (!mall.share_token) failures.push(`${mall.source_key}: share token 없음`);
    if (productsByMall.get(mall.id) !== 6) failures.push(`${mall.source_key}: 제품 ${productsByMall.get(mall.id) || 0}개`);
    if (assetsByMall.get(mall.id) !== 3) failures.push(`${mall.source_key}: 로고 ${assetsByMall.get(mall.id) || 0}개`);
  }
  const pairColors = new Map<string, Set<string>>();
  for (const product of products) {
    if (!product.preview_url) failures.push(`${product.import_key}: preview 없음`);
    const placements = (product.logo_placements || {}) as Record<string, { x?: number; y?: number; width?: number; height?: number }>;
    const canvasState = (product.canvas_state || {}) as Record<string, string>;
    if (Object.keys(placements).length !== 2) failures.push(`${product.import_key}: 앞·뒤 placement 불완전`);
    if (Object.keys(canvasState).length !== 2) failures.push(`${product.import_key}: 앞·뒤 canvas state 불완전`);
    const relation = Array.isArray(product.product) ? product.product[0] : product.product;
    const configuration = (relation?.configuration || []) as Array<{
      id: string;
      name?: string;
      printArea?: { width?: number; height?: number };
    }>;
    const front = configuration.find((side) => side.id === 'front' || /앞면|front/i.test(side.name || ''));
    const back = configuration.find((side) => side.id === 'back' || /뒷면|등판|back/i.test(side.name || ''));
    if (!front || !back) {
      failures.push(`${product.import_key}: 제품 앞·뒤 인쇄면 없음`);
    } else {
      const frontPlacement = placements[front.id];
      const backPlacement = placements[back.id];
      if (!frontPlacement || !backPlacement) failures.push(`${product.import_key}: 앞·뒤 placement key 불일치`);
      if (frontPlacement && front.printArea?.width && front.printArea?.height) {
        const visibleSize = Math.max(
          Number(frontPlacement.width || 0) / front.printArea.width,
          Number(frontPlacement.height || 0) / front.printArea.height,
        );
        if (Number(frontPlacement.x || 0) < front.printArea.width * 0.48) {
          failures.push(`${product.import_key}: 착용자 왼쪽 가슴 위치 아님`);
        }
        if (visibleSize < 0.16) failures.push(`${product.import_key}: 앞면 로고가 너무 작음`);
      }
      if (backPlacement && back.printArea?.width && back.printArea?.height) {
        const visibleSize = Math.max(
          Number(backPlacement.width || 0) / back.printArea.width,
          Number(backPlacement.height || 0) / back.printArea.height,
        );
        if (visibleSize < 0.38) failures.push(`${product.import_key}: 등판 로고가 너무 작음`);
      }
    }
    const garmentColor = /:white$/.test(product.import_key || '')
      ? 'white'
      : /:black$/.test(product.import_key || '')
        ? 'black'
        : null;
    if (!garmentColor) failures.push(`${product.import_key}: 화이트/블랙 import key 아님`);
    if (garmentColor === 'white' && !/화이트|white/i.test(product.color_name || '')) failures.push(`${product.import_key}: 화이트 색상 아님`);
    if (garmentColor === 'black' && !/블랙|검정|black/i.test(product.color_name || '')) failures.push(`${product.import_key}: 블랙 색상 아님`);
    const pairKey = `${product.partner_mall_id}:${product.product_id}`;
    if (!pairColors.has(pairKey)) pairColors.set(pairKey, new Set());
    if (garmentColor) pairColors.get(pairKey)!.add(garmentColor);
  }
  for (const [pairKey, colors] of pairColors) {
    if (colors.size !== 2 || !colors.has('white') || !colors.has('black')) {
      failures.push(`${pairKey}: 화이트/블랙 쌍 불완전`);
    }
  }
  const primaryByMall = new Map<string, number>();
  for (const asset of assets) {
    if (!asset.url) failures.push(`${asset.import_key}: 로고 URL 없음`);
    if (asset.is_primary) primaryByMall.set(asset.partner_mall_id, (primaryByMall.get(asset.partner_mall_id) || 0) + 1);
    if (!/:logo(?::light-garment|:dark-garment)?$/.test(asset.import_key || '')) failures.push(`${asset.import_key}: 로고 variant key 불일치`);
  }
  for (const mall of malls) {
    if (primaryByMall.get(mall.id) !== 1) failures.push(`${mall.source_key}: 기본 로고 ${primaryByMall.get(mall.id) || 0}개`);
  }

  if (failures.length > 0) {
    throw new Error(`검증 실패 (${failures.length}건)\n${failures.slice(0, 30).join('\n')}`);
  }
  console.log('검증 완료: 비활성 몰 76개, 화이트·블랙 제품 456개, 대비 로고 에셋 228개');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
