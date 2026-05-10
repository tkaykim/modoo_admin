import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';

const NUMERIC_FIELDS: Array<{
  key: keyof PatchBody;
  min: number;
  max: number;
  isFloat?: boolean;
}> = [
  { key: 'evaluation_window_months', min: 1, max: 12 },
  { key: 'manual_lock_months', min: 0, max: 24 },
  { key: 'demotion_grace_periods', min: 0, max: 6 },
  { key: 'demotion_max_steps', min: 0, max: 10 },
  { key: 'dormant_inactive_months', min: 1, max: 24 },
  { key: 'churned_inactive_months', min: 1, max: 36 },
  { key: 'default_maintain_ratio', min: 0, max: 1, isFloat: true },
];

interface PatchBody {
  evaluation_window_months?: number;
  manual_lock_months?: number;
  demotion_grace_periods?: number;
  demotion_max_steps?: number;
  dormant_inactive_months?: number;
  churned_inactive_months?: number;
  default_maintain_ratio?: number;
  auto_reevaluation_enabled?: boolean;
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('salesman_grade_policy')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ policy: data });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const f of NUMERIC_FIELDS) {
    const v = body[f.key];
    if (v === undefined) continue;
    if (typeof v !== 'number' || Number.isNaN(v) || v < f.min || v > f.max) {
      return NextResponse.json(
        { error: `${String(f.key)} 값이 허용 범위 [${f.min}, ${f.max}] 를 벗어났습니다.` },
        { status: 400 }
      );
    }
    updates[String(f.key)] = f.isFloat ? Number(v) : Math.floor(v);
  }
  if (body.auto_reevaluation_enabled !== undefined) {
    if (typeof body.auto_reevaluation_enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'auto_reevaluation_enabled 는 boolean 이어야 합니다.' },
        { status: 400 }
      );
    }
    updates.auto_reevaluation_enabled = body.auto_reevaluation_enabled;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다.' }, { status: 400 });
  }
  updates.updated_by = auth.user.id;
  updates.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('salesman_grade_policy')
    .update(updates)
    .eq('id', 1)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ policy: data });
}
