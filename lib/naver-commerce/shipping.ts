import { createAdminClient } from '@/lib/supabase-admin';
import { getKstYYYYMMDD } from '@/lib/kst';
import { inquirySlipNo, registerOrder, LOGEN_BOX_TY_CD, LOGEN_CONTRACT_FARE, LOGEN_FARE_TY } from '@/lib/logen';
import { dispatchNaverProductOrders } from './orders';

const COMPANY_NAME = '모두의 유니폼';
const COMPANY_ADDR = '서울특별시 마포구 성지3길 55 3층';
const COMPANY_TEL = '01081400621';

type ProductOrder = {
  product_order_id: string;
  naver_order_id: string;
  product_name: string | null;
  receiver_name: string | null;
  receiver_tel1: string | null;
  receiver_tel2: string | null;
  receiver_zip_code: string | null;
  receiver_base_address: string | null;
  receiver_detail_address: string | null;
  shipping_memo: string | null;
};

function fixTakeNo(orderId: string) {
  return `NV-${orderId}`.slice(0, 40);
}

function record(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function activeSlips(response: unknown) {
  const responseRecord = record(response);
  if (responseRecord.sttsCd === 'FAIL' || !Array.isArray(responseRecord.data)) return [] as string[];
  const item = responseRecord.data.map(record).find((row) => row.resultCd === 'TRUE');
  return Array.isArray(item?.data1)
    ? item.data1.map(record).filter((row) => row.delYn !== 'Y' && row.slipNo).map((row) => String(row.slipNo))
    : [];
}

export async function registerNaverShipment(productOrderIds: string[], boxQty = 1) {
  if (!Number.isInteger(boxQty) || boxQty < 1 || boxQty > 99) throw new Error('박스 수는 1~99 정수여야 합니다.');
  const admin = createAdminClient();
  const { data, error } = await admin.from('naver_product_orders')
    .select('product_order_id,naver_order_id,product_name,receiver_name,receiver_tel1,receiver_tel2,receiver_zip_code,receiver_base_address,receiver_detail_address,shipping_memo')
    .in('product_order_id', productOrderIds);
  if (error) throw error;
  const orders = (data || []) as ProductOrder[];
  if (!orders.length || orders.length !== productOrderIds.length) throw new Error('선택한 네이버 주문을 모두 찾지 못했습니다.');
  const orderIds = [...new Set(orders.map((row) => row.naver_order_id))];
  if (orderIds.length !== 1) throw new Error('로젠 접수는 같은 네이버 주문번호끼리만 가능합니다.');
  const first = orders[0];
  const phone = String(first.receiver_tel1 || first.receiver_tel2 || '').replace(/[^0-9]/g, '');
  const address = [first.receiver_base_address, first.receiver_detail_address].filter(Boolean).join(' ');
  if (!first.receiver_name || !phone || !address) throw new Error('수령인 이름·전화번호·주소가 없어 로젠에 접수할 수 없습니다.');
  const naverOrderId = orderIds[0];
  const fixNo = fixTakeNo(naverOrderId);

  const inquiry = await inquirySlipNo([fixNo]);
  const existingSlips = activeSlips(inquiry);
  if (existingSlips.length) {
    const now = new Date().toISOString();
    const { data: shipment, error: upsertError } = await admin.from('naver_shipments').upsert({
      naver_order_id: naverOrderId,
      fix_take_no: fixNo,
      product_order_ids: productOrderIds,
      box_qty: boxQty,
      status: 'invoiced',
      logen_registered_at: now,
      tracking_number: existingSlips[0],
      extra_tracking_numbers: existingSlips.slice(1),
      raw_logen: inquiry,
      updated_at: now,
    }, { onConflict: 'naver_order_id' }).select().single();
    if (upsertError) throw upsertError;
    await admin.from('naver_product_orders').update({ logen_registered_at: now, tracking_number: existingSlips[0], delivery_company_code: 'KGB', updated_at: now }).in('product_order_id', productOrderIds);
    return { shipment, alreadyRegistered: true };
  }

  const { data: existing } = await admin.from('naver_shipments').select('*').eq('naver_order_id', naverOrderId).maybeSingle();
  if (existing && ['registered', 'invoiced', 'dispatched'].includes(existing.status)) return { shipment: existing, alreadyRegistered: true };
  const now = new Date().toISOString();
  const { error: pendingError } = await admin.from('naver_shipments').upsert({
    naver_order_id: naverOrderId,
    fix_take_no: fixNo,
    product_order_ids: productOrderIds,
    box_qty: boxQty,
    status: 'pending',
    error_message: null,
    updated_at: now,
  }, { onConflict: 'naver_order_id' });
  if (pendingError) throw pendingError;

  const result = await registerOrder([{
    takeDt: getKstYYYYMMDD(),
    fixTakeNo: fixNo,
    sndCustNm: COMPANY_NAME,
    sndCustAddr: COMPANY_ADDR,
    sndTelNo: COMPANY_TEL,
    rcvCustNm: first.receiver_name,
    ...(first.receiver_zip_code ? { rcvZipCd: first.receiver_zip_code.replace(/[^0-9]/g, '').slice(0, 5) } : {}),
    rcvCustAddr: address,
    rcvTelNo: phone,
    rcvCellNo: phone,
    fareTy: LOGEN_FARE_TY,
    boxTyCd: LOGEN_BOX_TY_CD,
    qty: boxQty,
    dlvFare: LOGEN_CONTRACT_FARE * boxQty,
    goodsNm: [...new Set(orders.map((row) => row.product_name).filter(Boolean))].join(', ').slice(0, 100) || '네이버 주문 상품',
    sndMsg: first.shipping_memo || undefined,
  }]);
  const accepted = result.sttsCd !== 'FAIL' && Array.isArray(result.data) && (result.data as unknown[]).map(record).some((row) => row.resultCd === 'TRUE');
  if (!accepted) {
    await admin.from('naver_shipments').update({ status: 'error', error_message: result.sttsMsg || '로젠 접수 거절', raw_logen: result, updated_at: new Date().toISOString() }).eq('naver_order_id', naverOrderId);
    throw new Error(result.sttsMsg || '로젠 접수가 거절되었습니다.');
  }
  const registeredAt = new Date().toISOString();
  const { data: shipment, error: updateError } = await admin.from('naver_shipments').update({
    status: 'registered', logen_registered_at: registeredAt, raw_logen: result, updated_at: registeredAt,
  }).eq('naver_order_id', naverOrderId).select().single();
  if (updateError) throw updateError;
  await admin.from('naver_product_orders').update({ logen_registered_at: registeredAt, delivery_company_code: 'KGB', updated_at: registeredAt }).in('product_order_id', productOrderIds);
  return { shipment, alreadyRegistered: false };
}

export async function syncNaverShipmentSlip(naverOrderId: string) {
  const admin = createAdminClient();
  const { data: shipment, error } = await admin.from('naver_shipments').select('*').eq('naver_order_id', naverOrderId).single();
  if (error) throw error;
  const inquiry = await inquirySlipNo([shipment.fix_take_no]);
  const slips = activeSlips(inquiry);
  if (!slips.length) throw new Error('아직 로젠에서 발번된 송장이 없습니다.');
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin.from('naver_shipments').update({
    status: 'invoiced', tracking_number: slips[0], extra_tracking_numbers: slips.slice(1), raw_logen: inquiry, updated_at: now,
  }).eq('naver_order_id', naverOrderId).select().single();
  if (updateError) throw updateError;
  await admin.from('naver_product_orders').update({ tracking_number: slips[0], delivery_company_code: 'KGB', updated_at: now }).in('product_order_id', shipment.product_order_ids);
  return updated;
}

export async function dispatchNaverShipment(naverOrderId: string) {
  const admin = createAdminClient();
  const { data: shipment, error } = await admin.from('naver_shipments').select('*').eq('naver_order_id', naverOrderId).single();
  if (error) throw error;
  if (!shipment.tracking_number) throw new Error('로젠 송장번호를 먼저 가져와야 합니다.');
  if (shipment.naver_dispatched_at) return { shipment, alreadyDispatched: true };
  const response = await dispatchNaverProductOrders({ productOrderIds: shipment.product_order_ids, trackingNumber: shipment.tracking_number });
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin.from('naver_shipments').update({ status: 'dispatched', naver_dispatched_at: now, updated_at: now }).eq('naver_order_id', naverOrderId).select().single();
  if (updateError) throw updateError;
  await admin.from('naver_product_orders').update({ naver_dispatched_at: now, dispatched_at: now, tracking_number: shipment.tracking_number, delivery_company_code: 'KGB', updated_at: now }).in('product_order_id', shipment.product_order_ids);
  return { shipment: updated, response, alreadyDispatched: false };
}
