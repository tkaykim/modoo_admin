import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase-admin';

interface ParamsContext {
  params: Promise<{ id: string }>;
}

/**
 * 주문 상품 썸네일 단건 조회.
 * order_items.thumbnail_url 대부분이 base64 data URL이라 목록 API에 싣지 않고 여기서 이미지로 내려준다.
 */
export async function GET(_request: Request, { params }: ParamsContext) {
  const authResult = await requireAdmin();
  if (authResult.error) return authResult.error;

  const { id } = await params;
  const { data, error } = await createAdminClient()
    .from('order_items')
    .select('thumbnail_url')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const value = data?.thumbnail_url as string | null | undefined;
  if (!value) return new NextResponse(null, { status: 404 });

  if (!value.startsWith('data:')) {
    return NextResponse.redirect(value, 302);
  }

  const match = value.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) return new NextResponse(null, { status: 415 });
  const [, mime = 'application/octet-stream', isBase64, payload] = match;
  if (!mime.startsWith('image/')) return new NextResponse(null, { status: 415 });

  const body = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));
  return new NextResponse(body, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
