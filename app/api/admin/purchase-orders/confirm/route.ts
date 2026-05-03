import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileError || !profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { user, profile };
}

// GET ?ids=a,b,c — return suggested unit_cost per item from product_costs lookup
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const idsParam = url.searchParams.get('ids');
    if (!idsParam) return NextResponse.json({ error: 'ids 필요' }, { status: 400 });
    const ids = idsParam.split(',').filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ data: [] });

    const adminClient = createAdminClient();
    const results = await Promise.all(ids.map(async (id) => {
      const { data, error } = await adminClient.rpc('get_order_item_suggested_cost', { p_order_item_id: id });
      if (error) return { orderItemId: id, error: error.message };
      const row = Array.isArray(data) ? data[0] : data;
      return {
        orderItemId: id,
        suggested_unit_cost: row?.suggested_unit_cost != null ? Number(row.suggested_unit_cost) : null,
        total_qty: row?.total_qty ?? null,
        matched_qty: row?.matched_qty ?? null,
      };
    }));

    // Also fetch existing order_item_costs to know if already set
    const { data: existing } = await adminClient
      .from('order_item_costs')
      .select('order_item_id, unit_cost, cost_source')
      .in('order_item_id', ids);
    const existingMap = new Map((existing || []).map((r: any) => [r.order_item_id, r]));

    const enriched = results.map((r: any) => ({
      ...r,
      existing: existingMap.get(r.orderItemId) || null,
    }));
    return NextResponse.json({ data: enriched });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'preview 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — confirm purchase order: 단가표 lookup 기반 base cost + 사용자 입력 ± 조정 + status='ordered'
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;
    const { user } = authResult;

    const payload = await request.json().catch(() => null);
    const items: Array<{
      orderItemId: string;
      base_unit_cost: number;          // 단가표 lookup 결과 (그대로 사용, 수정 X)
      adjustments?: Array<{ amount: number; reason: string }>;
    }> = payload?.items;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items 필요' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const now = new Date().toISOString();

    const ids = items.map((i) => i.orderItemId);
    const { data: orderItems, error: itemsError } = await adminClient
      .from('order_items')
      .select('id, quantity')
      .in('id', ids);
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
    const qtyMap = new Map((orderItems || []).map((r: any) => [r.id, r.quantity]));

    const { data: existing } = await adminClient
      .from('order_item_costs')
      .select('id, order_item_id')
      .in('order_item_id', ids);
    const existingMap = new Map((existing || []).map((r: any) => [r.order_item_id, r.id]));

    const errors: string[] = [];
    for (const it of items) {
      const qty = qtyMap.get(it.orderItemId);
      if (!qty || qty <= 0) {
        errors.push(`${it.orderItemId}: 수량 없음`);
        continue;
      }
      if (it.base_unit_cost == null || it.base_unit_cost < 0) {
        errors.push(`${it.orderItemId}: 단가 없음`);
        continue;
      }
      // base unit_cost는 항상 lookup 출처로 기록
      const costPayload = {
        order_item_id: it.orderItemId,
        unit_cost: it.base_unit_cost,
        quantity: qty,
        cost_source: 'lookup',
        override_reason: null,
        recorded_by: user.id,
      };
      const existingId = existingMap.get(it.orderItemId);
      if (existingId) {
        const { error } = await adminClient.from('order_item_costs').update(costPayload).eq('id', existingId);
        if (error) errors.push(`${it.orderItemId}: ${error.message}`);
      } else {
        const { error } = await adminClient.from('order_item_costs').insert(costPayload);
        if (error) errors.push(`${it.orderItemId}: ${error.message}`);
      }

      // 조정 행 INSERT (있으면)
      const adjustments = (it.adjustments || []).filter((a) => a.amount && a.reason && a.reason.trim());
      if (adjustments.length > 0) {
        const adjPayload = adjustments.map((a) => ({
          order_item_id: it.orderItemId,
          amount: a.amount,
          reason: a.reason.trim(),
          recorded_by: user.id,
        }));
        const { error } = await adminClient.from('order_item_cost_adjustments').insert(adjPayload);
        if (error) errors.push(`${it.orderItemId}: ${error.message}`);
      }
    }

    const { error: updErr } = await adminClient
      .from('order_items')
      .update({
        purchase_order_status: 'ordered',
        purchase_ordered_at: now,
        updated_at: now,
      })
      .in('id', ids);
    if (updErr) errors.push(updErr.message);

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('; '), partial: true }, { status: 207 });
    }
    return NextResponse.json({ ok: true, count: items.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '확정 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
