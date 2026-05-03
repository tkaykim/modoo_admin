import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { registerOrder, type RegisterOrderInput } from '@/lib/logen';
import { getKstYYYYMMDD } from '@/lib/kst';

const SENDER_NAME = '모두의굿즈';
const SENDER_ADDR = '경기도 성남시 수정구 창업로57번길7 5층';
const SENDER_TEL = '02-3415-8969';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
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

    const { orderIds } = await request.json();
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: orders, error: ordersError } = await adminClient
      .from('orders')
      .select('id, customer_name, customer_phone, postal_code, address_line_1, address_line_2, shipping_method, order_status, logen_registered_at, delivery_fee, order_items(id, product_title, quantity)')
      .in('id', orderIds);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    const takeDt = getKstYYYYMMDD();

    const registerData: RegisterOrderInput[] = [];
    const skipped: string[] = [];

    for (const order of orders) {
      if (order.shipping_method !== 'domestic') {
        skipped.push(`${order.id}: 국내배송이 아님`);
        continue;
      }
      if (order.logen_registered_at) {
        skipped.push(`${order.id}: 이미 접수됨`);
        continue;
      }

      const fullAddr = [
        order.postal_code ? `[${order.postal_code}]` : '',
        order.address_line_1 || '',
        order.address_line_2 || '',
      ].filter(Boolean).join(' ');

      const totalQty = (order.order_items || []).reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
      const goodsNm = (order.order_items || []).map((item: any) => item.product_title).join(', ').slice(0, 100) || '상품';

      registerData.push({
        takeDt,
        fixTakeNo: order.id,
        sndCustNm: SENDER_NAME,
        sndCustAddr: SENDER_ADDR,
        sndTelNo: SENDER_TEL,
        rcvCustNm: order.customer_name || '고객',
        rcvCustAddr: fullAddr || '주소 미입력',
        rcvCellNo: (order.customer_phone || '').replace(/[^0-9]/g, ''),
        fareTy: '040',
        qty: totalQty || 1,
        dlvFare: order.delivery_fee || 0,
        goodsNm,
      });
    }

    if (registerData.length === 0) {
      return NextResponse.json({
        error: '접수 가능한 주문이 없습니다.',
        skipped,
      }, { status: 400 });
    }

    const result = await registerOrder(registerData);

    if (result.sttsCd === 'FAIL') {
      return NextResponse.json({ error: result.sttsMsg, logenResponse: result }, { status: 500 });
    }

    const successIds: string[] = [];
    if (result.data && Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item.resultCd === 'TRUE') {
          successIds.push(item.fixTakeNo);
        }
      }
    }

    if (successIds.length > 0) {
      await adminClient
        .from('orders')
        .update({
          logen_registered_at: new Date().toISOString(),
          tracking_carrier: 'logen',
        })
        .in('id', successIds);
    }

    return NextResponse.json({
      data: {
        registered: successIds.length,
        total: registerData.length,
        skipped,
        takeDt,
        logenResponse: result,
      },
    });
  } catch (err: any) {
    console.error('Logen register error:', err);
    const isTimeout = err?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || err?.message?.includes('fetch failed');
    if (isTimeout) {
      return NextResponse.json({
        error: '로젠 API 서버에 연결할 수 없습니다. LOGEN_SECRET_KEY 설정과 네트워크를 확인해주세요.',
      }, { status: 502 });
    }
    return NextResponse.json({ error: err.message || '택배 접수 중 오류 발생' }, { status: 500 });
  }
}
