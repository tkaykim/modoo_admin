import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { registerOrder, inquirySlipNo, trackCargoLast, LOGEN_FARE_TY, LOGEN_CONTRACT_FARE, LOGEN_BOX_TY_CD, type RegisterOrderInput } from '@/lib/logen';
import { getKstYYYYMMDD } from '@/lib/kst';

function genFixTakeNo(): string {
  // MANUAL-YYYYMMDD-XXXX (4자리 BASE36) — 사람 가독성 + 충돌 가능성 낮음
  const dt = getKstYYYYMMDD();
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36).toUpperCase().padStart(4, '0');
  return `MANUAL-${dt}-${rand}`;
}

// GET: 최근 수동 접수 목록
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !isAdminLike(profile.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'all';
    const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);

    const adminClient = createAdminClient();
    let q = adminClient.from('manual_shipments').select('*').order('created_at', { ascending: false }).limit(limit);
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '조회 실패' }, { status: 500 });
  }
}

// POST: 새 수동 접수 (record 생성 + 로젠 registerOrderData 호출)
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !isAdminLike(profile.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const sender = body?.sender as { name?: string; addr?: string; tel?: string; manufacturerId?: string } | undefined;
    const receiver = body?.receiver as { name?: string; addr?: string; tel?: string; manufacturerId?: string } | undefined;
    const fareTy: string = /^0[1234]0$/.test(body?.fareTy) ? body.fareTy : LOGEN_FARE_TY;
    const qty = Math.max(1, Number(body?.qty) || 1);
    // dlvFare = 총 운임(계약운임 × 박스 수). 공식 문서 예시 qty=2 ↔ dlvFare=6000.
    // 박스 수와 안 맞는 운임(예: 2박스에 3,000원)을 보내면 등록은 TRUE여도
    // 송장 발행 대상에서 조용히 제외된다. 0원 운임도 동일하게 제외되므로 허용하지 않는다.
    const deliveryFee = Number(body?.deliveryFee) > 0 ? Number(body.deliveryFee) : LOGEN_CONTRACT_FARE * qty;
    const goodsNm: string = (body?.goodsNm || '').toString().trim().slice(0, 100);
    const category: string | null = body?.category?.toString().trim() || null;
    const memo: string | null = body?.memo?.toString().trim() || null;

    if (!sender?.name || !sender?.addr || !sender?.tel) {
      return NextResponse.json({ error: '발송자 정보(이름/주소/연락처)가 필요합니다.' }, { status: 400 });
    }
    if (!receiver?.name || !receiver?.addr || !receiver?.tel) {
      return NextResponse.json({ error: '수신자 정보(이름/주소/연락처)가 필요합니다.' }, { status: 400 });
    }
    if (!goodsNm) {
      return NextResponse.json({ error: '물품명을 입력해 주세요.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const takeDt = getKstYYYYMMDD();
    const fixTakeNo = genFixTakeNo();

    // 1) 로젠 접수
    const payload: RegisterOrderInput = {
      takeDt,
      fixTakeNo,
      sndCustNm: sender.name,
      sndCustAddr: sender.addr,
      sndTelNo: sender.tel.replace(/[^0-9]/g, ''),
      rcvCustNm: receiver.name,
      rcvCustAddr: receiver.addr,
      rcvTelNo: receiver.tel.replace(/[^0-9]/g, ''),
      rcvCellNo: receiver.tel.replace(/[^0-9]/g, ''),
      fareTy,
      boxTyCd: LOGEN_BOX_TY_CD,
      qty,
      dlvFare: deliveryFee,
      goodsNm,
    };
    const result = await registerOrder([payload]);
    if (result.sttsCd === 'FAIL') {
      return NextResponse.json({ error: result.sttsMsg, logenResponse: result }, { status: 500 });
    }
    const ok = Array.isArray(result.data) && result.data[0]?.resultCd === 'TRUE';
    if (!ok) {
      return NextResponse.json({ error: '로젠 접수에 실패했습니다.', logenResponse: result }, { status: 500 });
    }

    // 2) DB 기록
    const { data: inserted, error: insertError } = await adminClient
      .from('manual_shipments')
      .insert({
        fix_take_no: fixTakeNo,
        sender_name: sender.name,
        sender_addr: sender.addr,
        sender_tel: payload.sndTelNo,
        sender_manufacturer_id: sender.manufacturerId || null,
        receiver_name: receiver.name,
        receiver_addr: receiver.addr,
        receiver_tel: payload.rcvCellNo,
        receiver_manufacturer_id: receiver.manufacturerId || null,
        fare_ty: fareTy,
        qty,
        delivery_fee: deliveryFee,
        goods_nm: goodsNm,
        category,
        memo,
        take_dt: takeDt,
        tracking_carrier: 'logen',
        status: 'registered',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      // 로젠은 접수됐는데 DB 저장 실패 — 운영자가 fix_take_no로 추적 가능하도록 응답에 포함
      return NextResponse.json({
        error: `DB 저장 실패: ${insertError.message}. 로젠은 접수됨(fixTakeNo=${fixTakeNo}).`,
        fixTakeNo,
      }, { status: 500 });
    }

    return NextResponse.json({ data: inserted });
  } catch (e: any) {
    console.error('Standalone shipping register error:', e);
    return NextResponse.json({ error: e?.message || '접수 중 오류 발생' }, { status: 500 });
  }
}
