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

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const manufacturerId = url.searchParams.get('manufacturerId') || url.searchParams.get('manufacturer_id');
    const includeInactive = url.searchParams.get('includeInactive') === 'true';

    if (!manufacturerId) {
      return NextResponse.json({ error: 'manufacturerId가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    let query = adminClient
      .from('manufacturer_colors')
      .select('*')
      .eq('manufacturer_id', manufacturerId);

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 데이터를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const { manufacturer_id, name, hex, color_code, label, is_active, sort_order } = body;

    if (!manufacturer_id) {
      return NextResponse.json({ error: 'manufacturer_id가 필요합니다.' }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: '색상명을 입력해주세요.' }, { status: 400 });
    }
    if (!hex?.trim()) {
      return NextResponse.json({ error: 'HEX 색상 코드를 입력해주세요.' }, { status: 400 });
    }
    if (!color_code?.trim()) {
      return NextResponse.json({ error: '색상 코드를 입력해주세요.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('manufacturer_colors')
      .insert({
        manufacturer_id,
        name: name.trim(),
        hex: hex.trim(),
        color_code: color_code.trim(),
        label: label?.trim() || null,
        is_active: is_active ?? true,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const { id, name, hex, color_code, label, is_active, sort_order } = body;

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (hex !== undefined) updates.hex = hex.trim();
    if (color_code !== undefined) updates.color_code = color_code.trim();
    if (label !== undefined) updates.label = label?.trim() || null;
    if (is_active !== undefined) updates.is_active = is_active;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '업데이트할 필드가 없습니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('manufacturer_colors')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 업데이트에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('manufacturer_colors')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '색상 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}