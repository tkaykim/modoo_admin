import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;

  const admin = createAdminClient();
  const { data: before } = await admin
    .from('salesman_profiles')
    .select('grade')
    .eq('id', id)
    .maybeSingle();

  const { data, error } = await admin
    .from('salesman_profiles')
    .update({
      grade_locked_until: null,
      grade_locked_by: null,
      grade_locked_reason: null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('salesman_grade_changes').insert({
    salesman_id: id,
    prev_level: (before as { grade?: string } | null)?.grade ?? null,
    new_level: data.grade,
    reason: 'manual_unlock',
    changed_by: auth.user.id,
    note: '관리자 수동 잠금 해제',
  });

  return NextResponse.json({ profile: data });
}
