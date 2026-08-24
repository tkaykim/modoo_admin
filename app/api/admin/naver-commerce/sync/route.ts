import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { syncAllNaverCommerce, syncNaverCommerceSection } from '@/lib/naver-commerce/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json().catch(() => ({}));
    const section = typeof body.section === 'string' ? body.section : 'all';
    const data = section === 'all' ? await syncAllNaverCommerce() : await syncNaverCommerceSection(section);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '네이버 동기화에 실패했습니다.' }, { status: 500 });
  }
}
