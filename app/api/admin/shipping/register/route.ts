import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { registerOrder, inquirySlipNo, LOGEN_FARE_TY, LOGEN_CONTRACT_FARE, LOGEN_BOX_TY_CD, type RegisterOrderInput } from '@/lib/logen';
import { getKstYYYYMMDD } from '@/lib/kst';

// 우리 회사(피스코프/모두의 유니폼) 기본 발송지 — 케이스에 따라 발송자/수신자로 모두 쓰임
const COMPANY_NAME = '모두의 유니폼';
const COMPANY_ADDR = '서울특별시 마포구 성지3길 55 3층';
const COMPANY_TEL = '010-8140-0621';

// 클라이언트가 override해서 보낼 수 있는 발/수 정보. 없으면 기본(우리→고객).
interface PartyOverride {
  name?: string;
  addr?: string;
  tel?: string;
}

// 송장 품목명(goodsNm) 생성 — "디자인명 제품명" 형식.
// 색상/사이즈 나열은 송장을 보는 고객에게 혼선을 줘 제외한다(2026-07-07 운영 요청).
function buildGoodsNm(orderItems: any[], fallback: string): string {
  const labels = (orderItems || [])
    .map((item: any) => {
      const title = item?.product_title || '';
      if (!title) return '';
      const design = typeof item?.design_title === 'string' ? item.design_title.trim() : '';
      return design ? `${design} ${title}` : title;
    })
    .filter(Boolean);
  return Array.from(new Set(labels)).join(', ').slice(0, 100) || fallback;
}

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

    const body = await request.json();
    const { orderIds } = body;
    // 단건 접수 시 클라가 override할 수 있음 (배송 유형 4케이스: us→customer/us→factory/factory→us/factory→customer)
    // 일괄 접수(여러 orderIds)에서는 sender/receiver override 무시 — 케이스별로 다를 수 있어 단건 처리 권장
    const senderOverride: PartyOverride | undefined = body?.sender;
    const receiverOverride: PartyOverride | undefined = body?.receiver;
    const fareTyOverride: string | undefined = body?.fareTy; // '010'선불 '020'착불 '030'신용 '040'본사신용
    const shippingCase: string | undefined = body?.shippingCase; // 'us_to_customer'|'us_to_factory'|'factory_to_us'|'factory_to_customer'
    const allowOverride = Array.isArray(orderIds) && orderIds.length === 1;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: orders, error: ordersError } = await adminClient
      .from('orders')
      .select('id, customer_name, customer_phone, postal_code, address_line_1, address_line_2, shipping_method, order_status, logen_registered_at, delivery_fee, order_items(id, product_title, design_title, quantity, item_options)')
      .in('id', orderIds);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    const takeDt = getKstYYYYMMDD();

    // ──────────────────────────────────────────────────────────────
    // 내부 이동(우리↔공장) 전용 경로
    // 고객 배송과 달리 주문 레벨 배송필드(logen_registered_at/tracking_number/order_status)를
    // 건드리지 않는다. 그래야 내부 접수 후에도 고객행(우리/공장→고객) 접수가 막히지 않는다.
    // 로젠 fixTakeNo 충돌 방지를 위해 order.id에 접미사(-U2F/-F2U)를 붙여 별도 접수번호로 등록한다.
    // (로젠 inquirySlipNo는 정확매칭이라 접미사 행이 고객행 dedup을 오인 차단하지 않음 — 실측 확인)
    const INTERNAL_SUFFIX: Record<string, string> = { us_to_factory: '-U2F', factory_to_us: '-F2U' };
    const isInternalCase = allowOverride && !!shippingCase && shippingCase in INTERNAL_SUFFIX;
    if (isInternalCase) {
      const order = orders[0];
      const legType = shippingCase === 'us_to_factory' ? 'to_factory' : 'other';
      const suffixedFixNo = `${order.id}${INTERNAL_SUFFIX[shippingCase!]}`;

      // 발송자/수신자 필수 (UI가 케이스별로 채워 보냄)
      if (!senderOverride?.name || !senderOverride?.addr || !senderOverride?.tel ||
          !receiverOverride?.name || !receiverOverride?.addr || !receiverOverride?.tel) {
        return NextResponse.json({ error: '내부 이동은 발송자/수신자 정보가 모두 필요합니다.' }, { status: 400 });
      }

      // 멱등 ①: 이미 같은 종류의 내부 leg가 있으면 = 이미 접수됨
      const { data: existingLeg } = await adminClient
        .from('order_shipping_legs')
        .select('id')
        .eq('order_id', order.id)
        .eq('leg_type', legType)
        .maybeSingle();
      if (existingLeg) {
        return NextResponse.json({ error: '이미 접수된 내부 이동입니다.', skipped: [`${order.id}: 내부(${legType}) 이미 접수됨`] }, { status: 400 });
      }

      // 멱등 ②: 로젠에 접미사번호가 이미 있는지 확인 (fail-closed)
      let inq;
      try {
        inq = await inquirySlipNo([suffixedFixNo]);
      } catch (e: any) {
        return NextResponse.json({ error: '로젠 접수 상태 확인에 실패해 접수를 중단했습니다. 잠시 후 다시 시도해주세요. (중복 접수 방지)' }, { status: 502 });
      }
      const alreadyAtLogen = Array.isArray(inq.data) && inq.data.some(
        (it: any) => it.fixTakeNo === suffixedFixNo && it.resultCd === 'TRUE' &&
          (Array.isArray(it.data1) ? it.data1 : []).some((r: any) => r && r.delYn !== 'Y')
      );

      if (!alreadyAtLogen) {
        const goodsNm = buildGoodsNm(order.order_items as any[], '내부 이동');
        const fareTy = (fareTyOverride && /^0[1234]0$/.test(fareTyOverride)) ? fareTyOverride : LOGEN_FARE_TY;
        const reg = await registerOrder([{
          takeDt,
          fixTakeNo: suffixedFixNo,
          sndCustNm: senderOverride.name!,
          sndCustAddr: senderOverride.addr!,
          sndTelNo: (senderOverride.tel || '').replace(/[^0-9]/g, ''),
          rcvCustNm: receiverOverride.name!,
          rcvCustAddr: receiverOverride.addr!,
          rcvTelNo: (receiverOverride.tel || '').replace(/[^0-9]/g, ''),
          rcvCellNo: (receiverOverride.tel || '').replace(/[^0-9]/g, ''),
          fareTy,
          boxTyCd: LOGEN_BOX_TY_CD,
          qty: 1,
          dlvFare: LOGEN_CONTRACT_FARE,
          goodsNm,
        }]);
        if (reg.sttsCd === 'FAIL') {
          return NextResponse.json({ error: reg.sttsMsg, logenResponse: reg }, { status: 500 });
        }
        const ok = Array.isArray(reg.data) && reg.data.some((it: any) => it.fixTakeNo === suffixedFixNo && it.resultCd === 'TRUE');
        if (!ok) {
          return NextResponse.json({ error: '로젠 접수가 완료되지 않았습니다.', logenResponse: reg }, { status: 500 });
        }
      }

      // leg(원가) 기록 — 주문 레벨 필드는 건드리지 않음
      await adminClient.from('order_shipping_legs').insert({
        order_id: order.id,
        leg_type: legType,
        amount: LOGEN_CONTRACT_FARE,
        carrier: 'logen',
        note: `로젠 내부 이동 접수 자동 기록 (${shippingCase})`,
        created_by: user.id,
      });

      return NextResponse.json({
        data: { internal: true, shippingCase, registered: 1, total: 1, takeDt, alreadyAtLogen },
      });
    }
    // ──────────────────────────────────────────────────────────────

    const registerData: RegisterOrderInput[] = [];
    const skipped: string[] = [];

    // 멱등 가드: 우리 DB에 도장이 없어도 로젠에 이미 접수돼 있을 수 있다
    // (응답 타임아웃 후 재시도 시 중복 접수 사고 방지 — 2026-06-11).
    // 로젠 상태 확인이 안 되면 접수를 진행하지 않는다(fail-closed).
    const candidates = orders.filter(
      (o) => o.shipping_method === 'domestic' && !o.logen_registered_at
    );
    const alreadyAtLogen = new Set<string>();
    if (candidates.length > 0) {
      let inquiry;
      try {
        inquiry = await inquirySlipNo(candidates.map((o) => o.id));
      } catch (e: any) {
        return NextResponse.json({
          error: '로젠 접수 상태 확인에 실패해 접수를 중단했습니다. 잠시 후 다시 시도해주세요. (중복 접수 방지)',
        }, { status: 502 });
      }
      if (inquiry.data && Array.isArray(inquiry.data)) {
        for (const item of inquiry.data) {
          const activeRows = (Array.isArray(item.data1) ? item.data1 : [])
            .filter((r: any) => r && r.delYn !== 'Y');
          if (item.resultCd === 'TRUE' && activeRows.length > 0) {
            alreadyAtLogen.add(item.fixTakeNo);
          }
        }
      }
      if (alreadyAtLogen.size > 0) {
        // 로젠엔 있는데 우리 DB에 도장이 없던 건 → 도장 동기화 후 건너뜀
        await adminClient
          .from('orders')
          .update({
            logen_registered_at: new Date().toISOString(),
            tracking_carrier: 'logen',
          })
          .in('id', [...alreadyAtLogen]);
      }
    }

    for (const order of orders) {
      if (order.shipping_method !== 'domestic') {
        skipped.push(`${order.id}: 국내배송이 아님`);
        continue;
      }
      if (order.logen_registered_at) {
        skipped.push(`${order.id}: 이미 접수됨`);
        continue;
      }
      if (alreadyAtLogen.has(order.id)) {
        skipped.push(`${order.id}: 이미 로젠에 접수되어 있음 (시스템 동기화 완료)`);
        continue;
      }

      // 우편번호는 주소 문자열에 섞지 않고 별도 필드(rcvZipCd)로 보낸다
      // ([12345] 프리픽스는 로젠 주소 분류기가 못 읽을 수 있음 — 문서 예시 형식 준수)
      const fullAddr = [
        order.address_line_1 || '',
        order.address_line_2 || '',
      ].filter(Boolean).join(' ');
      const rcvZip = (order.postal_code || '').replace(/[^0-9]/g, '').slice(0, 5);

      const goodsNm = buildGoodsNm(order.order_items as any[], '상품');

      // 기본값(우리→고객) 산정
      const defaultSender = { name: COMPANY_NAME, addr: COMPANY_ADDR, tel: COMPANY_TEL };
      const defaultReceiver = {
        name: order.customer_name || '고객',
        addr: fullAddr || '주소 미입력',
        tel: (order.customer_phone || '').replace(/[^0-9]/g, ''),
      };
      // 단건 + override가 있으면 우선 적용 (4-케이스용)
      const sender = (allowOverride && senderOverride)
        ? { name: senderOverride.name || defaultSender.name, addr: senderOverride.addr || defaultSender.addr, tel: (senderOverride.tel || defaultSender.tel).replace(/[^0-9]/g, '') }
        : defaultSender;
      const receiver = (allowOverride && receiverOverride)
        ? { name: receiverOverride.name || defaultReceiver.name, addr: receiverOverride.addr || defaultReceiver.addr, tel: (receiverOverride.tel || defaultReceiver.tel).replace(/[^0-9]/g, '') }
        : defaultReceiver;
      // 계약 = 선불(010). 계약과 다른 fareTy는 등록돼도 발행 대상에서 제외되므로 기본값은 계약값.
      const fareTy = (allowOverride && fareTyOverride && /^0[1234]0$/.test(fareTyOverride)) ? fareTyOverride : LOGEN_FARE_TY;

      registerData.push({
        takeDt,
        fixTakeNo: order.id,
        sndCustNm: sender.name,
        sndCustAddr: sender.addr,
        sndTelNo: sender.tel,
        rcvCustNm: receiver.name,
        // override(4-케이스 단건)는 zip을 따로 못 받으므로 기본(우리→고객) 경로만 zip 전송
        ...(!(allowOverride && receiverOverride) && rcvZip ? { rcvZipCd: rcvZip } : {}),
        rcvCustAddr: receiver.addr,
        rcvTelNo: receiver.tel,
        rcvCellNo: receiver.tel,
        fareTy,
        boxTyCd: LOGEN_BOX_TY_CD,
        // 로젠 qty = 박스 수. 상품 수량 합계를 넣으면 박스 수만큼 운임이 청구되므로 기본 1박스.
        qty: 1,
        // 로젠 계약운임(선불 단가). 고객에게 받은 배송비(order.delivery_fee)와는 별개의 값이다.
        dlvFare: LOGEN_CONTRACT_FARE,
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

    // 택배비 원가 자동 기록 — 접수된 주문에 배송 leg(계약운임)를 1회 기록해
    // order_profit_summary.internal_shipping_cost(손익 차감)에 반영되게 한다.
    const legType = (allowOverride && shippingCase === 'us_to_factory') ? 'to_factory'
      : (allowOverride && shippingCase === 'factory_to_us') ? 'other'
      : 'to_customer';
    const costTargets = [...successIds, ...alreadyAtLogen];
    if (costTargets.length > 0) {
      const { data: existingLegs } = await adminClient
        .from('order_shipping_legs')
        .select('order_id')
        .in('order_id', costTargets)
        .eq('leg_type', legType);
      const hasLeg = new Set((existingLegs || []).map((l: any) => l.order_id));
      const newLegs = costTargets.filter((id) => !hasLeg.has(id)).map((id) => ({
        order_id: id,
        leg_type: legType,
        amount: LOGEN_CONTRACT_FARE,
        carrier: 'logen',
        note: '로젠 접수 시 자동 기록 (계약운임)',
        created_by: user.id,
      }));
      if (newLegs.length > 0) {
        await adminClient.from('order_shipping_legs').insert(newLegs);
      }
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
