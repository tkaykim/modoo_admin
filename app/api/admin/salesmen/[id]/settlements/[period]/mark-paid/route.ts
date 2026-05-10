import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';

interface Body {
  status?: 'paid' | 'calculated' | 'pending';
  note?: string | null;
}

const ALLOWED = ['paid', 'calculated', 'pending'] as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; period: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id, period } = await params;

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty body 허용 — 기본 paid 토글 */
  }
  const status: 'paid' | 'calculated' | 'pending' =
    body.status && (ALLOWED as readonly string[]).includes(body.status) ? body.status : 'paid';

  const admin = createAdminClient();
  const updates: Record<string, unknown> = { status };
  if (status === 'paid') updates.paid_at = new Date().toISOString();
  if (status === 'calculated') updates.paid_at = null;
  if (body.note !== undefined) updates.note = body.note;

  const { data, error } = await admin
    .from('salesman_monthly_settlements')
    .update(updates)
    .eq('salesman_id', id)
    .eq('settlement_period', period)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settlement: data });
}
