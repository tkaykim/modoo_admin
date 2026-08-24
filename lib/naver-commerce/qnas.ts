import { createAdminClient } from '@/lib/supabase-admin';
import { naverRequest } from './client';
import type { JsonRecord } from './types';

const asRecord = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

function rowsFrom(payload: JsonRecord): JsonRecord[] {
  for (const key of ['content', 'contents', 'qnas']) if (Array.isArray(payload[key])) return (payload[key] as unknown[]).map(asRecord);
  const data = payload.data;
  if (Array.isArray(data)) return data.map(asRecord);
  const record = asRecord(data);
  for (const key of ['content', 'contents', 'qnas']) if (Array.isArray(record[key])) return (record[key] as unknown[]).map(asRecord);
  return [];
}

export async function syncNaverQnas(fromDate: string, toDate: string) {
  const admin = createAdminClient();
  let page = 1;
  let fetched = 0;
  let upserted = 0;
  for (;;) {
    const payload = await naverRequest<JsonRecord>('/v1/contents/qnas', { query: { fromDate, toDate, page, size: 100 } });
    const items = rowsFrom(payload);
    if (!items.length) break;
    const now = new Date().toISOString();
    const rows = items.map((item) => ({
      question_id: Number(item.questionId || item.id),
      product_id: Number(item.productId || item.channelProductNo) || null,
      product_name: String(item.productName || ''),
      question: String(item.question || item.questionContent || item.content || ''),
      answer: item.answer || item.answerContent ? String(item.answer || item.answerContent) : null,
      answered: Boolean(item.answered || item.answer || item.answerContent),
      writer_id_masked: String(item.writerId || item.maskedWriterId || ''),
      question_created_at: item.createDate || item.questionDate ? new Date(String(item.createDate || item.questionDate)).toISOString() : null,
      raw_data: item,
      synced_at: now,
      updated_at: now,
    })).filter((row) => Number.isFinite(row.question_id));
    if (rows.length) {
      const { error } = await admin.from('naver_qnas').upsert(rows, { onConflict: 'question_id' });
      if (error) throw error;
      upserted += rows.length;
    }
    fetched += items.length;
    if (items.length < 100) break;
    page += 1;
  }
  return { fetched, upserted, detail: { fromDate, toDate } };
}

export async function answerNaverQna(questionId: number, answer: string) {
  const response = await naverRequest<JsonRecord>(`/v1/contents/qnas/${questionId}`, { method: 'PUT', body: { commentContent: answer } });
  const admin = createAdminClient();
  const { error } = await admin.from('naver_qnas').update({ answer, answered: true, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('question_id', questionId);
  if (error) throw error;
  return response;
}
