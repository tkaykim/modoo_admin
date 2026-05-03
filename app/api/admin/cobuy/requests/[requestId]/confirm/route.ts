import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { user };
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const { requestId } = await params;
    const body = await req.json();
    const { confirmed_price, start_date, end_date, receive_by_date, pricing_tiers, payment_mode, size_prices } = body;

    if (!confirmed_price || isNaN(Number(confirmed_price))) {
      return NextResponse.json({ error: '확정 가격이 필요합니다.' }, { status: 400 });
    }
    if (!start_date || !end_date) {
      return NextResponse.json({ error: '시작일과 종료일이 필요합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Fetch the request
    const { data: request, error: reqError } = await admin
      .from('cobuy_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ error: '요청을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (request.status === 'session_created') {
      return NextResponse.json({ error: '이미 세션이 생성되었습니다.' }, { status: 400 });
    }

    if (!request.admin_design_id) {
      return NextResponse.json({ error: '관리자 디자인이 연결되지 않았습니다.' }, { status: 400 });
    }

    // 2. Fetch the admin's saved design
    const { data: savedDesign, error: designError } = await admin
      .from('saved_designs')
      .select('*')
      .eq('id', request.admin_design_id)
      .single();

    if (designError || !savedDesign) {
      return NextResponse.json({ error: '연결된 디자인을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 3. Create design screenshot (snapshot)
    const { data: screenshot, error: screenshotError } = await admin
      .from('saved_design_screenshots')
      .insert({
        user_id: request.user_id,
        product_id: savedDesign.product_id,
        title: savedDesign.title,
        color_selections: savedDesign.color_selections,
        canvas_state: savedDesign.canvas_state,
        preview_url: savedDesign.preview_url,
        price_per_item: Number(confirmed_price),
        image_urls: savedDesign.image_urls,
        text_svg_exports: savedDesign.text_svg_exports,
        custom_fonts: savedDesign.custom_fonts || [],
      })
      .select('id')
      .single();

    if (screenshotError || !screenshot) {
      console.error('Error creating design screenshot:', screenshotError);
      return NextResponse.json({ error: '디자인 스냅샷 생성에 실패했습니다.' }, { status: 500 });
    }

    // 4. Create CoBuy session
    const schedulePrefs = request.schedule_preferences || {};
    const quantityPrefs = request.quantity_expectations || {};

    const { data: session, error: sessionError } = await admin
      .from('cobuy_sessions')
      .insert({
        user_id: request.user_id,
        saved_design_screenshot_id: screenshot.id,
        title: request.title,
        description: request.description || null,
        start_date: start_date,
        end_date: end_date,
        receive_by_date: receive_by_date || (schedulePrefs as any).receiveByDate || null,
        min_quantity: (quantityPrefs as any).minQuantity || null,
        max_quantity: (quantityPrefs as any).maxQuantity || null,
        max_participants: null,
        pricing_tiers: pricing_tiers || [{ minQuantity: 1, pricePerItem: Number(confirmed_price) }],
        custom_fields: request.custom_fields || [],
        delivery_settings: request.delivery_preferences || null,
        is_public: request.is_public || false,
        payment_mode: payment_mode || 'individual',
        size_prices: size_prices || null,
        status: 'gathering',
        current_participant_count: 0,
        current_total_quantity: 0,
      })
      .select()
      .single();

    if (sessionError || !session) {
      console.error('Error creating CoBuy session:', sessionError);
      // Cleanup screenshot
      await admin.from('saved_design_screenshots').delete().eq('id', screenshot.id);
      return NextResponse.json({ error: '공동구매 세션 생성에 실패했습니다.' }, { status: 500 });
    }

    // 5. Update the request
    const { error: updateError } = await admin
      .from('cobuy_requests')
      .update({
        status: 'session_created',
        confirmed_price: Number(confirmed_price),
        cobuy_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Error updating request:', updateError);
    }

    return NextResponse.json({
      success: true,
      session_id: session.id,
      share_token: session.share_token,
    });
  } catch (error) {
    console.error('Error confirming request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
