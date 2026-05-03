import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: designId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (!isAdminLike(profile.role))) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    const { data: design, error: designError } = await adminClient
      .from('saved_designs')
      .select('id, preview_url, canvas_state, color_selections')
      .eq('id', designId)
      .single();

    if (designError || !design) {
      return NextResponse.json(
        { error: designError?.message || '디자인을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const { data: orderItems, error: fetchError } = await adminClient
      .from('order_items')
      .select('id')
      .eq('design_id', designId);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!orderItems || orderItems.length === 0) {
      return NextResponse.json({ data: { synced: 0 } });
    }

    const orderItemIds = orderItems.map((item) => item.id);

    const { error: updateError, count } = await adminClient
      .from('order_items')
      .update({
        thumbnail_url: design.preview_url,
        canvas_state: design.canvas_state,
        color_selections: design.color_selections,
        updated_at: new Date().toISOString(),
      }, { count: 'exact' })
      .in('id', orderItemIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ data: { synced: count ?? orderItemIds.length } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '주문 항목 동기화에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
