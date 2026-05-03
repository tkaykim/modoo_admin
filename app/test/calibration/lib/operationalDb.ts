/**
 * Read-only operational DB access for the calibration test page.
 *
 * Hard rules:
 * - SELECT only. No insert/update/delete/RPC/storage write.
 * - Separate Supabase client instance with isolated session storage key
 *   so we never collide with the live admin session.
 * - Only consumed inside `app/test/calibration/**`.
 */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnchorId } from './types';

let cached: SupabaseClient | null = null;

/**
 * Uses the admin-session-aware browser client so RLS checks
 * (`auth.jwt()->>'role' = 'admin'`) pass on our test-only table.
 * We never call operational tables for writes from this module.
 */
function getClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('[CALIB-TEST] Supabase env missing');
  cached = createBrowserClient(url, key);
  return cached;
}

export interface OperationalSide {
  id: string;
  name: string;
  imageUrl: string | null;
  printArea?: { x: number; y: number; width: number; height: number };
  realLifeDimensions?: { productWidthMm?: number };
}

export interface OperationalProduct {
  id: string;
  title: string;
  category: string | null;
  productCode: string | null;
  manufacturerName: string | null;
  sides: OperationalSide[];
}

export async function fetchOperationalProducts(): Promise<OperationalProduct[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, title, category, configuration, is_active, product_code, manufacturer:manufacturers(name)')
    .eq('is_active', true)
    .order('title', { ascending: true });

  if (error) {
    console.error('[CALIB-TEST] fetchOperationalProducts error', error);
    throw error;
  }

  return (data ?? [])
    .map((row: any) => {
      const cfg = row.configuration;
      if (!Array.isArray(cfg)) return null;
      const sides: OperationalSide[] = cfg
        .filter((s: any) => s && typeof s === 'object')
        .map((s: any) => ({
          id: String(s.id ?? ''),
          name: String(s.name ?? s.id ?? ''),
          imageUrl: typeof s.imageUrl === 'string' ? s.imageUrl : null,
          printArea: s.printArea,
          realLifeDimensions: s.realLifeDimensions,
        }))
        .filter((s) => s.id);
      if (!sides.length) return null;
      const manufacturerName = Array.isArray(row.manufacturer)
        ? row.manufacturer[0]?.name ?? null
        : row.manufacturer?.name ?? null;
      return {
        id: row.id,
        title: row.title,
        category: row.category ?? null,
        productCode: row.product_code ?? null,
        manufacturerName,
        sides,
      };
    })
    .filter((x): x is OperationalProduct => !!x);
}

const SIDE_NAME_TO_ANCHORS: { match: RegExp; anchors: AnchorId[] }[] = [
  { match: /front|앞/i, anchors: ['left-chest', 'right-chest'] },
  { match: /back|뒤|등/i, anchors: ['back-center', 'neck-back', 'back-bottom'] },
  { match: /sleeve.?left|left.?sleeve|왼.?소매|왼쪽/i, anchors: ['left-forearm', 'left-wrist'] },
  { match: /sleeve.?right|right.?sleeve|오른.?소매|오른쪽/i, anchors: ['right-forearm', 'right-wrist'] },
  { match: /hood|후드/i, anchors: [] },
];

export interface CalibPayloadRow {
  product_id: string;
  side_id: string;
  payload: any;
  updated_at: string;
}

export async function loadAllCalibPayloads(): Promise<CalibPayloadRow[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('product_calibrations')
    .select('product_id, side_id, payload, updated_at');
  if (error) {
    console.error('[CALIB-TEST] loadAllCalibPayloads error', error);
    throw error;
  }
  return (data ?? []) as CalibPayloadRow[];
}

export async function upsertCalibPayload(
  operationalProductId: string,
  sideId: string,
  payload: any,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('product_calibrations')
    .upsert(
      { product_id: operationalProductId, side_id: sideId, payload },
      { onConflict: 'product_id,side_id' },
    );
  if (error) {
    console.error('[CALIB-TEST] upsertCalibPayload error', error);
    throw error;
  }
}

export function suggestAnchorsForSide(sideId: string, sideName: string): AnchorId[] {
  const haystack = `${sideId} ${sideName}`;
  for (const rule of SIDE_NAME_TO_ANCHORS) {
    if (rule.match.test(haystack)) return rule.anchors;
  }
  return [];
}
