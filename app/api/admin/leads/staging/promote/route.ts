import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (profileError) return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  if (!profile || !isAdminLike(profile.role)) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { user };
};

// ── POST: 스테이징 'new' 행 승격 (lead_organizations/lead_contacts 생성) ──────
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const batch: string | null =
      typeof payload?.batch_id === 'string' && payload.batch_id.trim() ? payload.batch_id.trim() : null;

    const admin = createAdminClient();

    // 승격 전 최신 중복판정 1회 더(안전)
    await admin.rpc('lead_classify_staging', { p_batch: batch });

    const { data, error } = await admin.rpc('lead_promote_staging', { p_batch: batch });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ result: result ?? { promoted: 0, skipped: 0 } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '승격에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
