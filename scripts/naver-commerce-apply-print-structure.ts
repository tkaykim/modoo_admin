import 'dotenv/config';
import { NaverCommerceError } from '../lib/naver-commerce/client';
import {
  getNaverProduct,
  reconfigureNaverProductFromLocal,
  syncNaverProducts,
} from '../lib/naver-commerce/products';
import {
  INCLUDED_10CM_PRINT_TIER,
  STANDARD_PRINT_SUPPLEMENT_GROUPS,
} from '../lib/naver-commerce/product-options';
import { createAdminClient } from '../lib/supabase-admin';

const CONFIRM_VALUE = 'APPLY_STANDARD_PRINT_STRUCTURE';
const EXPECTED_SUPPLEMENT_GROUPS = [
  '기본인쇄 변경(수량만큼)',
  '추가인쇄 10cm(수량만큼)',
  '추가인쇄 A4(수량만큼)',
  '추가인쇄 A3(수량만큼)',
];

const products = [
  {
    localProductId: 'a66bb3aa-c16a-4f62-b183-064290c149f3',
    originProductNo: 13_672_223_064,
    name: '[10cm 인쇄 포함] 티셔츠 주문 제작 라운드 반팔 단체티 소량 커스텀 인쇄 17수 빅사이즈 085-CVT',
    salePrice: 11_900,
    expectedCombinations: 154,
    colorCodes: ['005', '010', '031', '032', '025', '146', '014', '165', '015', '112,302', '003'],
  },
  {
    localProductId: 'dd2a9b80-792d-44dd-9c5a-d8db66e56024',
    originProductNo: 13_672_223_161,
    name: '[10cm 인쇄 포함] 오버핏 티셔츠 주문 제작 라운드 반팔 단체티 소량 커스텀 인쇄 17수 113-BCV',
    salePrice: 13_900,
    expectedCombinations: 32,
  },
  {
    localProductId: '406d573e-0147-46f3-bc7a-3f5837deefbb',
    originProductNo: 13_672_223_257,
    name: '[10cm 인쇄 포함] 후드티 주문 제작 단체복 소량 커스텀 인쇄 8.4oz 미니쭈리 216-MLH',
    salePrice: 25_500,
    expectedCombinations: 84,
  },
] as const;

const asRecord = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

const asRecords = (value: unknown) => Array.isArray(value) ? value.map(asRecord) : [];

async function verify(product: typeof products[number]) {
  const payload = await getNaverProduct(product.originProductNo);
  const origin = asRecord(payload.originProduct);
  const channel = asRecord(payload.smartstoreChannelProduct);
  const detail = asRecord(origin.detailAttribute);
  const optionInfo = asRecord(detail.optionInfo);
  const combinations = asRecords(optionInfo.optionCombinations);
  const supplementInfo = asRecord(detail.supplementProductInfo);
  const supplements = asRecords(supplementInfo.supplementProducts);
  const groupNames = [...new Set(supplements.map((row) => String(row.groupName || '')))];
  const printValues = [...new Set(combinations.map((row) => String(row.optionName3 || '')))];
  const managementCodes = [
    ...combinations.map((row) => String(row.sellerManagerCode || '')),
    ...supplements.map((row) => String(row.sellerManagementCode || '')),
  ];
  const detailContent = String(origin.detailContent || '');
  const detailGuideChecks = {
    exactQuantityGuide: detailContent.includes('의류 10장을 주문하면 인쇄 변경·추가 옵션도 10개를 선택해야 합니다.'),
    quantityGuide: detailContent.includes('의류 10장을 주문하면'),
    includedPrintGuide: detailContent.includes('기본 10cm 이내 인쇄가 상품 가격에 포함되어 있습니다.'),
    guideId: detailContent.includes('modoo-print-guide-v2'),
    length: detailContent.length,
  };
  const passed = origin.name === product.name
    && origin.salePrice === product.salePrice
    && origin.statusType === 'SUSPENSION'
    && channel.channelProductDisplayStatusType === 'SUSPENSION'
    && channel.naverShoppingRegistration === false
    && combinations.length === product.expectedCombinations
    && combinations.every((row) => row.price === 0 && Number(row.stockQuantity) > 0 && row.usable === true)
    && printValues.length === 1
    && printValues[0] === INCLUDED_10CM_PRINT_TIER.name
    && supplements.length === 13
    && supplements.every((row) => Number(row.price) > 0 && Number(row.stockQuantity) > 0 && row.usable === true)
    && JSON.stringify(groupNames) === JSON.stringify(EXPECTED_SUPPLEMENT_GROUPS)
    && managementCodes.every(Boolean)
    && new Set(managementCodes).size === managementCodes.length
    && detailGuideChecks.quantityGuide
    && detailGuideChecks.includedPrintGuide;
  return {
    passed,
    originProductNo: product.originProductNo,
    channelProductNo: channel.channelProductNo || null,
    name: origin.name,
    salePrice: origin.salePrice,
    saleStatus: origin.statusType,
    displayStatus: channel.channelProductDisplayStatusType,
    naverShoppingRegistration: channel.naverShoppingRegistration,
    optionCombinations: combinations.length,
    optionStockMin: combinations.length ? Math.min(...combinations.map((row) => Number(row.stockQuantity))) : null,
    printValues,
    supplementProducts: supplements.length,
    supplementStockMin: supplements.length ? Math.min(...supplements.map((row) => Number(row.stockQuantity))) : null,
    supplementGroups: groupNames,
    managementCodesUnique: new Set(managementCodes).size === managementCodes.length,
    detailGuideChecks,
  };
}

