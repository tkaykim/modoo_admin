import { NextResponse } from 'next/server';
import { isNaverCommerceConfigured } from '@/lib/naver-commerce/client';
import { ingestNaverPaidOrders } from '@/lib/naver-commerce/design-intake';
import { syncNaverOrders } from '@/lib/naver-commerce/orders';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const expected = process.env.NAVER_DESIGN_SYNC_SECRET || '';
  if (!expected || request.headers.get('x-internal-secret') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isNaverCommerceConfigured()) {
    return NextResponse.json({ data: { skipped: true, reason: 'credentials_missing' } });
  }

  try {
    const now = new Date();
    const orders = await syncNaverOrders({
      from: new Date(now.getTime() - 15 * 60 * 1000),
      to: now,
    });
    const designIntake = await ingestNaverPaidOrders();
    return NextResponse.json({ data: { orders, designIntake } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '네이버 디자인 주문 동기화 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
