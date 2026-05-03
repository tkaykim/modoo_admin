import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

function storagePathFromReviewImageUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const prefix = pathname.includes('/storage/v1/object/public/review-images/')
      ? '/storage/v1/object/public/review-images/'
      : pathname.includes('/storage/v1/object/sign/review-images/')
        ? '/storage/v1/object/sign/review-images/'
        : null;
    return prefix ? decodeURIComponent(pathname.split(prefix)[1] || '') : null;
  } catch {
    return null;
  }
}

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

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const searchQuery = url.searchParams.get('search') || '';
    const isBest = url.searchParams.get('is_best');
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const adminClient = createAdminClient();

    // Get total count with search filter
    let countQuery = adminClient
      .from('reviews')
      .select('*', { count: 'exact', head: true });

    if (isBest !== null) {
      countQuery = countQuery.eq('is_best', isBest === 'true');
    }

    if (searchQuery) {
      countQuery = countQuery.or(`title.ilike.%${searchQuery}%,author_name.ilike.%${searchQuery}%`);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    // Get paginated data with search filter
    let dataQuery = adminClient
      .from('reviews')
      .select(
        'id, product_id, rating, title, content, author_name, is_verified_purchase, is_best, best_order, helpful_count, review_image_urls, created_at, updated_at, product:products(id, title)'
      );

    if (isBest !== null && isBest === 'true') {
      dataQuery = dataQuery.order('best_order', { ascending: true });
    }
    dataQuery = dataQuery.order('created_at', { ascending: false }).range(from, to);

    if (isBest !== null) {
      dataQuery = dataQuery.eq('is_best', isBest === 'true');
    }

    if (searchQuery) {
      dataQuery = dataQuery.or(`title.ilike.%${searchQuery}%,author_name.ilike.%${searchQuery}%`);
    }

    const { data, error } = await dataQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '리뷰 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const {
      product_id,
      rating,
      title,
      content,
      author_name,
      is_verified_purchase,
      is_best,
      review_image_urls,
    } = body;

    if (!product_id || !title || !content || !author_name) {
      return NextResponse.json(
        { error: '필수 항목을 입력해주세요.' },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: '평점은 1~5 사이여야 합니다.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('reviews')
      .insert({
        product_id,
        rating,
        title,
        content,
        author_name,
        is_verified_purchase: is_verified_purchase ?? false,
        is_best: is_best ?? false,
        review_image_urls: review_image_urls ?? [],
      })
      .select('id, product_id, rating, title, content, author_name, is_verified_purchase, is_best, best_order, helpful_count, review_image_urls, created_at, updated_at, product:products(id, title)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '리뷰 등록에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const {
      id,
      product_id,
      rating,
      title,
      content,
      author_name,
      is_verified_purchase,
      is_best,
      review_image_urls,
    } = body;

    if (!id) {
      return NextResponse.json({ error: '리뷰 ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (product_id !== undefined) updateData.product_id = product_id;
    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return NextResponse.json(
          { error: '평점은 1~5 사이여야 합니다.' },
          { status: 400 }
        );
      }
      updateData.rating = rating;
    }
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (author_name !== undefined) updateData.author_name = author_name;
    if (is_verified_purchase !== undefined) updateData.is_verified_purchase = is_verified_purchase;
    if (is_best !== undefined) updateData.is_best = is_best;
    if (review_image_urls !== undefined) updateData.review_image_urls = review_image_urls;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('reviews')
      .update(updateData)
      .eq('id', id)
      .select('id, product_id, rating, title, content, author_name, is_verified_purchase, is_best, best_order, helpful_count, review_image_urls, created_at, updated_at, product:products(id, title)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '리뷰 수정에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const reviewId = url.searchParams.get('reviewId') || url.searchParams.get('id');

    if (!reviewId) {
      return NextResponse.json({ error: '리뷰 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Fetch review to get image URLs before deletion
    const { data: review } = await adminClient
      .from('reviews')
      .select('review_image_urls')
      .eq('id', reviewId)
      .single();

    // Delete images from storage
    if (review?.review_image_urls?.length) {
      const paths = review.review_image_urls
        .map(storagePathFromReviewImageUrl)
        .filter((p: string | null): p is string => !!p);

      if (paths.length > 0) {
        await adminClient.storage.from('review-images').remove(paths);
      }
    }

    const { error } = await adminClient.from('reviews').delete().eq('id', reviewId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: reviewId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '리뷰 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
