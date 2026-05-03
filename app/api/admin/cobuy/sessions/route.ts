import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const allowedStatuses = new Set([
  'gathering',
  'gather_complete',
  'order_complete',
  'manufacturing',
  'manufacture_complete',
  'delivering',
  'delivery_complete',
  'cancelled',
]);

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
    const status = url.searchParams.get('status') || 'all';

    if (status !== 'all' && !allowedStatuses.has(status)) {
      return NextResponse.json({ error: '지원하지 않는 상태입니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    let query = adminClient
      .from('cobuy_sessions')
      .select('*, profiles(email, phone_number), saved_design_screenshots(preview_url, price_per_item)')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공동구매 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Extract storage path from a Supabase Storage public URL.
 * URL format: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
 */
function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const sessionId = payload?.sessionId;
    const status = payload?.status;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: '세션 ID가 필요합니다.' }, { status: 400 });
    }

    if (!status || typeof status !== 'string' || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: '유효한 상태 값이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // When cancelling, clean up uploaded images from storage
    if (status === 'cancelled') {
      const { data: session } = await adminClient
        .from('cobuy_sessions')
        .select('cobuy_image_urls')
        .eq('id', sessionId)
        .single();

      if (session?.cobuy_image_urls?.length) {
        const paths = session.cobuy_image_urls
          .map((url: string) => extractStoragePath(url, 'products'))
          .filter(Boolean) as string[];

        if (paths.length > 0) {
          const { error: deleteError } = await adminClient.storage
            .from('products')
            .remove(paths);

          if (deleteError) {
            console.error('Failed to delete cobuy images from storage:', deleteError);
          }
        }
      }
    }

    const { data, error } = await adminClient
      .from('cobuy_sessions')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select('*, profiles(email, phone_number), saved_design_screenshots(preview_url, price_per_item)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '상태 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: '세션 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Fetch session to get image URLs before deletion
    const { data: session } = await adminClient
      .from('cobuy_sessions')
      .select('cobuy_image_urls, saved_design_screenshot_id')
      .eq('id', sessionId)
      .single();

    // Delete uploaded images from storage
    if (session?.cobuy_image_urls?.length) {
      const paths = session.cobuy_image_urls
        .map((u: string) => extractStoragePath(u, 'products'))
        .filter(Boolean) as string[];

      if (paths.length > 0) {
        await adminClient.storage.from('products').remove(paths);
      }
    }

    // Delete the session (cascade should handle participants)
    const { error } = await adminClient
      .from('cobuy_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Clean up stub screenshot if it exists
    if (session?.saved_design_screenshot_id) {
      await adminClient
        .from('saved_design_screenshots')
        .delete()
        .eq('id', session.saved_design_screenshot_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '세션 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
