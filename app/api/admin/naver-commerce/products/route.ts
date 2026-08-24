import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { createNaverProductFromLocal, updateNaverProduct } from '@/lib/naver-commerce/products';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const localProductId = String(body.localProductId || '');
    const templateOriginProductNo = Number(body.templateOriginProductNo);
    if (!localProductId || !Number.isSafeInteger(templateOriginProductNo)) return NextResponse.json({ error: '자체몰 상품과 네이버 템플릿 상품을 선택해 주세요.' }, { status: 400 });
    const data = await createNaverProductFromLocal({
      localProductId,
      templateOriginProductNo,
      suspended: body.suspended === true,
      name: typeof body.name === 'string' ? body.name : undefined,
      salePrice: body.salePrice === undefined || body.salePrice === '' ? undefined : Number(body.salePrice),
      stockQuantity: body.stockQuantity === undefined || body.stockQuantity === '' ? undefined : Number(body.stockQuantity),
    });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '네이버 상품 등록에 실패했습니다.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const originProductNo = Number(body.originProductNo);
    if (!Number.isSafeInteger(originProductNo)) return NextResponse.json({ error: '네이버 원상품 번호가 필요합니다.' }, { status: 400 });
    const data = await updateNaverProduct({
      originProductNo,
      suspended: body.suspended === true,
      name: typeof body.name === 'string' ? body.name : undefined,
      salePrice: body.salePrice === undefined || body.salePrice === '' ? undefined : Number(body.salePrice),
      stockQuantity: body.stockQuantity === undefined || body.stockQuantity === '' ? undefined : Number(body.stockQuantity),
    });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '네이버 상품 수정에 실패했습니다.' }, { status: 500 });
  }
}
