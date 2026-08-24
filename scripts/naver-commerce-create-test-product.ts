import 'dotenv/config';
import { NaverCommerceError } from '../lib/naver-commerce/client';
import { createNaverProductFromLocal, getNaverProduct, syncNaverProducts, updateNaverProduct } from '../lib/naver-commerce/products';
import { createAdminClient } from '../lib/supabase-admin';

const LOCAL_PRODUCT_ID = 'a66bb3aa-c16a-4f62-b183-064290c149f3';
const TEMPLATE_ORIGIN_PRODUCT_NO = 12905271274;
const TEST_NAME = '[연동 테스트] 베이직 라운드 티셔츠 20260824';

async function main() {
  const existingOriginProductNo = Number(process.env.NAVER_TEST_ORIGIN_PRODUCT_NO || 0);
  let originProductNo: number;
  if (Number.isSafeInteger(existingOriginProductNo) && existingOriginProductNo > 0) {
    if (process.env.NAVER_TEST_PRODUCT_CONFIRM !== 'VERIFY_EXISTING_SUSPENDED_TEST_PRODUCT') {
      throw new Error('기존 테스트 상품 확인값이 없어 수정을 중단했습니다.');
    }
    originProductNo = existingOriginProductNo;
  } else {
    if (process.env.NAVER_TEST_PRODUCT_CONFIRM !== 'CREATE_SUSPENDED_TEST_PRODUCT') {
      throw new Error('NAVER_TEST_PRODUCT_CONFIRM 확인값이 없어 상품 생성을 중단했습니다.');
    }
    const created = await createNaverProductFromLocal({
      localProductId: LOCAL_PRODUCT_ID,
      templateOriginProductNo: TEMPLATE_ORIGIN_PRODUCT_NO,
      suspended: true,
      name: TEST_NAME,
      salePrice: 990_000,
      stockQuantity: 1,
    });
    originProductNo = created.mapping.originProductNo;
  }
  let detail = await getNaverProduct(originProductNo);
  const initialOrigin = detail.originProduct as Record<string, unknown>;
  if (initialOrigin.statusType !== 'SUSPENSION') {
    await updateNaverProduct({ originProductNo, suspended: true });
    detail = await getNaverProduct(originProductNo);
  }
  await syncNaverProducts();
  const admin = createAdminClient();
  const { data: mapping } = await admin.from('naver_product_mappings').select('channel_product_no').eq('origin_product_no', originProductNo).maybeSingle();
  const origin = detail.originProduct as Record<string, unknown>;
  const channel = detail.smartstoreChannelProduct as Record<string, unknown>;
  const verification = {
    originProductNo,
    channelProductNo: mapping?.channel_product_no || null,
    name: origin.name,
    salePrice: origin.salePrice,
    stockQuantity: origin.stockQuantity,
    saleStatus: origin.statusType,
    displayStatus: channel.channelProductDisplayStatusType,
    naverShoppingRegistration: channel.naverShoppingRegistration,
    representativeImage: Boolean((origin.images as Record<string, unknown> | undefined)?.representativeImage),
  };
  const passed = verification.name === TEST_NAME
    && verification.salePrice === 990_000
    && verification.stockQuantity === 1
    && verification.saleStatus === 'SUSPENSION'
    && verification.displayStatus === 'SUSPENSION'
    && verification.naverShoppingRegistration === false
    && verification.representativeImage;
  process.stdout.write(JSON.stringify({ passed, verification }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  const detail = error instanceof NaverCommerceError ? error.responseBody : undefined;
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  if (detail) process.stderr.write(`${JSON.stringify(detail, null, 2)}\n`);
  process.exitCode = 1;
});
