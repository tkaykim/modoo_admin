import { NextResponse } from 'next/server';
import { isFactoryRole, isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

/**
 * Read-only print_methods listing for factory users — used by the self-service
 * pricing editor to know which methods are available. Returns all rows
 * (including is_active=false) so factory users can pre-configure pricing
 * before admin flips the method live.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 403 });
    }
    if (!profile || (!isFactoryRole(profile.role) && !isAdminLike(profile.role))) {
      return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('print_methods')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '인쇄 방식 조회에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
