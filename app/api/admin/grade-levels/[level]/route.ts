import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';
import { isValidGradeLevel } from '@/lib/salesmen';

interface PatchBody {
  label?: string;
  commission_rate?: number;
  monthly_revenue_threshold?: number;
  maintain_threshold?: number | null;
  description?: string | null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ level: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { level } = await params;
  if (!isValidGradeLevel(level)) {
    return NextResponse.json({ error: '유효하지 않은 등급입니다.' }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.label !== undefined) {
    if (typeof body.label !== 'string' || body.label.trim().length === 0) {
      return NextResponse.json({ error: 'label 은 비어있지 않은 문자열이어야 합니다.' }, { status: 400 });
    }
    updates.label = body.label.trim();
  }
  if (body.commission_rate !== undefined) {
    const n = Number(body.commission_rate);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      return NextResponse.json({ error: 'commission_rate 는 0~1 범위여야 합니다.' }, { status: 400 });
    }
    updates.commission_rate = n;
  }
  if (body.monthly_revenue_threshold !== undefined) {
    const n = Number(body.monthly_revenue_threshold);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'monthly_revenue_threshold 는 0 이상이어야 합니다.' }, { status: 400 });
    }
    updates.monthly_revenue_threshold = Math.floor(n);
  }
  if (body.maintain_threshold !== undefined) {
    if (body.maintain_threshold === null) {
      updates.maintain_threshold = null;
    } else {
      const n = Number(body.maintain_threshold);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'maintain_threshold 는 0 이상이어야 합니다.' }, { status: 400 });
      }
      updates.maintain_threshold = Math.floor(n);
    }
  }
  if (body.description !== undefined) updates.description = body.description;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('salesman_grade_levels')
    .update(updates)
    .eq('level', level)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ level: data });
}
