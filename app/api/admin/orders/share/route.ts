import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';

// Helper function to check admin authentication
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
}

// Helper to get base URL from request
function getBaseUrl(request: Request): string {
  // Try environment variable first
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  // Fall back to request origin
  const url = new URL(request.url);
  return url.origin;
}

// POST: Generate share token for an order
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const baseUrl = getBaseUrl(request);
    const payload = await request.json().catch(() => null);
    const orderId = payload?.orderId;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check if order exists and get current share token
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, share_token')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    // If token already exists, return it
    if (order.share_token) {
      return NextResponse.json({
        data: {
          share_token: order.share_token,
          share_url: `${baseUrl}/shared/order/${order.share_token}`,
        },
      });
    }

    // Generate new 32-character hex token
    const shareToken = randomBytes(16).toString('hex');

    // Update order with new share token
    const { data: updatedOrder, error: updateError } = await adminClient
      .from('orders')
      .update({
        share_token: shareToken,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('share_token')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        share_token: updatedOrder.share_token,
        share_url: `${baseUrl}/shared/order/${updatedOrder.share_token}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공유 링크 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove share token to disable sharing
export async function DELETE(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { error: updateError } = await adminClient
      .from('orders')
      .update({
        share_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공유 링크 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: Get current share token for an order
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const baseUrl = getBaseUrl(request);
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('share_token')
      .eq('id', orderId)
      .single();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    if (!order || !order.share_token) {
      return NextResponse.json({ data: { share_token: null, share_url: null } });
    }

    return NextResponse.json({
      data: {
        share_token: order.share_token,
        share_url: `${baseUrl}/shared/order/${order.share_token}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공유 정보를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
