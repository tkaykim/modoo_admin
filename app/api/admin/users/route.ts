import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const allowedRoles = new Set(['customer', 'admin', 'factory', 'super_admin']);

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, manufacturer_id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 403 });
    }

    if (!profile || !isBackofficeOperatorRole(profile.role)) {
      return NextResponse.json({ error: '관리자 또는 공장 권한이 필요합니다.' }, { status: 403 });
    }
    const url = new URL(request.url);
    const role = url.searchParams.get('role') || 'all';
    const search = url.searchParams.get('search')?.trim() || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let manufacturerId = url.searchParams.get('factoryId');

    // Factory users can only see users from their own factory
    if (profile.role === 'factory') {
      manufacturerId = profile.manufacturer_id;
      if (!manufacturerId) {
        // A factory user must have a manufacturer_id assigned
        return NextResponse.json({ data: [], total: 0, page, limit, totalPages: 0 });
      }
    }

    const adminClient = createAdminClient();

    if (role !== 'all' && !allowedRoles.has(role)) {
      return NextResponse.json({ error: '유효하지 않은 사용자 권한입니다.' }, { status: 400 });
    }

    // Get total count
    let countQuery = adminClient
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (role !== 'all') countQuery = countQuery.eq('role', role);
    if (manufacturerId) countQuery = countQuery.eq('manufacturer_id', manufacturerId);
    if (search) countQuery = countQuery.or(`email.ilike.%${search}%,name.ilike.%${search}%,phone_number.ilike.%${search}%`);

    const { count, error: countError } = await countQuery;

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    // Get paginated data
    let dataQuery = adminClient
      .from('profiles')
      .select('id, email, name, phone_number, role, manufacturer_id, created_at, updated_at');

    if (role !== 'all') dataQuery = dataQuery.eq('role', role);
    if (manufacturerId) dataQuery = dataQuery.eq('manufacturer_id', manufacturerId);
    if (search) dataQuery = dataQuery.or(`email.ilike.%${search}%,name.ilike.%${search}%,phone_number.ilike.%${search}%`);

    const { data, error } = await dataQuery
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '사용자 목록을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 403 });
    }

    if (!profile || (!isAdminLike(profile.role))) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const userId = payload?.userId;
    const role = payload?.role;
    const manufacturerId = payload?.factoryId;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: '사용자 ID가 필요합니다.' }, { status: 400 });
    }

    if (role !== undefined) {
      if (!role || typeof role !== 'string' || !allowedRoles.has(role)) {
        return NextResponse.json({ error: '유효하지 않은 사용자 권한입니다.' }, { status: 400 });
      }
    }

    const adminClient = createAdminClient();
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (role !== undefined) {
      updateData.role = role;
      if (role !== 'factory') {
        updateData.manufacturer_id = null;
      }
    }

    if (manufacturerId !== undefined) {
      if (manufacturerId !== null && typeof manufacturerId !== 'string') {
        return NextResponse.json({ error: '공장 ID 형식이 올바르지 않습니다.' }, { status: 400 });
      }
      if (manufacturerId) {
        const { data: manufacturer, error: manufacturerError } = await adminClient
          .from('manufacturers')
          .select('id')
          .eq('id', manufacturerId)
          .single();

        if (manufacturerError || !manufacturer) {
          return NextResponse.json({ error: '공장을 찾을 수 없습니다.' }, { status: 400 });
        }
      }
      updateData.manufacturer_id = manufacturerId || null;
    }

    if (Object.keys(updateData).length === 1) {
      return NextResponse.json({ error: '업데이트할 항목이 없습니다.' }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select('id, email, name, phone_number, role, manufacturer_id, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '사용자 권한 변경에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
