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

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const manufacturerId = payload?.manufacturer_id;
    const email = payload?.email;
    const password = payload?.password;

    if (!manufacturerId || typeof manufacturerId !== 'string') {
      return NextResponse.json({ error: '공장 ID가 필요합니다.' }, { status: 400 });
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: '이메일이 필요합니다.' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: '비밀번호는 6자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Verify the factory exists
    const { data: factory, error: factoryError } = await adminClient
      .from('manufacturers')
      .select('id')
      .eq('id', manufacturerId)
      .single();

    if (factoryError || !factory) {
      return NextResponse.json({ error: '공장을 찾을 수 없습니다.' }, { status: 400 });
    }

    // Create auth user (email_confirm: true skips verification email)
    const { data: authData, error: authCreateError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authCreateError) {
      return NextResponse.json({ error: authCreateError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: '계정 생성에 실패했습니다.' }, { status: 500 });
    }

    // The handle_new_user trigger creates a profile with role='customer'.
    // Update it to role='factory' with the manufacturer_id.
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .update({
        role: 'factory',
        manufacturer_id: manufacturerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authData.user.id)
      .select('id, email, name, phone_number, role, manufacturer_id, created_at, updated_at')
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ data: profile });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '공장 계정 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
