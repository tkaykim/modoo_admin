import type { createAdminClient } from '@/lib/supabase-admin';

export interface ResolvedColor {
  color_name?: string;
  color_code?: string;
  color_hex?: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * 제품의 등록 색상(product_colors → manufacturer_colors)에서 hex로 색상명/코드를 조회한다.
 *
 * 관리자 주문생성/품목추가/품목수정 시 variant 에는 color_hex(헥스값)만 저장되어
 * 발주서(PurchaseOrdersTab)에 색상명이 비어 보이는 문제가 있었다.
 * 이 헬퍼로 hex → color_name·color_code 를 채워 고객앱 주문과 동일한 형태로 맞춘다.
 *
 * hex 비교는 대소문자 무시(#FFFFFF vs #ffffff).
 */
export async function resolveColorByHex(
  adminClient: AdminClient,
  productId: string | null | undefined,
  hex: string | null | undefined
): Promise<ResolvedColor | null> {
  if (!hex || !productId) return null;
  const target = hex.trim().toLowerCase();
  if (!target) return null;

  const { data, error } = await adminClient
    .from('product_colors')
    .select('manufacturer_colors(name, hex, color_code)')
    .eq('product_id', productId)
    .eq('is_active', true);

  if (error || !data) return null;

  for (const row of data) {
    const mcRaw = (row as { manufacturer_colors: unknown }).manufacturer_colors;
    // 관계 결과는 객체 또는 배열로 올 수 있어 둘 다 처리.
    const candidates = Array.isArray(mcRaw) ? mcRaw : mcRaw ? [mcRaw] : [];
    for (const mc of candidates as Array<{ name?: string; hex?: string; color_code?: string }>) {
      if (mc?.hex && mc.hex.trim().toLowerCase() === target) {
        return {
          color_name: mc.name ?? undefined,
          color_code: mc.color_code ?? undefined,
          color_hex: mc.hex,
        };
      }
    }
  }
  return null;
}
