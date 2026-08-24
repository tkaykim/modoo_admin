import 'dotenv/config';
import { createAdminClient } from '../lib/supabase-admin';
import { getNaverProduct, syncNaverProducts } from '../lib/naver-commerce/products';
import { syncNaverOrders } from '../lib/naver-commerce/orders';
import { syncNaverQnas } from '../lib/naver-commerce/qnas';
import { syncNaverSettlements } from '../lib/naver-commerce/settlements';

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const admin = createAdminClient();
  const { data: template } = await admin.from('naver_product_mappings').select('origin_product_no').order('origin_product_no').limit(1).maybeSingle();
  const products = await syncNaverProducts();
  const orders = await syncNaverOrders();
  const now = new Date();
  const qnas = await syncNaverQnas(new Date(now.getTime() - 30 * 86_400_000).toISOString(), now.toISOString());
  const settlements = await syncNaverSettlements(dateOnly(new Date(now.getTime() - 7 * 86_400_000)), dateOnly(now));
  const templateNo = Number(process.env.NAVER_COMMERCE_PRODUCT_TEMPLATE_NO || template?.origin_product_no || 0);
  const productDetail = templateNo ? await getNaverProduct(templateNo) : null;
  const origin = productDetail?.originProduct as Record<string, unknown> | undefined;
  const detailAttribute = origin?.detailAttribute as Record<string, unknown> | undefined;
  process.stdout.write(JSON.stringify({
    products,
    orders,
    qnas,
    settlements,
    productDetailReadable: Boolean(productDetail),
    productDetailShape: productDetail ? {
      rootKeys: Object.keys(productDetail),
      originKeys: Object.keys(origin || {}),
      detailAttributeKeys: Object.keys(detailAttribute || {}),
      optionInfo: detailAttribute?.optionInfo || null,
    } : null,
  }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
