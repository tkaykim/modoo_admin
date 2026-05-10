import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';

interface InviteBody {
  email?: string;
  display_name?: string | null;
  phone?: string | null;
  mentor_id?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: '유효한 이메일이 필요합니다.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1) auth.users 에 이미 있는지 확인 — 있으면 promote 흐름을 안내
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (existingProfile) {
    return NextResponse.json(
      {
        error: '이미 가입된 사용자입니다. "기존 사용자 승격" 탭을 사용하세요.',
        existing_user_id: existingProfile.id,
      },
      { status: 409 }
    );
  }

  // 2) 초대 메일 발송
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      name: body.display_name ?? undefined,
      phone: body.phone ?? undefined,
    },
  });
  if (inviteErr) {
    return NextResponse.json({ error: `초대 메일 발송 실패: ${inviteErr.message}` }, { status: 500 });
  }

  const newUserId = invited?.user?.id;
  if (!newUserId) {
    return NextResponse.json({ error: '초대 사용자 ID를 가져오지 못했습니다.' }, { status: 500 });
  }

  // 3) salesman_profiles insert (코드 자동 생성)
  const { data: codeData, error: codeErr } = await admin.rpc('generate_salesman_code');
  if (codeErr) return NextResponse.json({ error: codeErr.message }, { status: 500 });
  const salesmanCode = codeData as unknown as string;

  const { data: created, error: insertErr } = await admin
    .from('salesman_profiles')
    .insert({
      user_id: newUserId,
      salesman_code: salesmanCode,
      grade: 'LV0',
      status: 'active',
      display_name: body.display_name ?? null,
      phone: body.phone ?? null,
      mentor_id: body.mentor_id ?? null,
    })
    .select('*')
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: `영업사원 프로필 생성 실패: ${insertErr.message}`, invited_user_id: newUserId },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: created, invited_user_id: newUserId, email }, { status: 201 });
}
