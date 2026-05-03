import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  }

  if (!user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  }

  if (!profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
};

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('manufacturers')
      .select('id, name, email, phone_number, address, is_active, created_at, updated_at')
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공장 목록을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const name = payload?.name;
    const email = payload?.email ?? null;
    const phoneNumber = payload?.phone_number ?? null;
    const address = payload?.address ?? null;
    const isActive = payload?.is_active ?? true;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: '공장명이 필요합니다.' }, { status: 400 });
    }

    if (email !== null && typeof email !== 'string') {
      return NextResponse.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (phoneNumber !== null && typeof phoneNumber !== 'string') {
      return NextResponse.json({ error: '전화번호 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: '활성 상태 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('manufacturers')
      .insert({
        name: name.trim(),
        email,
        phone_number: phoneNumber,
        address,
        is_active: isActive,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, name, email, phone_number, address, is_active, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공장 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const factoryId = payload?.id;

    if (!factoryId || typeof factoryId !== 'string') {
      return NextResponse.json({ error: '공장 ID가 필요합니다.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof payload?.name === 'string') {
      updateData.name = payload.name.trim();
    }

    if (payload?.email !== undefined) {
      if (payload.email !== null && typeof payload.email !== 'string') {
        return NextResponse.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.email = payload.email ?? null;
    }

    if (payload?.phone_number !== undefined) {
      if (payload.phone_number !== null && typeof payload.phone_number !== 'string') {
        return NextResponse.json({ error: '전화번호 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.phone_number = payload.phone_number ?? null;
    }

    if (payload?.address !== undefined) {
      updateData.address = payload.address ?? null;
    }

    if (payload?.is_active !== undefined) {
      if (typeof payload.is_active !== 'boolean') {
        return NextResponse.json({ error: '활성 상태 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      updateData.is_active = payload.is_active;
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('manufacturers')
      .update(updateData)
      .eq('id', factoryId)
      .select('id, name, email, phone_number, address, is_active, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '공장 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
