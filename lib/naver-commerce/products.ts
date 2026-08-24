import { createAdminClient } from '@/lib/supabase-admin';
import { naverRequest, uploadNaverImages } from './client';
import { buildNaverCombinationOptions, type LocalProductColor, type LocalProductSize } from './product-options';
import type { JsonRecord, NaverProductCreateInput, NaverProductUpdateInput } from './types';

const asRecord = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
const asArray = (value: unknown) => Array.isArray(value) ? value : [];
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character));

export async function searchNaverProducts(page = 1, pageSize = 100) {
  return naverRequest<JsonRecord>('/v1/products/search', {
    method: 'POST',
    body: { page, size: pageSize, orderType: 'REG_DATE', periodType: 'PROD_REG_DAY' },
  });
}

export async function getNaverProduct(originProductNo: number) {
  return naverRequest<JsonRecord>(`/v2/products/origin-products/${originProductNo}`);
}

function productItems(payload: JsonRecord): JsonRecord[] {
  const contents = payload.contents || asRecord(payload.data).contents || asRecord(payload.data).content;
  return Array.isArray(contents) ? contents.map(asRecord) : [];
}

function mappingRow(item: JsonRecord) {
  const channelProducts = Array.isArray(item.channelProducts) ? item.channelProducts.map(asRecord) : [];
  const firstChannel = channelProducts[0] || asRecord(item.smartstoreChannelProduct);
  return {
    origin_product_no: asNumber(item.originProductNo)!,
    channel_product_no: asNumber(firstChannel.channelProductNo || item.channelProductNo),
    naver_product_name: String(firstChannel.name || item.name || item.productName || '이름 없음'),
    status_type: String(firstChannel.statusType || firstChannel.channelProductDisplayStatusType || item.statusType || ''),
    sale_price: asNumber(firstChannel.salePrice || item.salePrice),
    stock_quantity: asNumber(firstChannel.stockQuantity || item.stockQuantity),
    raw_summary: item,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function syncNaverProducts() {
  const admin = createAdminClient();
  let page = 1;
  let fetched = 0;
  let upserted = 0;
  for (;;) {
    const payload = await searchNaverProducts(page, 100);
    const items = productItems(payload);
    if (items.length === 0) break;
    const rows = items.map(mappingRow).filter((row) => row.origin_product_no);
    fetched += items.length;
    if (rows.length) {
      const { error } = await admin.from('naver_product_mappings').upsert(rows, { onConflict: 'origin_product_no' });
      if (error) throw error;
      upserted += rows.length;
    }
    if (items.length < 100) break;
    page += 1;
  }
  return { fetched, upserted };
}

function stripReadOnlyProductFields(payload: JsonRecord) {
  const copy = structuredClone(payload);
  for (const key of ['originProductNo', 'channelProductNo', 'createDate', 'modifiedDate']) delete copy[key];
  const origin = asRecord(copy.originProduct);
  for (const key of ['originProductNo', 'createDate', 'modifiedDate']) delete origin[key];
  const channel = asRecord(copy.smartstoreChannelProduct);
  for (const key of ['channelProductNo', 'createDate', 'modifiedDate']) delete channel[key];
  return { originProduct: origin, smartstoreChannelProduct: channel };
}

function applyEditableFields(
  body: { originProduct: JsonRecord; smartstoreChannelProduct: JsonRecord },
  values: {
    name?: string;
    salePrice?: number;
    stockQuantity?: number;
    detailHtml?: string;
    uploadedImages?: string[];
    suspended?: boolean;
    optionInfo?: JsonRecord;
    sellerManagementCode?: string;
  },
) {
  const origin = body.originProduct;
  if (values.name) {
    origin.name = values.name;
    body.smartstoreChannelProduct.channelProductName = values.name;
  }
  if (values.salePrice !== undefined) origin.salePrice = values.salePrice;
  if (values.stockQuantity !== undefined) origin.stockQuantity = values.stockQuantity;
  if (values.detailHtml) origin.detailContent = values.detailHtml;
  const detailAttribute = asRecord(origin.detailAttribute);
  if (values.optionInfo) detailAttribute.optionInfo = values.optionInfo;
  if (values.sellerManagementCode) {
    detailAttribute.sellerCodeInfo = {
      ...asRecord(detailAttribute.sellerCodeInfo),
      sellerManagementCode: values.sellerManagementCode,
    };
  }
  origin.detailAttribute = detailAttribute;
  origin.deliveryInfo = {
    ...asRecord(origin.deliveryInfo),
    customProductAfterOrderYn: true,
    expectedDeliveryPeriodType: 'FOURTEEN',
  };
  if (values.suspended) {
    origin.statusType = 'SUSPENSION';
    body.smartstoreChannelProduct.channelProductDisplayStatusType = 'SUSPENSION';
    body.smartstoreChannelProduct.naverShoppingRegistration = false;
  }
  if (values.uploadedImages?.length) {
    origin.images = {
      representativeImage: { url: values.uploadedImages[0] },
      optionalImages: values.uploadedImages.slice(1).map((url) => ({ url })),
    };
  }
  return body;
}

function localSizes(value: unknown): LocalProductSize[] {
  return asArray(value).map((item) => {
    const row = asRecord(item);
    const label = String(row.label || row.name || row.size_code || '').trim();
    const code = String(row.size_code || row.code || label).trim();
    return { label, code };
  }).filter((item) => item.label && item.code);
}

async function localColors(localProductId: string): Promise<LocalProductColor[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('product_colors')
    .select('sort_order,manufacturer_colors(name,color_code,label,is_active,sort_order)')
    .eq('product_id', localProductId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).flatMap((row) => {
    const raw = (row as { manufacturer_colors?: unknown }).manufacturer_colors;
    const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return entries.map(asRecord).filter((color) => color.is_active !== false).map((color) => ({
      name: String(color.label || color.name || color.color_code || '').trim(),
      code: String(color.color_code || color.name || '').trim(),
    }));
  }).filter((color) => color.name && color.code);
}

function defaultDetailHtml(input: {
  name: string;
  productCode: string;
  detailImages: string[];
  colorCount?: number;
  sizeCount?: number;
}) {
  const name = escapeHtml(input.name);
  const optionSummary = input.colorCount && input.sizeCount
    ? `<p style="margin:8px 0;color:#444">색상 ${input.colorCount}종 · 사이즈 ${input.sizeCount}종 · 인쇄 크기 3단계 중 선택</p>`
    : '';
  const images = input.detailImages.map((url) => `<img src="${escapeHtml(url)}" alt="${name} 상품 정보" style="display:block;max-width:100%;height:auto;margin:0 auto" />`).join('');
  return `<div style="max-width:860px;margin:0 auto;text-align:center;font-family:Arial,sans-serif;line-height:1.7;color:#222">
    <section style="padding:28px 18px;background:#f7f7f7">
      <h2 style="margin:0 0 10px;font-size:24px">${name}</h2>
      <p style="margin:0;color:#666">상품 코드 ${escapeHtml(input.productCode)}</p>
      ${optionSummary}
    </section>
    <section style="padding:28px 18px;text-align:left">
      <h3 style="margin:0 0 12px">주문 방법</h3>
      <ol style="margin:0;padding-left:22px">
        <li>색상과 사이즈를 선택해 주세요.</li>
        <li>예상 인쇄 크기를 소형, 중형, 대형 중에서 선택해 주세요.</li>
        <li>결제 확인 후 디자인 업로드 방법을 별도로 안내드립니다.</li>
        <li>완성 디자인이 선택 범위를 넘으면 제작 전에 축소 또는 주문 변경을 안내드립니다.</li>
      </ol>
      <p style="margin:18px 0 0;padding:14px;background:#fff4df;color:#6b4700">주문제작 상품은 디자인 확인과 시안 확정 후 제작이 시작됩니다.</p>
    </section>
    ${images}
  </div>`;
}

async function saveCreatedMapping(localProductId: string, response: JsonRecord, name: string, price: number, stock: number) {
  const originProductNo = asNumber(response.originProductNo || asRecord(response.originProduct).originProductNo);
  if (!originProductNo) throw new Error('네이버 응답에서 원상품 번호를 확인하지 못했습니다.');
  const channelProductNo = asNumber(response.channelProductNo || asRecord(response.smartstoreChannelProduct).channelProductNo);
  const admin = createAdminClient();
  const { error } = await admin.from('naver_product_mappings').upsert({
    local_product_id: localProductId,
    origin_product_no: originProductNo,
    channel_product_no: channelProductNo,
    naver_product_name: name,
    sale_price: price,
    stock_quantity: stock,
    raw_summary: response,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'origin_product_no' });
  if (error) throw error;
  return { originProductNo, channelProductNo };
}

export async function createNaverProductFromLocal(input: NaverProductCreateInput) {
  if (input.salePrice !== undefined && (!Number.isSafeInteger(input.salePrice) || input.salePrice < 0)) throw new Error('판매가는 0 이상의 정수여야 합니다.');
  if (input.stockQuantity !== undefined && (!Number.isSafeInteger(input.stockQuantity) || input.stockQuantity < 0)) throw new Error('재고는 0 이상의 정수여야 합니다.');
  const admin = createAdminClient();
  const { data: local, error } = await admin.from('products')
    .select('id,title,base_price,thumbnail_image_link,description_image,sizing_chart_image,keywords,product_code,size_options')
    .eq('id', input.localProductId).single();
  if (error || !local) throw error || new Error('자체몰 상품을 찾지 못했습니다.');
  const template = await getNaverProduct(input.templateOriginProductNo);
  const body = stripReadOnlyProductFields(template);
  const thumbnailUrls = input.thumbnailImageUrls?.length
    ? input.thumbnailImageUrls
    : input.imageUrls?.length
      ? input.imageUrls
      : (local.thumbnail_image_link || []).filter(Boolean);
  const descriptionUrls = input.detailImageUrls?.length
    ? input.detailImageUrls
    : input.imageUrls?.length
      ? []
      : [
        ...(local.description_image || []).filter(Boolean),
        ...(local.sizing_chart_image ? [local.sizing_chart_image] : []),
      ];
  if (!thumbnailUrls.length && !descriptionUrls.length) throw new Error('네이버에 등록할 자체몰 상품 이미지가 없습니다.');
  let uploadedThumbnails = thumbnailUrls.length ? await uploadNaverImages(thumbnailUrls.slice(0, 10)) : [];
  const uploadedDescriptions = descriptionUrls.length ? await uploadNaverImages(descriptionUrls.slice(0, 10)) : [];
  if (!uploadedThumbnails.length && uploadedDescriptions.length) uploadedThumbnails = [uploadedDescriptions[0]];
  if (!uploadedThumbnails.length) throw new Error('네이버 대표 이미지를 업로드하지 못했습니다.');
  const name = input.name?.trim() || local.title;
  const salePrice = input.salePrice ?? local.base_price;
  const stockQuantity = input.stockQuantity ?? 999;
  let optionResult: ReturnType<typeof buildNaverCombinationOptions> | undefined;
  if (input.optionConfig) {
    optionResult = buildNaverCombinationOptions({
      productCode: local.product_code || input.localProductId,
      colors: await localColors(input.localProductId),
      sizes: localSizes(local.size_options),
      config: input.optionConfig,
    });
  }
  const detailHtml = input.detailHtml || defaultDetailHtml({
    name,
    productCode: local.product_code || input.localProductId,
    detailImages: uploadedDescriptions,
    colorCount: optionResult?.colors.length,
    sizeCount: optionResult?.sizes.length,
  });
  applyEditableFields(body, {
    name,
    salePrice,
    stockQuantity,
    detailHtml,
    uploadedImages: uploadedThumbnails,
    suspended: input.suspended,
    optionInfo: optionResult?.optionInfo,
    sellerManagementCode: local.product_code || undefined,
  });
  const response = await naverRequest<JsonRecord>('/v2/products', { method: 'POST', body });
  const mapping = await saveCreatedMapping(input.localProductId, response, name, salePrice, stockQuantity);
  // 네이버는 신규 등록 요청의 SUSPENSION을 SALE로 보정할 수 있다.
  // 테스트·임시 상품은 생성 직후 원상품 수정까지 완료해야 상세 URL 주문도 막힌다.
  if (input.suspended) await updateNaverProduct({ originProductNo: mapping.originProductNo, suspended: true });
  return { response, mapping, optionSummary: optionResult ? {
    colors: optionResult.colors.map((color) => color.name),
    sizes: optionResult.sizes.map((size) => size.label),
    combinations: optionResult.combinationCount,
  } : null };
}

export async function updateNaverProduct(input: NaverProductUpdateInput) {
  if (input.salePrice !== undefined && (!Number.isSafeInteger(input.salePrice) || input.salePrice < 0)) throw new Error('판매가는 0 이상의 정수여야 합니다.');
  if (input.stockQuantity !== undefined && (!Number.isSafeInteger(input.stockQuantity) || input.stockQuantity < 0)) throw new Error('재고는 0 이상의 정수여야 합니다.');
  const current = await getNaverProduct(input.originProductNo);
  const body = stripReadOnlyProductFields(current);
  const uploadedImages = input.imageUrls?.length ? await uploadNaverImages(input.imageUrls.slice(0, 10)) : undefined;
  applyEditableFields(body, { ...input, uploadedImages });
  const response = await naverRequest<JsonRecord>(`/v2/products/origin-products/${input.originProductNo}`, { method: 'PUT', body });
  await syncNaverProducts();
  return response;
}
