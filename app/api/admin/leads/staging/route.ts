import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (profileError) return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  if (!profile || !isAdminLike(profile.role)) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { user };
};

const STAGING_SELECT =
  'id, source, source_ref, batch_id, org_name, category, region, homepage, contact_name, role_title, email, phone, kakao_id, dedup_status, dedup_reason, created_at, processed_at';

type ImportRow = {
  org_name?: string; category?: string; region?: string; homepage?: string;
  contact_name?: string; role_title?: string; email?: string; phone?: string; kakao_id?: string;
};

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// ── GET: 스테이징 목록 + 상태별 요약 ────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const batch = url.searchParams.get('batch_id');

    const admin = createAdminClient();
    let q = admin.from('lead_staging').select(STAGING_SELECT).order('created_at', { ascending: false }).limit(2000);
    if (status) q = q.eq('dedup_status', status);
    if (batch) q = q.eq('batch_id', batch);

    const [{ data: rows, error }, { data: allStatus }] = await Promise.all([
      q,
      admin.from('lead_staging').select('dedup_status'),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const summary = { total: 0, new: 0, duplicate: 0, promoted: 0, rejected: 0, needs_review: 0 } as Record<string, number>;
    for (const r of allStatus || []) {
      summary.total++;
      const s = (r as { dedup_status: string }).dedup_status;
      if (s in summary) summary[s]++;
    }
    return NextResponse.json({ rows: rows || [], summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : '스테이징을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST: 행 가져오기(스테이징 적재) + 자동 중복판정 ─────────────────────────
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const source = typeof payload?.source === 'string' && payload.source.trim() ? payload.source.trim() : 'csv';
    const rows: ImportRow[] = Array.isArray(payload?.rows) ? payload.rows : [];
    if (rows.length === 0) return NextResponse.json({ error: '가져올 행이 없습니다.' }, { status: 400 });
    if (rows.length > 5000) return NextResponse.json({ error: '한 번에 최대 5000행까지 가능합니다.' }, { status: 400 });

    const batchId = typeof payload?.batch_id === 'string' && payload.batch_id.trim()
      ? payload.batch_id.trim()
      : `${source}-${Date.now()}`;

    const inserts = rows
      .map((r) => ({
        source,
        batch_id: batchId,
        raw: r as Record<string, unknown>,
        org_name: clean(r.org_name),
        category: clean(r.category),
        region: clean(r.region),
        homepage: clean(r.homepage),
        contact_name: clean(r.contact_name),
        role_title: clean(r.role_title),
        email: clean(r.email),
        phone: clean(r.phone),
        kakao_id: clean(r.kakao_id),
        created_by: authResult.user.id,
      }))
      // 이름/이메일/전화/단체 중 최소 하나는 있어야 의미있는 행
      .filter((r) => r.contact_name || r.email || r.phone || r.org_name);

    if (inserts.length === 0) return NextResponse.json({ error: '유효한 데이터가 있는 행이 없습니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { error: insErr } = await admin.from('lead_staging').insert(inserts);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // 중복/제외 자동 판정
    const { data: classify, error: clsErr } = await admin.rpc('lead_classify_staging', { p_batch: batchId });
    if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 });

    const summary = Array.isArray(classify) ? classify[0] : classify;
    return NextResponse.json({ batch_id: batchId, inserted: inserts.length, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : '가져오기에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE: 스테이징 폐기 (배치 또는 단건, 승격된 행 제외) ────────────────────
export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const batch = url.searchParams.get('batch_id');
    if (!id && !batch) return NextResponse.json({ error: 'id 또는 batch_id가 필요합니다.' }, { status: 400 });

    const admin = createAdminClient();
    let q = admin.from('lead_staging').delete().neq('dedup_status', 'promoted');
    if (id) q = q.eq('id', id);
    if (batch) q = q.eq('batch_id', batch);
    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '폐기에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
