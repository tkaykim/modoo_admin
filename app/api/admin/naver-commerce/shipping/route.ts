import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { dispatchNaverShipment, registerNaverShipment, syncNaverShipmentSlip } from '@/lib/naver-commerce/shipping';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    let data: unknown;
    if (body.action === 'register') {
      const ids = Array.isArray(body.productOrderIds) ? body.productOrderIds.map(String).filter(Boolean) : [];
      if (!ids.length) return NextResponse.json({ error: '상품주문을 선택해 주세요.' }, { status: 400 });
      data = await registerNaverShipment(ids, Number(body.boxQty || 1));
    } else if (body.action === 'slip') {
      data = await syncNaverShipmentSlip(String(body.naverOrderId || ''));
    } else if (body.action === 'dispatch') {
      data = await dispatchNaverShipment(String(body.naverOrderId || ''));
    } else {
      return NextResponse.json({ error: '지원하지 않는 배송 작업입니다.' }, { status: 400 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '네이버 배송 처리에 실패했습니다.' }, { status: 500 });
  }
}
