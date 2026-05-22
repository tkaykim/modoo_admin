import { NextResponse } from 'next/server';
import { isFactoryRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * Returns the manufacturer record for the logged-in factory user.
 * Factory-only — admins have other tools to inspect manufacturers.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) return NextResponse.json({ error: authError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, manufacturer_id')
      .eq('id', user.id)
      .single();
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 403 });
    if (!profile || !isFactoryRole(profile.role)) {
      return NextResponse.json({ error: '공장 계정만 접근 가능합니다.' }, { status: 403 });
    }
    if (!profile.manufacturer_id) {
      return NextResponse.json(
        { error: '소속 공장이 지정되지 않은 계정입니다.' },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('manufacturers')
      .select('id, name, email, phone_number, address, is_active, created_at, updated_at')
      .eq('id', profile.manufacturer_id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공장 정보 조회에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
