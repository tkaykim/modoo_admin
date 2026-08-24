import { NextResponse } from 'next/server';
import { automationPing } from '@/lib/automation-ping';
import { isNaverCommerceConfigured } from '@/lib/naver-commerce/client';
import { syncAllNaverCommerce } from '@/lib/naver-commerce/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isNaverCommerceConfigured()) return NextResponse.json({ data: { skipped: true, reason: 'credentials_missing' } });
  try {
    const data = await syncAllNaverCommerce();
    await automationPing({ key: 'modoo:naver-commerce-sync', title: '네이버 스마트스토어 운영 동기화', triggerDesc: '매시 15분 KST', source: 'modoo_admin /api/cron/naver-commerce-sync', detail: data });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '네이버 동기화 오류';
    await automationPing({ key: 'modoo:naver-commerce-sync', title: '네이버 스마트스토어 운영 동기화', result: 'error', detail: { error: message } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
