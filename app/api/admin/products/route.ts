import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  }

  if (!user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  }

  if (!profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
};

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
};

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('products')
      .select('*, manufacturers(id, name)')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '제품 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const title = payload?.title;
    const basePrice = parseNumber(payload?.base_price);
    const category = payload?.category ?? null;
    const isActive = payload?.is_active ?? true;
    const configuration = payload?.configuration;
    const sizeOptions = payload?.size_options ?? null;
    const thumbnailImageLink = payload?.thumbnail_image_link ?? null;
    const descriptionImage = payload?.description_image ?? null;
    const sizingChartImage = payload?.sizing_chart_image ?? null;
    const productCode = payload?.product_code ?? null;
    const discountRates = payload?.discount_rates ?? null;
    const manufacturerId = payload?.manufacturer_id ?? null;
    const keywordsInput = payload?.keywords;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: '제품명이 필요합니다.' }, { status: 400 });
    }

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return NextResponse.json({ error: '기본 가격이 유효하지 않습니다.' }, { status: 400 });
    }

    if (!Array.isArray(configuration)) {
      return NextResponse.json({ error: '제품 구성 정보가 필요합니다.' }, { status: 400 });
    }

    if (sizeOptions !== null) {
      if (!Array.isArray(sizeOptions)) {
        return NextResponse.json({ error: '사이즈 옵션 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      // Validate each size option has label and size_code
      const isValidSizeOptions = sizeOptions.every(
        (opt: unknown) =>
          typeof opt === 'object' &&
          opt !== null &&
          'label' in opt &&
          'size_code' in opt &&
          typeof (opt as { label: unknown }).label === 'string' &&
          typeof (opt as { size_code: unknown }).size_code === 'string'
      );
      if (!isValidSizeOptions) {
        return NextResponse.json({ error: '사이즈 옵션은 label과 size_code가 필요합니다.' }, { status: 400 });
      }
    }

    if (category !== null && typeof category !== 'string') {
      return NextResponse.json({ error: '카테고리 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: '활성 상태 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (thumbnailImageLink !== null && typeof thumbnailImageLink !== 'string') {
      return NextResponse.json({ error: '썸네일 이미지 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (descriptionImage !== null && !Array.isArray(descriptionImage)) {
      return NextResponse.json({ error: '상세 이미지 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (sizingChartImage !== null && typeof sizingChartImage !== 'string') {
      return NextResponse.json({ error: '사이즈 차트 이미지 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (productCode !== null && typeof productCode !== 'string') {
      return NextResponse.json({ error: '제품 코드 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (discountRates !== null && !Array.isArray(discountRates)) {
      return NextResponse.json({ error: '할인율 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (manufacturerId !== null && typeof manufacturerId !== 'string') {
      return NextResponse.json({ error: '제조사 ID 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    let keywords: string[] = [];
    if (keywordsInput !== undefined && keywordsInput !== null) {
      if (!Array.isArray(keywordsInput) || !keywordsInput.every((k) => typeof k === 'string')) {
        return NextResponse.json({ error: '키워드 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      keywords = Array.from(new Set(keywordsInput.map((k) => k.trim()).filter(Boolean)));
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('products')
      .insert({
        title,
        base_price: basePrice,
        category,
        is_active: isActive,
        configuration,
        size_options: sizeOptions,
        thumbnail_image_link: thumbnailImageLink,
        description_image: descriptionImage,
        sizing_chart_image: sizingChartImage,
        product_code: productCode,
        discount_rates: discountRates,
        manufacturer_id: manufacturerId,
        keywords,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*, manufacturers(id, name)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '제품 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const productId = payload?.id;

    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: '제품 ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof payload?.title === 'string') {
      updateData.title = payload.title;
    }

    if (payload?.base_price !== undefined) {
      const basePrice = parseNumber(payload.base_price);
      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        return NextResponse.json({ error: '기본 가격이 유효하지 않습니다.' }, { status: 400 });
      }
      updateData.base_price = basePrice;
    }

    if (payload?.category !== undefined) {
      if (payload.category !== null && typeof payload.category !== 'string') {
        return NextResponse.json({ error: '카테고리 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.category = payload.category ?? null;
    }

    if (payload?.is_active !== undefined) {
      if (typeof payload.is_active !== 'boolean') {
        return NextResponse.json({ error: '활성 상태 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.is_active = payload.is_active;
    }

    if (payload?.is_featured !== undefined) {
      if (typeof payload.is_featured !== 'boolean') {
        return NextResponse.json({ error: '추천 상태 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.is_featured = payload.is_featured;
    }

    if (payload?.configuration !== undefined) {
      if (!Array.isArray(payload.configuration)) {
        return NextResponse.json({ error: '제품 구성 정보 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.configuration = payload.configuration;
    }

    if (payload?.size_options !== undefined) {
      if (payload.size_options !== null) {
        if (!Array.isArray(payload.size_options)) {
          return NextResponse.json({ error: '사이즈 옵션 형식이 올바르지 않습니다.' }, { status: 400 });
        }
        // Validate each size option has label and size_code
        const isValidSizeOptions = payload.size_options.every(
          (opt: unknown) =>
            typeof opt === 'object' &&
            opt !== null &&
            'label' in opt &&
            'size_code' in opt &&
            typeof (opt as { label: unknown }).label === 'string' &&
            typeof (opt as { size_code: unknown }).size_code === 'string'
        );
        if (!isValidSizeOptions) {
          return NextResponse.json({ error: '사이즈 옵션은 label과 size_code가 필요합니다.' }, { status: 400 });
        }
      }
      updateData.size_options = payload.size_options ?? null;
    }

    if (payload?.thumbnail_image_link !== undefined) {
      if (payload.thumbnail_image_link !== null && !Array.isArray(payload.thumbnail_image_link)) {
        return NextResponse.json({ error: '썸네일 이미지 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.thumbnail_image_link = payload.thumbnail_image_link ?? null;
    }

    if (payload?.description_image !== undefined) {
      if (payload.description_image !== null && !Array.isArray(payload.description_image)) {
        return NextResponse.json({ error: '상세 이미지 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.description_image = payload.description_image ?? null;
    }

    if (payload?.sizing_chart_image !== undefined) {
      if (payload.sizing_chart_image !== null && typeof payload.sizing_chart_image !== 'string') {
        return NextResponse.json({ error: '사이즈 차트 이미지 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.sizing_chart_image = payload.sizing_chart_image ?? null;
    }

    if (payload?.product_code !== undefined) {
      if (payload.product_code !== null && typeof payload.product_code !== 'string') {
        return NextResponse.json({ error: '제품 코드 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.product_code = payload.product_code ?? null;
    }

    if (payload?.discount_rates !== undefined) {
      if (payload.discount_rates !== null && !Array.isArray(payload.discount_rates)) {
        return NextResponse.json({ error: '할인율 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.discount_rates = payload.discount_rates ?? null;
    }

    if (payload?.manufacturer_id !== undefined) {
      if (payload.manufacturer_id !== null && typeof payload.manufacturer_id !== 'string') {
        return NextResponse.json({ error: '제조사 ID 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.manufacturer_id = payload.manufacturer_id ?? null;
    }

    if (payload?.keywords !== undefined) {
      if (payload.keywords !== null) {
        if (!Array.isArray(payload.keywords) || !payload.keywords.every((k: unknown) => typeof k === 'string')) {
          return NextResponse.json({ error: '키워드 형식이 올바르지 않습니다.' }, { status: 400 });
        }
        updateData.keywords = Array.from(
          new Set((payload.keywords as string[]).map((k) => k.trim()).filter(Boolean))
        );
      } else {
        updateData.keywords = [];
      }
    }

    if (payload?.sort_order !== undefined) {
      const sortOrder = Number(payload.sort_order);
      if (!Number.isNaN(sortOrder)) {
        updateData.sort_order = sortOrder;
      }
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .select('*, manufacturers(id, name)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '제품 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const productId = url.searchParams.get('id') || url.searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: '제품 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: productId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '제품 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const items: Array<{ id: string; sort_order: number }> = payload?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '정렬할 항목이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    for (const item of items) {
      if (!item.id || typeof item.id !== 'string') continue;
      const sortOrder = Number(item.sort_order);
      if (Number.isNaN(sortOrder)) continue;

      const { error } = await adminClient
        .from('products')
        .update({ sort_order: sortOrder, updated_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '정렬 순서 변경에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
