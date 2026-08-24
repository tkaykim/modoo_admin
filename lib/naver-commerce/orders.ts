import { createAdminClient } from '@/lib/supabase-admin';
import { naverRequest } from './client';
import type { JsonRecord, NaverDispatchInput, NaverProductOrderRow } from './types';

const asRecord = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const asString = (value: unknown) => value === null || value === undefined || value === '' ? null : String(value);
const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const asNullableNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
const asIso = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function changeRows(payload: JsonRecord): JsonRecord[] {
  const data = payload.data;
  if (Array.isArray(data)) return data.map(asRecord);
  const record = asRecord(data);
  const rows = record.lastChangeStatuses || record.lastChangedStatuses || payload.lastChangeStatuses;
  return Array.isArray(rows) ? rows.map(asRecord) : [];
}

function detailRows(payload: JsonRecord): JsonRecord[] {
  const data = payload.data;
  if (Array.isArray(data)) return data.map(asRecord);
  const record = asRecord(data);
  const rows = record.productOrders || record.contents || payload.productOrders;
  return Array.isArray(rows) ? rows.map(asRecord) : [];
}

function normalizeOrder(
  item: JsonRecord,
  changeById: Map<string, JsonRecord>,
  localProductByOrigin: Map<number, string>,
  localProductByChannel: Map<number, string>,
): NaverProductOrderRow | null {
  const order = asRecord(item.order);
  const productOrder = asRecord(item.productOrder || item);
  const productOrderId = asString(productOrder.productOrderId || item.productOrderId);
  const orderId = asString(order.orderId || productOrder.orderId || item.orderId);
  if (!productOrderId || !orderId) return null;
  const change = changeById.get(productOrderId) || {};
  const address = asRecord(productOrder.shippingAddress || item.shippingAddress);
  const delivery = asRecord(productOrder.delivery || item.delivery);
  const claim = asRecord(item.claim || productOrder.claim);
  const now = new Date().toISOString();
  const originProductNo = asNullableNumber(productOrder.originProductNo || productOrder.originalProductId);
  const channelProductNo = asNullableNumber(productOrder.productId || productOrder.channelProductNo);
  return {
    product_order_id: productOrderId,
    naver_order_id: orderId,
    product_order_status: asString(productOrder.productOrderStatus),
    claim_status: asString(productOrder.claimStatus || claim.claimStatus),
    last_changed_type: asString(change.lastChangedType || change.lastChangeType),
    last_changed_at: asIso(change.lastChangedDate || change.lastChangedAt || productOrder.lastChangedDate),
    order_date: asIso(order.orderDate || productOrder.orderDate),
    payment_date: asIso(order.paymentDate || productOrder.paymentDate),
    origin_product_no: originProductNo,
    channel_product_no: channelProductNo,
    product_name: asString(productOrder.productName),
    option_name: asString(productOrder.productOption || productOrder.optionName),
    option_manage_code: asString(productOrder.optionManageCode),
    local_product_id: (originProductNo ? localProductByOrigin.get(originProductNo) : null)
      || (channelProductNo ? localProductByChannel.get(channelProductNo) : null)
      || null,
    quantity: asNumber(productOrder.quantity),
    unit_price: asNumber(productOrder.unitPrice || productOrder.productPrice),
    total_payment_amount: asNumber(productOrder.totalPaymentAmount || productOrder.totalProductAmount),
    buyer_name: asString(order.ordererName || order.buyerName),
    buyer_tel: asString(order.ordererTel || order.buyerTel),
    receiver_name: asString(address.name || address.receiverName),
    receiver_tel1: asString(address.tel1 || address.receiverTel1),
    receiver_tel2: asString(address.tel2 || address.receiverTel2),
    receiver_zip_code: asString(address.zipCode),
    receiver_base_address: asString(address.baseAddress),
    receiver_detail_address: asString(address.detailedAddress || address.detailAddress),
    shipping_memo: asString(productOrder.shippingMemo || delivery.shippingMemo),
    delivery_method: asString(delivery.deliveryMethod || productOrder.deliveryMethod),
    delivery_company_code: asString(delivery.deliveryCompany || delivery.deliveryCompanyCode),
    tracking_number: asString(delivery.trackingNumber),
    dispatched_at: asIso(delivery.sendDate || delivery.dispatchDate),
    raw_data: item,
    synced_at: now,
    updated_at: now,
  };
}

