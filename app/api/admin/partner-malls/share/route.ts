import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { randomBytes } from 'crypto';
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

// POST: Generate a share token for a partner mall
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const partnerId = payload?.id;

    if (!partnerId || typeof partnerId !== 'string') {
      return NextResponse.json({ error: '파트너몰 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check if token already exists
    const { data: existing } = await adminClient
      .from('partner_malls')
      .select('share_token')
      .eq('id', partnerId)
      .single();

    if (existing?.share_token) {
      return NextResponse.json({ data: { share_token: existing.share_token } });
    }

    // Generate unique token
    const shareToken = randomBytes(16).toString('hex');

    const { data, error } = await adminClient
      .from('partner_malls')
      .update({
        share_token: shareToken,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partnerId)
      .select('id, share_token')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공유 링크 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: Revoke a share token
export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const partnerId = url.searchParams.get('id');

    if (!partnerId) {
      return NextResponse.json({ error: '파트너몰 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('partner_malls')
      .update({
        share_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partnerId)
      .select('id, share_token')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공유 링크 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
