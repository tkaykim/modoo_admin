import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';

// 영업사원 승격 후보 검색 — 이메일/이름/전화로 profiles 검색하되
// 이미 salesman_profiles 에 등록된 사용자는 제외한다.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ data: [] });
  }
  const escaped = q.replace(/[%,]/g, '');
  const admin = createAdminClient();

  const { data: existingSalesmen } = await admin.from('salesman_profiles').select('user_id');
  const existingIds = new Set<string>(
    ((existingSalesmen ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
  );

  const { data, error } = await admin
    .from('profiles')
    .select('id, email, name, phone_number, role')
    .or(
      `email.ilike.%${escaped}%,name.ilike.%${escaped}%,phone_number.ilike.%${escaped}%`
    )
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filtered = ((data ?? []) as Array<{
    id: string;
    email: string | null;
    name: string | null;
    phone_number: string | null;
    role: string | null;
  }>).filter((u) => !existingIds.has(u.id));

  return NextResponse.json({ data: filtered });
}
