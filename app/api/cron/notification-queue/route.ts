import { NextResponse } from 'next/server';
import { flushNotificationQueue } from '@/lib/notifications/order-status';
import { flushCsEmailQueue } from '@/lib/cs/email-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 발송 시간대(KST 09~20시) 밖에 적재된 주문 상태 알림메일을 일괄 발송.
 * vercel.json cron schedule "0 0 * * *" = 매일 00:00 UTC = 09:00 KST.
 */
const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await flushNotificationQueue();
    const cs = await flushCsEmailQueue();

    console.log(
      `Cron notification-queue: orders(picked=${result.picked}, sent=${result.sent}, failed=${result.failed}) cs(picked=${cs.picked}, sent=${cs.sent}, failed=${cs.failed})`,
    );

    return NextResponse.json({
      data: { ...result, cs, timestamp: new Date().toISOString() },
    });
  } catch (err: any) {
    console.error('Cron notification-queue error:', err);
    return NextResponse.json({ error: err.message || 'Cron 실행 오류' }, { status: 500 });
  }
}
