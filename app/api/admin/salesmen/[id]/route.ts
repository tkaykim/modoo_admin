import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  isValidGradeLevel,
  isValidStatus,
  type SalesmanProfile,
  type GradePolicy,
} from '@/lib/salesmen';

interface PatchBody {
  grade?: string;
  grade_lock?: boolean; // 등급 수동 변경 시 자동 잠금 (기본 true)
  grade_lock_months?: number | null; // 정책 기본값 override
  grade_lock_reason?: string | null;
  status?: string;
  display_name?: string | null;
  phone?: string | null;
  mentor_id?: string | null;
  note?: string | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from('salesman_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: '영업사원을 찾을 수 없습니다.' }, { status: 404 });

  const sp = profile as SalesmanProfile;

  const [{ data: user }, { data: mentor }] = await Promise.all([
    admin.from('profiles').select('id, email, name, phone_number').eq('id', sp.user_id).maybeSingle(),
    sp.mentor_id
      ? admin
          .from('salesman_profiles')
          .select('id, display_name, salesman_code')
          .eq('id', sp.mentor_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    profile: sp,
    user: user ?? null,
    mentor: mentor ?? null,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing, error: existErr } = await admin
    .from('salesman_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: '영업사원을 찾을 수 없습니다.' }, { status: 404 });
  const before = existing as SalesmanProfile;

  const updates: Record<string, unknown> = {};
  let gradeChanged = false;

  if (body.grade !== undefined) {
    if (!isValidGradeLevel(body.grade)) {
      return NextResponse.json({ error: '유효하지 않은 등급입니다.' }, { status: 400 });
    }
    if (body.grade !== before.grade) {
      updates.grade = body.grade;
      updates.consecutive_below_threshold = 0;
      gradeChanged = true;
    }
  }

  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) {
      return NextResponse.json({ error: '유효하지 않은 상태값입니다.' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body.display_name !== undefined) updates.display_name = body.display_name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.note !== undefined) updates.note = body.note;
  if (body.mentor_id !== undefined) {
    if (body.mentor_id === id) {
      return NextResponse.json({ error: '자기 자신을 멘토로 지정할 수 없습니다.' }, { status: 400 });
    }
    updates.mentor_id = body.mentor_id;
  }

  // 등급 수동 변경 시 lock 적용
  if (gradeChanged) {
    const lockEnabled = body.grade_lock !== false; // 기본 true
    if (lockEnabled) {
      const { data: policyRow } = await admin
        .from('salesman_grade_policy')
        .select('manual_lock_months')
        .eq('id', 1)
        .maybeSingle();
      const months =
        typeof body.grade_lock_months === 'number'
          ? Math.max(0, Math.floor(body.grade_lock_months))
          : Number((policyRow as Pick<GradePolicy, 'manual_lock_months'> | null)?.manual_lock_months ?? 3);
      if (months > 0) {
        const until = new Date();
        until.setUTCMonth(until.getUTCMonth() + months);
        updates.grade_locked_until = until.toISOString();
        updates.grade_locked_by = auth.user.id;
        updates.grade_locked_reason = body.grade_lock_reason ?? '관리자 수동 등급 변경';
      }
    } else {
      updates.grade_locked_until = null;
      updates.grade_locked_by = null;
      updates.grade_locked_reason = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다.' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('salesman_profiles')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 등급 변경 이력은 DB 트리거(trg_log_salesman_grade_change)가 자동 INSERT.
  // 관리자 컨텍스트(reason='manual_set', changed_by, note)를 보강하기 위해
  // 가장 최근 row 를 UPDATE 한다.
  if (gradeChanged) {
    const { data: latest } = await admin
      .from('salesman_grade_changes')
      .select('id')
      .eq('salesman_id', id)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id) {
      await admin
        .from('salesman_grade_changes')
        .update({
          reason: 'manual_set',
          changed_by: auth.user.id,
          note: body.grade_lock_reason ?? null,
        })
        .eq('id', latest.id);
    }
  }

  return NextResponse.json({ profile: data });
}
