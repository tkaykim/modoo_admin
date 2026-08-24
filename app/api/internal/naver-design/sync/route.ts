import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { isNaverCommerceConfigured } from '@/lib/naver-commerce/client';
import { ingestNaverPaidOrders } from '@/lib/naver-commerce/design-intake';
import { syncNaverOrders } from '@/lib/naver-commerce/orders';

export const runtime = 'nodejs';
export const maxDuration = 60;

function secretMatches(expected: string, actual: string): boolean {
  const expectedHash = createHash('sha256').update(expected).digest();
  const actualHash = createHash('sha256').update(actual).digest();
  return timingSafeEqual(expectedHash, actualHash);
}

export async function POST(request: Request) {
  const expected = process.env.NAVER_DESIGN_SYNC_SECRET || '';
  const actual = request.headers.get('x-internal-secret') || '';
  if (!expected || !secretMatches(expected, actual)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isNaverCommerceConfigured()) {
    return NextResponse.json({ data: { skipped: true, reason: 'credentials_missing' } });
  }

  try {
    const orders = await syncNaverOrders({ to: new Date() });
    const designIntake = await ingestNaverPaidOrders();
    return NextResponse.json({ data: { orders, designIntake } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '네이버 디자인 주문 동기화 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
