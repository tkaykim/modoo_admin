import 'dotenv/config';
import { NaverCommerceError } from '../lib/naver-commerce/client';
import { createNaverProductFromLocal, getNaverProduct, updateNaverProduct } from '../lib/naver-commerce/products';
import { createAdminClient } from '../lib/supabase-admin';
import type { NaverProductOptionConfig } from '../lib/naver-commerce/types';

const TEMPLATE_ORIGIN_PRODUCT_NO = Number(process.env.NAVER_COMMERCE_PRODUCT_TEMPLATE_NO || 12905271274);
const CONFIRM_VALUE = 'REGISTER_THREE_SUSPENDED_PRODUCTS';

const PRINT_TIERS: NaverProductOptionConfig['printTiers'] = [
  { code: '10X10', name: '소형 (10×10cm 이내)', optionPrice: 0 },
  { code: 'A4', name: '중형 (A4 이내)', optionPrice: 2000 },
  { code: 'A3', name: '대형 (A3 이내)', optionPrice: 4000 },
];

const products = [
  {
    localProductId: 'a66bb3aa-c16a-4f62-b183-064290c149f3',
    name: '[주문제작] 085-CVT 베이직 라운드 단체티 커스텀 DTF 인쇄',
    salePrice: 11_900,
    expectedCombinations: 462,
    colorCodes: ['005', '010', '031', '032', '025', '146', '014', '165', '015', '112', '003'],
    thumbnailImageUrls: [
      'https://obxekwyolrmipwmffhwq.supabase.co/storage/v1/object/public/products/product-images/product-meta/a66bb3aa-c16a-4f62-b183-064290c149f3/thumbnail_image_link/1780112789552-khey54.png',
    ],
  },
  {
    localProductId: 'dd2a9b80-792d-44dd-9c5a-d8db66e56024',
    name: '[주문제작] 113-BCV 오버핏 라운드 단체티 커스텀 DTF 인쇄',
    salePrice: 13_900,
    expectedCombinations: 96,
    refreshExistingImages: true,
    thumbnailImageUrls: [
      'https://shop-phinf.pstatic.net/20210512_86/1620819970910jnT0q_JPEG/bcv-%EB%A9%94%EC%9D%B8.jpg?type=w860',
      'https://obxekwyolrmipwmffhwq.supabase.co/storage/v1/object/public/products/product-images/1783062866007-okzuol.png',
    ],
  },
  {
    localProductId: '406d573e-0147-46f3-bc7a-3f5837deefbb',
    name: '[주문제작] 216-MLH 쮸리 후드티 단체복 커스텀 DTF 인쇄',
    salePrice: 25_500,
    expectedCombinations: 252,
  },
] as const;

const asRecord = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

async function verify(originProductNo: number, expected: { name: string; salePrice: number; expectedCombinations: number }) {
  const detail = await getNaverProduct(originProductNo);
  const origin = asRecord(detail.originProduct);
  const channel = asRecord(detail.smartstoreChannelProduct);
  const detailAttribute = asRecord(origin.detailAttribute);
  const optionInfo = asRecord(detailAttribute.optionInfo);
  const images = asRecord(origin.images);
  const representativeImageUrl = asRecord(images.representativeImage).url;
  const optionalImages = Array.isArray(images.optionalImages) ? images.optionalImages : [];
  const combinations = Array.isArray(optionInfo.optionCombinations) ? optionInfo.optionCombinations : [];
  return {
    passed: origin.name === expected.name
      && origin.salePrice === expected.salePrice
      && origin.statusType === 'SUSPENSION'
      && channel.channelProductDisplayStatusType === 'SUSPENSION'
      && channel.naverShoppingRegistration === false
      && combinations.length === expected.expectedCombinations
      && Boolean(representativeImageUrl),
    originProductNo,
    channelProductNo: channel.channelProductNo || null,
    name: origin.name,
    salePrice: origin.salePrice,
    saleStatus: origin.statusType,
    displayStatus: channel.channelProductDisplayStatusType,
    naverShoppingRegistration: channel.naverShoppingRegistration,
    optionCombinations: combinations.length,
    representativeImage: Boolean(representativeImageUrl),
    representativeImageUrl,
    optionalImageCount: optionalImages.length,
  };
}

async function main() {
  if (process.env.NAVER_INITIAL_PRODUCTS_CONFIRM !== CONFIRM_VALUE) {
    throw new Error(`NAVER_INITIAL_PRODUCTS_CONFIRM=${CONFIRM_VALUE} 확인값이 없어 실제 상품 등록을 중단했습니다.`);
  }
  if (!Number.isSafeInteger(TEMPLATE_ORIGIN_PRODUCT_NO) || TEMPLATE_ORIGIN_PRODUCT_NO <= 0) {
    throw new Error('유효한 네이버 템플릿 원상품 번호가 필요합니다.');
  }
  const admin = createAdminClient();
  const results: Array<Record<string, unknown>> = [];
  for (const product of products) {
    const { data: existing } = await admin.from('naver_product_mappings')
      .select('origin_product_no,channel_product_no,naver_product_name')
      .eq('local_product_id', product.localProductId)
      .eq('naver_product_name', product.name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.origin_product_no) {
      if (
        process.env.NAVER_INITIAL_PRODUCTS_REFRESH_IMAGES === 'true'
        && 'refreshExistingImages' in product
        && product.refreshExistingImages
        && 'thumbnailImageUrls' in product
      ) {
        await updateNaverProduct({
          originProductNo: Number(existing.origin_product_no),
          imageUrls: [...product.thumbnailImageUrls],
          suspended: true,
        });
      }
      results.push({ reused: true, ...(await verify(Number(existing.origin_product_no), product)) });
      continue;
    }
    const created = await createNaverProductFromLocal({
      localProductId: product.localProductId,
      templateOriginProductNo: TEMPLATE_ORIGIN_PRODUCT_NO,
      suspended: true,
      name: product.name,
      salePrice: product.salePrice,
      stockQuantity: 999,
      thumbnailImageUrls: 'thumbnailImageUrls' in product ? [...product.thumbnailImageUrls] : undefined,
      optionConfig: {
        colorCodes: 'colorCodes' in product ? [...product.colorCodes] : undefined,
        printTiers: PRINT_TIERS,
        maxCombinations: 500,
      },
    });
    results.push({
      reused: false,
      ...created.optionSummary,
      ...(await verify(created.mapping.originProductNo, product)),
    });
  }
  const passed = results.length === products.length && results.every((result) => result.passed === true);
  process.stdout.write(JSON.stringify({ passed, templateOriginProductNo: TEMPLATE_ORIGIN_PRODUCT_NO, results }, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  if (error instanceof NaverCommerceError && error.responseBody) {
    process.stderr.write(`${JSON.stringify(error.responseBody, null, 2)}\n`);
  }
  process.exitCode = 1;
});
