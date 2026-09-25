import type { SupabaseClient } from '@supabase/supabase-js';
import { isSuperAdmin, isFactoryRole } from './auth-helpers';

type Viewer = { role?: unknown; manufacturer_id?: string | null };
type Item = { id?: string; assigned_manufacturer_id?: string | null; factory_amount?: number | null; factory_unit_price?: number | null };

/** Service clients bypass RLS: filter the item scope before querying private amounts. */
export async function withFactorySettlements<T extends Item>(db: SupabaseClient, items: T[], viewer: Viewer): Promise<T[]> {
  const allowed = items.filter(i => isSuperAdmin(viewer.role) ||
    (isFactoryRole(viewer.role) && !!viewer.manufacturer_id && i.assigned_manufacturer_id === viewer.manufacturer_id));
  const amounts = new Map<string, { factory_amount: number | null; factory_unit_price: number | null }>();
  const ids = allowed.map(i => i.id).filter((id): id is string => !!id);
  for (let start = 0; start < ids.length; start += 200) {
    const { data, error } = await db.from('order_item_factory_settlements')
      .select('order_item_id, factory_amount, factory_unit_price').in('order_item_id', ids.slice(start, start + 200));
    // Rolling deployment: only authorized callers can use the legacy source
    // until the isolation migration creates the relation. Never mask other errors.
    if (error && ['PGRST205', '42P01'].includes(error.code)) {
      for (const i of allowed) if (i.id) amounts.set(i.id, { factory_amount: i.factory_amount ?? null, factory_unit_price: i.factory_unit_price ?? null });
      break;
    }
    if (error) throw new Error('공장 정산 정보를 불러오지 못했습니다.');
    for (const row of data || []) amounts.set(row.order_item_id, row);
  }
  return items.map(i => {
    const { factory_amount: _amount, factory_unit_price: _unit, ...rest } = i;
    void _amount; void _unit;
    const value = i.id ? amounts.get(i.id) : undefined;
    return { ...rest, ...(value ? { factory_amount: value.factory_amount, factory_unit_price: value.factory_unit_price } : {}) } as T;
  });
}

export async function withOrderFactorySettlements<T extends { order_items?: Item[]; factory_amount?: unknown }>(db: SupabaseClient, orders: T[], viewer: Viewer): Promise<T[]> {
  const items = await withFactorySettlements(db, orders.flatMap(o => o.order_items || []), viewer);
  const byId = new Map(items.map(i => [i.id, i]));
  return orders.map(o => {
    const { factory_amount: _amount, ...rest } = o;
    void _amount;
    return { ...rest, order_items: (o.order_items || []).map(i => byId.get(i.id) || i) } as T;
  });
}
