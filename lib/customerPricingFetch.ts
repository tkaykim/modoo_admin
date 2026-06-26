/**
 * Fetches customer-facing print pricing rows from `customer_print_method_pricing`.
 *
 * 가격표 SSOT (Single Source of Truth) — 관리자가 '고객 단가표'(/customer-pricing)
 * 에서 수정하는 바로 그 테이블. 고객 앱(modoo_app)과 동일한 정본을 읽어,
 * 관리자 "주문생성 → 새디자인" 가격이 고객 앱 가격과 항상 일치하도록 한다.
 *
 * Read-only. 절대 throw 하지 않는다 — fetch 실패해도 null/[] 반환해서
 * 호출자가 hardcoded fallback으로 자연스럽게 떨어지게.
 *
 * modoo_app/lib/customerPricingFetch.ts 의 admin 포트 + byKey 매핑 추가.
 * (admin은 setPrintPricingConfig를 호출하지 않으므로 print_methods.key→id 를
 *  여기서 직접 해결한다.)
 */
import { createClient } from '@/lib/supabase-client';
import type { CustomerPricingRow } from '@/lib/customerPricingMatcher';

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  byPrintMethodId: Map<string, CustomerPricingRow[]>;
  /** print_method key (예: 'dtf') → 그 기법의 단가 행들 */
  byPrintMethodKey: Map<string, CustomerPricingRow[]>;
}

let _cache: CacheEntry | null = null;
let _inflight: Promise<CacheEntry> | null = null;

function emptyEntry(): CacheEntry {
  return {
    fetchedAt: Date.now(),
    byPrintMethodId: new Map(),
    byPrintMethodKey: new Map(),
  };
}

async function fetchAll(): Promise<CacheEntry> {
  try {
    const supabase = createClient();

    const [pricingRes, methodsRes] = await Promise.all([
      supabase
        .from('customer_print_method_pricing')
        .select('id, print_method_id, size, max_width_cm, max_height_cm, pricing_model, unit_price, base_price, base_quantity, additional_price_per_piece, is_active')
        .eq('is_active', true),
      supabase
        .from('print_methods')
        .select('id, key'),
    ]);

    if (pricingRes.error) {
      console.warn('[customerPricing] pricing fetch failed, falling back to legacy', pricingRes.error);
      return emptyEntry();
    }

    // print_method_id → key 매핑 (print_methods 조회 실패해도 byPrintMethodId는 채움)
    const keyById = new Map<string, string>();
    if (!methodsRes.error) {
      for (const m of methodsRes.data ?? []) {
        if (m.id && m.key) keyById.set(m.id as string, m.key as string);
      }
    } else {
      console.warn('[customerPricing] print_methods fetch failed; byKey unavailable', methodsRes.error);
    }

    const byPrintMethodId = new Map<string, CustomerPricingRow[]>();
    const byPrintMethodKey = new Map<string, CustomerPricingRow[]>();
    for (const row of pricingRes.data ?? []) {
      const typed: CustomerPricingRow = {
        id: row.id as string,
        print_method_id: row.print_method_id as string,
        size: row.size as string,
        max_width_cm: row.max_width_cm !== null ? Number(row.max_width_cm) : null,
        max_height_cm: row.max_height_cm !== null ? Number(row.max_height_cm) : null,
        pricing_model: row.pricing_model as 'flat' | 'bulk',
        unit_price: row.unit_price !== null ? Number(row.unit_price) : null,
        base_price: row.base_price !== null ? Number(row.base_price) : null,
        base_quantity: row.base_quantity !== null ? Number(row.base_quantity) : null,
        additional_price_per_piece: row.additional_price_per_piece !== null ? Number(row.additional_price_per_piece) : null,
        is_active: row.is_active as boolean,
      };
      const byId = byPrintMethodId.get(typed.print_method_id) ?? [];
      byId.push(typed);
      byPrintMethodId.set(typed.print_method_id, byId);

      const key = keyById.get(typed.print_method_id);
      if (key) {
        const byKey = byPrintMethodKey.get(key) ?? [];
        byKey.push(typed);
        byPrintMethodKey.set(key, byKey);
      }
    }

    return { fetchedAt: Date.now(), byPrintMethodId, byPrintMethodKey };
  } catch (e) {
    console.warn('[customerPricing] fetch threw, falling back to legacy', e);
    return emptyEntry();
  }
}

async function getEntry(): Promise<CacheEntry> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < TTL_MS) {
    return _cache;
  }

  if (_inflight) {
    return _inflight;
  }

  _inflight = fetchAll();
  try {
    _cache = await _inflight;
    return _cache;
  } finally {
    _inflight = null;
  }
}

/**
 * 특정 print_method_id에 대응하는 단가 행만 반환.
 */
export async function getCustomerPricingForPrintMethodId(
  printMethodId: string,
): Promise<CustomerPricingRow[]> {
  if (!printMethodId) return [];
  const entry = await getEntry();
  return entry.byPrintMethodId.get(printMethodId) ?? [];
}

/**
 * print_method key (예: 'dtf')로 단가 행 조회.
 * admin 에디터는 print_method id 를 항상 들고 있지 않으므로 key 로 조회한다.
 */
export async function getCustomerPricingForPrintMethodKey(
  key: string,
): Promise<CustomerPricingRow[]> {
  if (!key) return [];
  const entry = await getEntry();
  return entry.byPrintMethodKey.get(key) ?? [];
}

/** '고객 단가표' 수정 후 즉시 반영 필요 시 캐시 무효화. */
export function invalidateCustomerPricingCache(): void {
  _cache = null;
}