export async function getLastChangedProductOrderIds(from: Date, to: Date) {
  const changes: JsonRecord[] = [];
  let lastChangedFrom = from.toISOString();
  let moreSequence: string | number | undefined;
  for (let page = 0; page < 100; page += 1) {
    const payload = await naverRequest<JsonRecord>('/v1/pay-order/seller/product-orders/last-changed-statuses', {
      query: { lastChangedFrom, lastChangedTo: to.toISOString(), moreSequence, limitCount: 300 },
    });
    changes.push(...changeRows(payload));
    const more = asRecord(asRecord(payload.data).more || payload.more);
    if (!more.moreFrom || more.moreSequence === undefined || more.moreSequence === null) break;
    lastChangedFrom = String(more.moreFrom);
    moreSequence = String(more.moreSequence);
  }
  return { changes, productOrderIds: [...new Set(changes.map((row) => asString(row.productOrderId)).filter(Boolean) as string[])] };
}

export async function queryProductOrders(productOrderIds: string[]) {
  if (productOrderIds.length === 0) return [];
  const payload = await naverRequest<JsonRecord>('/v1/pay-order/seller/product-orders/query', {
    method: 'POST',
    body: { productOrderIds, quantityClaimCompatibility: true },
  });
  return detailRows(payload);
}

export async function syncNaverOrders(options: { from?: Date; to?: Date } = {}) {
  const admin = createAdminClient();
  const { data: mappings, error: mappingError } = await admin.from('naver_product_mappings')
    .select('local_product_id,origin_product_no,channel_product_no')
    .not('local_product_id', 'is', null);
  if (mappingError) throw mappingError;
  const localProductByOrigin = new Map<number, string>();
  const localProductByChannel = new Map<number, string>();
  for (const mapping of mappings || []) {
    if (mapping.local_product_id && mapping.origin_product_no) localProductByOrigin.set(Number(mapping.origin_product_no), mapping.local_product_id);
    if (mapping.local_product_id && mapping.channel_product_no) localProductByChannel.set(Number(mapping.channel_product_no), mapping.local_product_id);
  }
  const to = options.to || new Date();
  let syncFrom: Date;
  if (options.from) {
    syncFrom = options.from;
  } else {
    const { data: cursor } = await admin.from('naver_sync_cursors').select('cursor_value').eq('cursor_key', 'orders_last_changed_to').maybeSingle();
    const cursorDate = cursor?.cursor_value ? new Date(cursor.cursor_value) : null;
    syncFrom = cursorDate && !Number.isNaN(cursorDate.getTime()) && cursorDate < to
      ? cursorDate
      : new Date(to.getTime() - 23 * 60 * 60 * 1000);
  }
  const initialFrom = syncFrom;
  let fetched = 0;
  let upserted = 0;
  while (syncFrom < to) {
    const windowTo: Date = new Date(Math.min(syncFrom.getTime() + 23 * 60 * 60 * 1000, to.getTime()));
    const { changes, productOrderIds } = await getLastChangedProductOrderIds(syncFrom, windowTo);
    const changeById = new Map(changes.map((change) => [String(change.productOrderId), change]));
    const rows: NaverProductOrderRow[] = [];
    for (let index = 0; index < productOrderIds.length; index += 300) {
      const details = await queryProductOrders(productOrderIds.slice(index, index + 300));
      rows.push(...details.map((detail) => normalizeOrder(
        detail,
        changeById,
        localProductByOrigin,
        localProductByChannel,
      )).filter(Boolean) as NaverProductOrderRow[]);
    }
    if (rows.length) {
      const { error } = await admin.from('naver_product_orders').upsert(rows, { onConflict: 'product_order_id' });
      if (error) throw error;
    }
    fetched += productOrderIds.length;
    upserted += rows.length;
    await admin.from('naver_sync_cursors').upsert({ cursor_key: 'orders_last_changed_to', cursor_value: windowTo.toISOString(), updated_at: new Date().toISOString() });
    syncFrom = windowTo;
  }
  return { fetched, upserted, detail: { from: initialFrom.toISOString(), to: to.toISOString() } };
}

export async function confirmNaverProductOrders(productOrderIds: string[]) {
  return naverRequest<JsonRecord>('/v1/pay-order/seller/product-orders/confirm', { method: 'POST', body: { productOrderIds } });
}

export async function dispatchNaverProductOrders(input: NaverDispatchInput) {
  const dispatchDate = input.dispatchDate || new Date().toISOString();
  return naverRequest<JsonRecord>('/v1/pay-order/seller/product-orders/dispatch', {
    method: 'POST',
    body: {
      dispatchProductOrders: input.productOrderIds.map((productOrderId) => ({
        productOrderId,
        deliveryMethod: 'DELIVERY',
        deliveryCompanyCode: 'KGB',
        trackingNumber: input.trackingNumber,
        dispatchDate,
      })),
    },
  });
}
