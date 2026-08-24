import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { confirmNaverProductOrders } from '@/lib/naver-commerce/orders';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const productOrderIds = Array.isArray(body.productOrderIds) ? body.productOrderIds.map(String).filter(Boolean) : [];
    if (!productOrderIds.length) return NextResponse.json({ error: '상품주문을 선택해 주세요.' }, { status: 400 });
    if (body.action !== 'confirm') return NextResponse.json({ error: '지원하지 않는 주문 작업입니다.' }, { status: 400 });
    const data = await confirmNaverProductOrders(productOrderIds);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '네이버 주문 처리에 실패했습니다.' }, { status: 500 });
  }
}
