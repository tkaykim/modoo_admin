import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('salesman_monthly_settlements')
    .select('*')
    .eq('salesman_id', id)
    .order('settlement_period', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settlements: data ?? [] });
}
