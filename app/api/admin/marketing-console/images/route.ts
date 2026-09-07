import { NextRequest, NextResponse } from 'next/server';
import { requireMarketingAccess } from '@/lib/admin/require-marketing-access';
import { fetchAdImages } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireMarketingAccess();
  if ('error' in auth && auth.error) return auth.error;
  const hashes = [...new Set(req.nextUrl.searchParams.getAll('hash'))];
  if (hashes.length > 40 || hashes.some((hash) => !/^[a-zA-Z0-9_-]{1,128}$/.test(hash))) {
    return NextResponse.json({ error: '이미지 요청이 올바르지 않습니다.' }, { status: 400 });
  }
  try {
    const images = hashes.length ? await fetchAdImages(hashes) : {};
    return NextResponse.json({ data: images });
  } catch {
    return NextResponse.json({ error: '이미지를 불러오지 못했습니다.' }, { status: 502 });
  }
}
