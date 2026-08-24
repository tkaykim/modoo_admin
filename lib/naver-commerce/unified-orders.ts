import type { NaverProductOrderRow } from './types';

export const NAVER_UNIFIED_ORDER_SOURCE = 'naver_smartstore' as const;
export const NAVER_UNIFIED_ORDER_PREFIX = 'NAVER-';

export type NaverProductOrderProjectionRow = Omit<NaverProductOrderRow, 'raw_data'>;

export type NaverUnifiedOrderItem = {
  id: string;
  product_title: string | null;
  design_title: string | null;
  quantity: number;
  price_per_item: number;
  purchase_order_status: null;
  assigned_manufacturer_id: null;
  factory_assigned_at: null;
  factory_status: null;
  factory_amount: null;
  deadline: null;
};

export type NaverUnifiedOrder = {
  id: string;
  user_id: null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_same_as_orderer: boolean;
  order_category: 'regular';
  parent_order_id: null;
  inquiry_id: null;
  shipping_method: 'domestic' | 'pickup';
  country_code: 'KR';
  state: null;
  city: null;
  postal_code: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  delivery_fee: 0;
  payment_method: 'admin';
  payment_key: null;
  payment_status: 'pending' | 'completed' | 'failed' | 'refunded';
  order_status: 'payment_pending' | 'payment_completed' | 'shipping' | 'delivered' | 'cancelled' | 'partially_cancelled';
  total_amount: number;
  original_amount: null;
  custom_unit_price: null;
  admin_discount: 0;
  admin_surcharge: 0;
  coupon_discount: 0;
  applied_coupon_id: null;
  pricing_note: null;
  payment_link_token: null;
  refund_reason: null;
  customer_note: string | null;
  attachment_urls: [];
  tracking_number: string | null;
  tracking_carrier: string | null;
  logen_registered_at: null;
  logen_slip_printed: false;
  share_token: null;
  partner_mall_id: null;
  partner_mall: null;
  salesman_id: null;
  attributed_salesman: null;
  order_items: NaverUnifiedOrderItem[];
  created_at: string;
  paid_at: string | null;
  updated_at: string;
  order_source: typeof NAVER_UNIFIED_ORDER_SOURCE;
  external_order_id: string;
  naver_management_href: string;
  naver_status_label: string;
  naver_product_summary: string;
  naver_option_summary: string;
};

const PRODUCT_STATUS_LABELS: Record<string, string> = {
  PAYMENT_WAITING: '결제 대기',
  PAYED: '결제 완료',
  DELIVERING: '배송 중',
  DELIVERED: '배송 완료',
  PURCHASE_DECIDED: '구매 확정',
  EXCHANGED: '교환 완료',
  CANCELED: '취소 완료',
  RETURNED: '반품 완료',
  CANCELED_BY_NOPAYMENT: '미결제 취소',
};

const CLAIM_STATUS_LABELS: Record<string, string> = {
  CANCEL_REQUEST: '취소 요청',
  CANCELING: '취소 처리 중',
  CANCEL_DONE: '취소 완료',
  CANCEL_REJECT: '취소 거부',
  RETURN_REQUEST: '반품 요청',
  COLLECTING: '수거 중',
  COLLECT_DONE: '수거 완료',
  RETURN_DONE: '반품 완료',
  RETURN_REJECT: '반품 거부',
  EXCHANGE_REQUEST: '교환 요청',
  EXCHANGE_REDELIVERING: '교환 재배송 중',
  EXCHANGE_DONE: '교환 완료',
  EXCHANGE_REJECT: '교환 거부',
};

const CANCELLED_PRODUCT_STATUSES = new Set(['CANCELED', 'RETURNED', 'CANCELED_BY_NOPAYMENT']);
const DELIVERED_PRODUCT_STATUSES = new Set(['DELIVERED', 'PURCHASE_DECIDED', 'EXCHANGED']);
const TERMINAL_REFUND_CLAIM_STATUSES = new Set(['CANCEL_DONE', 'RETURN_DONE']);

const validDateValue = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

function firstDate(rows: NaverProductOrderProjectionRow[], keys: Array<keyof NaverProductOrderProjectionRow>): string | null {
  const candidates = rows.flatMap((row) => keys.map((key) => row[key]))
    .filter((value): value is string => typeof value === 'string' && validDateValue(value) !== null)
    .sort((a, b) => (validDateValue(a) ?? 0) - (validDateValue(b) ?? 0));
  return candidates[0] ?? null;
}

