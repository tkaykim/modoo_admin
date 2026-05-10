import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('salesman_grade_levels')
    .select('level, label, commission_rate, monthly_revenue_threshold, display_order')
    .order('display_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ levels: data ?? [] });
}
