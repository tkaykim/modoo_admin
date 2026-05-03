import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const allowedStatuses = new Set(['pending', 'ongoing', 'completed']);

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

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('inquiries')
      .select(
        `
        id,
        user_id,
        title,
        content,
        status,
        is_admin,
        group_name,
        manager_name,
        phone,
        kakao_id,
        desired_date,
        expected_qty,
        fabric_color,
        file_urls,
        created_at,
        updated_at,
        inquiry_products (
          id,
          product_id,
          product:products (
            id,
            title
          )
        ),
        inquiry_replies (
          id,
          content,
          admin_id,
          created_at
        )
      `
      )
      .order('created_at', { ascending: false })
      .order('created_at', { ascending: true, foreignTable: 'inquiry_replies' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '문의 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const inquiryId = payload?.inquiryId || payload?.id;
    const status = payload?.status;

    if (!inquiryId || typeof inquiryId !== 'string') {
      return NextResponse.json({ error: '문의 ID가 필요합니다.' }, { status: 400 });
    }

    if (!status || typeof status !== 'string' || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: '유효한 상태 값이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('inquiries')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inquiryId)
      .select(
        `
        id,
        status,
        updated_at
      `
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '문의 상태 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(request.url);
    const inquiryId = searchParams.get('id');

    if (!inquiryId) {
      return NextResponse.json({ error: '문의 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Delete related inquiry_products first
    await adminClient.from('inquiry_products').delete().eq('inquiry_id', inquiryId);

    // Delete related inquiry_replies
    await adminClient.from('inquiry_replies').delete().eq('inquiry_id', inquiryId);

    // Delete the inquiry
    const { error } = await adminClient.from('inquiries').delete().eq('id', inquiryId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '문의 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
