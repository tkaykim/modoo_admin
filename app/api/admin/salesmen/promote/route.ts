import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { createAdminClient } from '@/lib/supabase-admin';

interface PromoteBody {
  user_id?: string;
  display_name?: string | null;
  phone?: string | null;
  mentor_id?: string | null;
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: PromoteBody;
  try {
    body = (await req.json()) as PromoteBody;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const userId = body.user_id;
  if (!userId) {
    return NextResponse.json({ error: 'user_id가 필요합니다.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('salesman_profiles')
    .select('id, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: '이미 영업사원으로 등록된 사용자입니다.', salesman_id: existing.id },
      { status: 409 }
    );
  }

  const { data: user, error: userErr } = await admin
    .from('profiles')
    .select('id, email, name, phone_number')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
  if (!user) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });

  const { data: codeData, error: codeErr } = await admin.rpc('generate_salesman_code');
  if (codeErr) return NextResponse.json({ error: codeErr.message }, { status: 500 });
  const salesmanCode = codeData as unknown as string;

  const { data: created, error: insertErr } = await admin
    .from('salesman_profiles')
    .insert({
      user_id: userId,
      salesman_code: salesmanCode,
      grade: 'LV0',
      status: 'active',
      display_name: body.display_name ?? user.name ?? null,
      phone: body.phone ?? user.phone_number ?? null,
      mentor_id: body.mentor_id ?? null,
    })
    .select('*')
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ profile: created }, { status: 201 });
}
