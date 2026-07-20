import type { SupabaseClient } from '@supabase/supabase-js';

// 시안확정(제작 확정)된 주문 상품의 최종 아트워크를 고객의 saved_designs에 반영한다.
//
// 배경: 관리자가 상담을 통해 order_items.canvas_state(스냅샷)만 수정하므로,
// 고객 '내 디자인'의 원본은 상담 전 옛 버전으로 남는다. 이 모듈이 확정 시점에
// 역방향(주문 스냅샷 → saved_designs)으로 동기화해 재주문 시 최신 확정본이 쓰이게 한다.
//
// 반영 규칙:
//  - 게스트 주문(user_id 없음)은 디자인함이 없으므로 skip.
//  - 원본 디자인이 주문 이후 손대지 않은 상태면 in-place 갱신 (updated).
//  - 고객이 주문 이후 원본을 직접 수정했으면 덮지 않고 "제작 확정본" 사본 생성 (copied).
//  - 디자인 연결이 없거나(관리자 생성 주문) 소유자가 다르면(파트너몰 영업사원 디자인)
//    주문 고객 명의로 신규 생성 (created).
//  - 내용이 이미 동일하면 확정 스탬프·단가만 갱신 (stamped).
// copied/created 시 order_items.design_id를 새 디자인으로 재연결해 재주문 경로를 확정본으로 통일한다.

export interface WriteBackResult {
  action: 'updated' | 'copied' | 'created' | 'stamped' | 'skipped';
  designId?: string;
  reason?: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_title: string | null;
  design_id: string | null;
  design_title: string | null;
  canvas_state: Record<string, unknown> | null;
  color_selections: Record<string, unknown> | null;
  thumbnail_url: string | null;
  image_urls: Record<string, unknown> | null;
  text_svg_exports: Record<string, unknown> | null;
  custom_fonts: unknown[] | null;
  price_per_item: number | null;
  created_at: string;
}

function canvasHash(canvas: unknown): string {
  // 양쪽 모두 jsonb에서 로드되어 Postgres가 키 순서를 정규화하므로 stringify 비교가 안정적이다.
  try {
    return JSON.stringify(canvas ?? null);
  } catch {
    return String(Math.random());
  }
}

function hasCanvasContent(canvas: Record<string, unknown> | null): boolean {
  return !!canvas && Object.keys(canvas).length > 0;
}

export async function writeBackConfirmedDesign(
  db: SupabaseClient,
  orderItemId: string,
): Promise<WriteBackResult> {
  const { data: item, error: itemError } = await db
    .from('order_items')
    .select(
      'id, order_id, product_id, product_title, design_id, design_title, canvas_state, color_selections, thumbnail_url, image_urls, text_svg_exports, custom_fonts, price_per_item, created_at'
    )
    .eq('id', orderItemId)
    .single<OrderItemRow>();

  if (itemError || !item) {
    return { action: 'skipped', reason: 'order_item_not_found' };
  }

  if (!item.product_id) {
    return { action: 'skipped', reason: 'no_product' };
  }

  if (!hasCanvasContent(item.canvas_state)) {
    return { action: 'skipped', reason: 'no_canvas_state' };
  }

  const { data: order } = await db
    .from('orders')
    .select('user_id')
    .eq('id', item.order_id)
    .single<{ user_id: string | null }>();

  if (!order?.user_id) {
    return { action: 'skipped', reason: 'guest_order' };
  }

  const now = new Date().toISOString();
  const confirmStamp = {
    last_confirmed_at: now,
    last_confirmed_order_item_id: item.id,
  };
  const snapshotFields = {
    canvas_state: item.canvas_state,
    color_selections: item.color_selections ?? {},
    preview_url: item.thumbnail_url ?? null,
    image_urls: item.image_urls ?? null,
    text_svg_exports: item.text_svg_exports ?? null,
    custom_fonts: item.custom_fonts ?? [],
    price_per_item: item.price_per_item ?? null,
    updated_at: now,
  };

  const insertConfirmedCopy = async (title: string): Promise<{ id: string } | null> => {
    const { data: created, error: insertError } = await db
      .from('saved_designs')
      .insert({
        user_id: order.user_id,
        product_id: item.product_id,
        title,
        ...snapshotFields,
        ...confirmStamp,
      })
      .select('id')
      .single<{ id: string }>();

    if (insertError || !created) {
      console.error('[designWriteBack] insert failed:', insertError);
      return null;
    }

    // 재주문 경로가 확정본을 가리키도록 주문 상품에 재연결
    const { error: relinkError } = await db
      .from('order_items')
      .update({ design_id: created.id, updated_at: now })
      .eq('id', item.id);

    if (relinkError) {
      console.error('[designWriteBack] relink failed:', relinkError);
    }

    return created;
  };

  const baseTitle = item.design_title || item.product_title || '디자인';

  // 기존 디자인 연결이 있는 경우
  if (item.design_id) {
    const { data: design } = await db
      .from('saved_designs')
      .select('id, user_id, title, canvas_state, updated_at')
      .eq('id', item.design_id)
      .single<{
        id: string;
        user_id: string;
        title: string | null;
        canvas_state: Record<string, unknown> | null;
        updated_at: string;
      }>();

    if (design && design.user_id === order.user_id) {
      // 내용이 이미 같으면 스탬프 + 확정 단가만 동기화
      if (canvasHash(design.canvas_state) === canvasHash(item.canvas_state)) {
        const { error } = await db
          .from('saved_designs')
          .update({
            ...confirmStamp,
            price_per_item: item.price_per_item ?? null,
            updated_at: now,
          })
          .eq('id', design.id);
        if (error) {
          console.error('[designWriteBack] stamp failed:', error);
          return { action: 'skipped', reason: 'stamp_failed' };
        }
        return { action: 'stamped', designId: design.id };
      }

      // 주문 이후 고객이 원본을 건드리지 않았으면 in-place 갱신
      if (new Date(design.updated_at).getTime() <= new Date(item.created_at).getTime()) {
        const { error } = await db
          .from('saved_designs')
          .update({ ...snapshotFields, ...confirmStamp })
          .eq('id', design.id);
        if (error) {
          console.error('[designWriteBack] update failed:', error);
          return { action: 'skipped', reason: 'update_failed' };
        }
        return { action: 'updated', designId: design.id };
      }

      // 고객이 주문 후 원본을 수정함 → 유실 방지 위해 확정본 사본 생성
      const copyTitle = `${design.title || baseTitle} (제작 확정본)`;
      const created = await insertConfirmedCopy(copyTitle);
      if (!created) return { action: 'skipped', reason: 'copy_failed' };
      return { action: 'copied', designId: created.id };
    }
  }

  // 디자인 연결이 없거나 소유자가 다름 → 주문 고객 명의로 신규 생성
  const created = await insertConfirmedCopy(baseTitle);
  if (!created) return { action: 'skipped', reason: 'create_failed' };
  return { action: 'created', designId: created.id };
}
