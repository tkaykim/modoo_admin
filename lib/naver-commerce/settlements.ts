import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase-admin';
import { naverRequest } from './client';
import type { JsonRecord } from './types';

const asRecord = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const amount = (record: JsonRecord, keys: string[]) => {
  for (const key of keys) if (Number.isFinite(Number(record[key]))) return Number(record[key]);
  return 0;
};

function rowsFrom(payload: JsonRecord): JsonRecord[] {
  const data = payload.data;
  if (Array.isArray(data)) return data.map(asRecord);
  const record = asRecord(data);
  for (const key of ['content', 'contents', 'dailySettlements', 'settlements']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).map(asRecord);
  }
  return [];
}

export async function syncNaverSettlements(startDate: string, endDate: string) {
  const admin = createAdminClient();
  let pageNumber = 1;
  let fetched = 0;
  let upserted = 0;
  for (;;) {
    const payload = await naverRequest<JsonRecord>('/v1/pay-settle/settle/daily', {
      query: { startDate, endDate, pageNumber, pageSize: 100 },
    });
    const items = rowsFrom(payload);
    if (!items.length) break;
    const now = new Date().toISOString();
    const rows = items.map((item) => {
      const serialized = JSON.stringify(item);
      const settlementDate = String(item.settleDate || item.settlementDate || item.baseDate || '').slice(0, 10) || null;
      return {
        settlement_key: crypto.createHash('sha256').update(serialized).digest('hex'),
        settlement_date: settlementDate,
        settlement_type: String(item.settleType || item.settlementType || ''),
        merchant_name: String(item.merchantName || item.storeName || ''),
        payment_method: String(item.payMeans || item.paymentMethod || ''),
        sale_amount: amount(item, ['saleAmount', 'payAmount', 'productOrderAmount']),
        settlement_amount: amount(item, ['settleAmount', 'settlementAmount', 'totalSettleAmount']),
        commission_amount: amount(item, ['commissionAmount', 'totalCommissionAmount', 'salesCommissionAmount']),
        raw_data: item,
        synced_at: now,
        updated_at: now,
      };
    });
    const { error } = await admin.from('naver_settlement_daily').upsert(rows, { onConflict: 'settlement_key' });
    if (error) throw error;
    fetched += items.length;
    upserted += rows.length;
    if (items.length < 100) break;
    pageNumber += 1;
  }
  return { fetched, upserted, detail: { startDate, endDate } };
}
