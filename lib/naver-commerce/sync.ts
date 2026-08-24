import { createAdminClient } from '@/lib/supabase-admin';
import { syncNaverOrders } from './orders';
import { syncNaverProducts } from './products';
import { syncNaverQnas } from './qnas';
import { syncNaverSettlements } from './settlements';
import type { NaverSyncResult } from './types';

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

async function withRun(type: string, operation: () => Promise<NaverSyncResult>) {
  const admin = createAdminClient();
  const { data: run, error } = await admin.from('naver_sync_runs').insert({ sync_type: type, status: 'running' }).select('id').single();
  if (error) throw error;
  try {
    const result = await operation();
    await admin.from('naver_sync_runs').update({ status: 'success', fetched_count: result.fetched, upserted_count: result.upserted, detail: result.detail || {}, finished_at: new Date().toISOString() }).eq('id', run.id);
    return result;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : '알 수 없는 동기화 오류';
    await admin.from('naver_sync_runs').update({ status: 'failed', error_message: message, finished_at: new Date().toISOString() }).eq('id', run.id);
    throw caught;
  }
}

export async function syncAllNaverCommerce() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86_400_000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86_400_000);
  const results: Record<string, NaverSyncResult> = {};
  results.products = await withRun('products', syncNaverProducts);
  results.orders = await withRun('orders', () => syncNaverOrders());
  results.settlements = await withRun('settlements', () => syncNaverSettlements(dateOnly(sevenDaysAgo), dateOnly(today)));
  results.qnas = await withRun('qnas', () => syncNaverQnas(thirtyDaysAgo.toISOString(), today.toISOString()));
  return results;
}

export async function syncNaverCommerceSection(section: string) {
  const today = new Date();
  if (section === 'products') return withRun(section, syncNaverProducts);
  if (section === 'orders') return withRun(section, () => syncNaverOrders());
  if (section === 'settlements') return withRun(section, () => syncNaverSettlements(dateOnly(new Date(today.getTime() - 31 * 86_400_000)), dateOnly(today)));
  if (section === 'qnas') return withRun(section, () => syncNaverQnas(new Date(today.getTime() - 90 * 86_400_000).toISOString(), today.toISOString()));
  throw new Error('지원하지 않는 동기화 항목입니다.');
}