function lastDate(rows: NaverProductOrderProjectionRow[], keys: Array<keyof NaverProductOrderProjectionRow>): string | null {
  const candidates = rows.flatMap((row) => keys.map((key) => row[key]))
    .filter((value): value is string => typeof value === 'string' && validDateValue(value) !== null)
    .sort((a, b) => (validDateValue(b) ?? 0) - (validDateValue(a) ?? 0));
  return candidates[0] ?? null;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function aggregateStatus(rows: NaverProductOrderProjectionRow[]) {
  const productStatuses = uniqueNonEmpty(rows.map((row) => row.product_order_status));
  const claimStatuses = uniqueNonEmpty(rows.map((row) => row.claim_status));
  const allCancelled = productStatuses.length > 0 && productStatuses.every((status) => CANCELLED_PRODUCT_STATUSES.has(status));
  const partlyCancelled = !allCancelled && productStatuses.some((status) => CANCELLED_PRODUCT_STATUSES.has(status));
  const allDelivered = productStatuses.length > 0 && productStatuses.every((status) => DELIVERED_PRODUCT_STATUSES.has(status));
  const hasTerminalRefundClaim = claimStatuses.some((status) => TERMINAL_REFUND_CLAIM_STATUSES.has(status));
  const hasPaid = rows.some((row) => Boolean(row.payment_date)) || productStatuses.some((status) => status !== 'PAYMENT_WAITING' && status !== 'CANCELED_BY_NOPAYMENT');

  let orderStatus: NaverUnifiedOrder['order_status'] = 'payment_pending';
  if (allCancelled) orderStatus = 'cancelled';
  else if (partlyCancelled) orderStatus = 'partially_cancelled';
  else if (productStatuses.includes('DELIVERING')) orderStatus = 'shipping';
  else if (allDelivered) orderStatus = 'delivered';
  else if (hasPaid) orderStatus = 'payment_completed';

  let paymentStatus: NaverUnifiedOrder['payment_status'] = hasPaid ? 'completed' : 'pending';
  if (allCancelled && rows.some((row) => row.product_order_status === 'CANCELED_BY_NOPAYMENT') && !rows.some((row) => row.payment_date)) {
    paymentStatus = 'failed';
  } else if (allCancelled || hasTerminalRefundClaim) {
    paymentStatus = 'refunded';
  }

  const claimLabel = claimStatuses.map((status) => CLAIM_STATUS_LABELS[status] ?? status).join(', ');
  const productLabel = productStatuses.map((status) => PRODUCT_STATUS_LABELS[status] ?? status).join(', ');

  return {
    orderStatus,
    paymentStatus,
    label: claimLabel || productLabel || '상태 확인 필요',
  };
}

export function isNaverUnifiedOrder(value: { order_source?: string | null }): boolean {
  return value.order_source === NAVER_UNIFIED_ORDER_SOURCE;
}

export function projectNaverOrdersForAdmin(rows: NaverProductOrderProjectionRow[]): NaverUnifiedOrder[] {
  const groups = new Map<string, NaverProductOrderProjectionRow[]>();
  rows.forEach((row) => {
    if (!row.naver_order_id) return;
    const group = groups.get(row.naver_order_id) ?? [];
    group.push(row);
    groups.set(row.naver_order_id, group);
  });

  return [...groups.entries()].map<NaverUnifiedOrder>(([naverOrderId, group]) => {
    const first = group[0];
    const status = aggregateStatus(group);
    const createdAt = firstDate(group, ['order_date', 'payment_date', 'last_changed_at', 'synced_at', 'updated_at']) ?? new Date(0).toISOString();
    const paidAt = firstDate(group, ['payment_date']);
    const updatedAt = lastDate(group, ['last_changed_at', 'updated_at', 'synced_at']) ?? createdAt;
    const productNames = uniqueNonEmpty(group.map((row) => row.product_name));
    const optionNames = uniqueNonEmpty(group.map((row) => row.option_name));
    const receiverPhone = first.receiver_tel1 || first.receiver_tel2 || null;
    const visitReceipt = group.every((row) => row.delivery_method === 'VISIT_RECEIPT');

    return {
      id: `${NAVER_UNIFIED_ORDER_PREFIX}${naverOrderId}`,
      user_id: null,
      customer_name: first.buyer_name || first.receiver_name || '네이버 구매자',
      customer_email: '',
      customer_phone: first.buyer_tel,
      recipient_name: first.receiver_name,
      recipient_phone: receiverPhone,
      recipient_same_as_orderer: Boolean(first.buyer_tel && receiverPhone && first.buyer_tel === receiverPhone),
      order_category: 'regular',
      parent_order_id: null,
      inquiry_id: null,
      shipping_method: visitReceipt ? 'pickup' : 'domestic',
      country_code: 'KR',
      state: null,
      city: null,
      postal_code: first.receiver_zip_code,
      address_line_1: first.receiver_base_address,
      address_line_2: first.receiver_detail_address,
      delivery_fee: 0,
      payment_method: 'admin',
      payment_key: null,
      payment_status: status.paymentStatus,
      order_status: status.orderStatus,
      total_amount: group.reduce((sum, row) => sum + Math.max(0, Number(row.total_payment_amount) || 0), 0),
      original_amount: null,
      custom_unit_price: null,
      admin_discount: 0,
      admin_surcharge: 0,
      coupon_discount: 0,
      applied_coupon_id: null,
      pricing_note: null,
      payment_link_token: null,
      refund_reason: null,
      customer_note: first.shipping_memo,
      attachment_urls: [],
      tracking_number: group.find((row) => row.tracking_number)?.tracking_number ?? null,
      tracking_carrier: group.find((row) => row.delivery_company_code)?.delivery_company_code ?? null,
      logen_registered_at: null,
      logen_slip_printed: false,
      share_token: null,
      partner_mall_id: null,
      partner_mall: null,
      salesman_id: null,
      attributed_salesman: null,
      order_items: group.map((row) => ({
        id: row.product_order_id,
        product_title: row.product_name,
        design_title: row.product_name,
        quantity: Math.max(0, Number(row.quantity) || 0),
        price_per_item: Math.max(0, Number(row.unit_price) || 0),
        purchase_order_status: null,
        assigned_manufacturer_id: null,
        factory_assigned_at: null,
        factory_status: null,
        factory_amount: null,
        deadline: null,
      })),
      created_at: createdAt,
      paid_at: paidAt,
      updated_at: updatedAt,
      order_source: NAVER_UNIFIED_ORDER_SOURCE,
      external_order_id: naverOrderId,
      naver_management_href: `/naver-commerce?orderId=${encodeURIComponent(naverOrderId)}`,
      naver_status_label: status.label,
      naver_product_summary: productNames.join(', ') || '네이버 상품',
      naver_option_summary: optionNames.join(', '),
    };
  }).sort((a, b) => (validDateValue(b.paid_at || b.created_at) ?? 0) - (validDateValue(a.paid_at || a.created_at) ?? 0));
}