async function main() {
  const verifyOnly = process.env.NAVER_PRINT_STRUCTURE_VERIFY_ONLY === 'true';
  if (!verifyOnly && process.env.NAVER_PRINT_STRUCTURE_CONFIRM !== CONFIRM_VALUE) {
    throw new Error(`NAVER_PRINT_STRUCTURE_CONFIRM=${CONFIRM_VALUE} 확인값이 없어 실제 상품 수정을 중단했습니다.`);
  }
  const results = [];
  for (const product of products) {
    let optionSummary = null;
    if (!verifyOnly) {
      const updated = await reconfigureNaverProductFromLocal({
        localProductId: product.localProductId,
        originProductNo: product.originProductNo,
        name: product.name,
        salePrice: product.salePrice,
        suspended: true,
        optionConfig: {
          colorCodes: 'colorCodes' in product ? [...product.colorCodes] : undefined,
          printTiers: [INCLUDED_10CM_PRINT_TIER],
          supplementGroups: STANDARD_PRINT_SUPPLEMENT_GROUPS,
          combinationStockQuantity: 99_999,
          supplementStockQuantity: 9_999_999,
          maxCombinations: 500,
        },
      });
      optionSummary = updated.optionSummary;
    }
    results.push({ optionSummary, ...(await verify(product)) });
  }
  const sync = verifyOnly ? null : await syncNaverProducts();
  const admin = createAdminClient();
  const { data: mappingRows, error: mappingError } = await admin.from('naver_product_mappings')
    .select('origin_product_no,channel_product_no,naver_product_name,status_type,sale_price')
    .in('origin_product_no', products.map((product) => product.originProductNo));
  if (mappingError) throw mappingError;
  const mappings = products.map((product) => {
    const row = (mappingRows || []).find((candidate) => Number(candidate.origin_product_no) === product.originProductNo);
    return {
      originProductNo: product.originProductNo,
      channelProductNo: row?.channel_product_no || null,
      name: row?.naver_product_name || null,
      statusType: row?.status_type || null,
      salePrice: row?.sale_price || null,
      passed: row?.naver_product_name === product.name
        && row?.status_type === 'SUSPENSION'
        && Number(row?.sale_price) === product.salePrice,
    };
  });
  const passed = results.length === products.length
    && results.every((result) => result.passed)
    && mappings.every((mapping) => mapping.passed);
  process.stdout.write(`${JSON.stringify({ passed, results, sync, mappings }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  if (error instanceof NaverCommerceError && error.responseBody) {
    process.stderr.write(`${JSON.stringify(error.responseBody, null, 2)}\n`);
  }
  process.exitCode = 1;
});
