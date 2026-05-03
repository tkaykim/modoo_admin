import type { SupabaseClient } from '@supabase/supabase-js';

export const COMPANY_SEAL_BUCKET = 'admin-seal';
export const COMPANY_SEAL_STORAGE_PATH = 'company_seal.png';
export const COMPANY_SEAL_EMAIL_CID = 'company-seal@invoice.modoo';
export const COMPANY_SEAL_MAX_BYTES = 2 * 1024 * 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPngBuffer(buf: ArrayBuffer | Buffer): boolean {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.length >= 8 && b.subarray(0, 8).equals(PNG_MAGIC);
}

/** 버킷에서 도장 PNG를 직접 다운로드. DB 조회 없음. */
export async function fetchCompanySealBuffer(
  adminClient: SupabaseClient,
): Promise<Buffer | null> {
  try {
    const { data, error } = await adminClient.storage
      .from(COMPANY_SEAL_BUCKET)
      .download(COMPANY_SEAL_STORAGE_PATH);

    if (error || !data) return null;

    const buf = Buffer.from(await data.arrayBuffer());
    if (!isPngBuffer(buf)) return null;

    return buf;
  } catch {
    return null;
  }
}

/** 버킷에 도장이 존재하는지 확인 (list 1건) */
export async function companySealExists(
  adminClient: SupabaseClient,
): Promise<boolean> {
  const { data } = await adminClient.storage
    .from(COMPANY_SEAL_BUCKET)
    .list('', { limit: 1, search: 'company_seal.png' });
  return Array.isArray(data) && data.length > 0;
}
