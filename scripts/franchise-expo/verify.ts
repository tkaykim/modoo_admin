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
      .select('id,partner_mall_id,import_key,logo_placements,canvas_state,preview_url')
      .like('import_key', 'franchise-coex:84:%'),
    client
      .from('partner_mall_assets')
      .select('id,partner_mall_id,import_key,url,is_primary')
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
  if (products.length !== 228) failures.push(`제품 ${products.length}/228`);
  if (assets.length !== 76) failures.push(`에셋 ${assets.length}/76`);
  for (const mall of malls) {
    if (mall.is_active) failures.push(`${mall.source_key}: 활성 상태`);
    if (!mall.share_token) failures.push(`${mall.source_key}: share token 없음`);
    if (productsByMall.get(mall.id) !== 3) failures.push(`${mall.source_key}: 제품 ${productsByMall.get(mall.id) || 0}개`);
    if (assetsByMall.get(mall.id) !== 1) failures.push(`${mall.source_key}: 로고 ${assetsByMall.get(mall.id) || 0}개`);
  }
  for (const product of products) {
    if (!product.preview_url) failures.push(`${product.import_key}: preview 없음`);
    if (!product.logo_placements || Object.keys(product.logo_placements).length === 0) failures.push(`${product.import_key}: placement 없음`);
    if (!product.canvas_state || Object.keys(product.canvas_state).length === 0) failures.push(`${product.import_key}: canvas state 없음`);
  }
  for (const asset of assets) {
    if (!asset.url || !asset.is_primary) failures.push(`${asset.import_key}: 기본 로고 불완전`);
  }

  if (failures.length > 0) {
    throw new Error(`검증 실패 (${failures.length}건)\n${failures.slice(0, 30).join('\n')}`);
  }
  console.log('검증 완료: 비활성 몰 76개, 제품 228개, 기본 로고 76개');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
