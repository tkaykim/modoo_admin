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

interface NeisSchoolRow {
  SD_SCHUL_CODE?: string;
  SCHUL_NM?: string;
  ATPT_OFCDC_SC_NM?: string;
  ORG_RDNMA?: string;     // 도로명주소
  ORG_TELNO?: string;     // 대표전화
  HMPG_ADRES?: string;    // 홈페이지
  SCHUL_KND_SC_NM?: string;
}

// ── POST: NEIS 학교정보 API → lead_staging 적재 + 중복판정 ────────────────────
// body: { officeCode, schoolKind, pIndex?, pSize? }
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const key = process.env.NEIS_API_KEY;
    if (!key) {
      return NextResponse.json(
        {
          error: 'NEIS API 키가 설정되지 않았습니다.',
          hint: 'open.neis.go.kr 가입 → 인증키 발급 후 modoo_admin/.env.local 에 NEIS_API_KEY 추가하세요.',
          needsKey: true,
        },
        { status: 400 }
      );
    }

    const payload = await request.json().catch(() => null);
    const officeCode = typeof payload?.officeCode === 'string' ? payload.officeCode.trim() : '';
    const schoolKind = typeof payload?.schoolKind === 'string' ? payload.schoolKind.trim() : '';
    const pIndex = Number(payload?.pIndex ?? 1) || 1;
    const pSize = Math.min(Number(payload?.pSize ?? 100) || 100, 1000);
    if (!officeCode) return NextResponse.json({ error: '시도교육청 코드가 필요합니다.' }, { status: 400 });

    const params = new URLSearchParams({
      KEY: key, Type: 'json', pIndex: String(pIndex), pSize: String(pSize),
      ATPT_OFCDC_SC_CODE: officeCode,
    });
    if (schoolKind) params.set('SCHUL_KND_SC_NM', schoolKind);

    const res = await fetch(`https://open.neis.go.kr/hub/schoolInfo?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    const json = await res.json().catch(() => null);

    // NEIS 응답 구조: { schoolInfo: [ {head}, {row:[...]} ] } 또는 { RESULT: {CODE, MESSAGE} }
    const resultCode = json?.RESULT?.CODE || json?.schoolInfo?.[0]?.head?.[1]?.RESULT?.CODE;
    const rows: NeisSchoolRow[] = json?.schoolInfo?.[1]?.row || [];

    if (!rows.length) {
      return NextResponse.json(
        { error: 'NEIS 결과가 없습니다.', neisCode: resultCode, neisMessage: json?.RESULT?.MESSAGE },
        { status: 200 }
      );
    }

    const batchId = `neis_school-${officeCode}-${schoolKind || 'all'}-${Date.now()}`;
    const admin = createAdminClient();

    // 이미 적재된 학교코드 제외(멱등)
    const codes = rows.map((r) => r.SD_SCHUL_CODE).filter(Boolean) as string[];
    const { data: existing } = await admin
      .from('lead_staging')
      .select('source_ref')
      .eq('source', 'neis_school')
      .in('source_ref', codes);
    const existingSet = new Set((existing || []).map((e) => (e as { source_ref: string }).source_ref));

    const inserts = rows
      .filter((r) => r.SD_SCHUL_CODE && !existingSet.has(r.SD_SCHUL_CODE))
      .map((r) => ({
        source: 'neis_school',
        source_ref: r.SD_SCHUL_CODE!,
        batch_id: batchId,
        raw: r as Record<string, unknown>,
        org_name: r.SCHUL_NM?.trim() || null,
        category: '학교',
        region: r.ATPT_OFCDC_SC_NM?.trim() || null,
        address: r.ORG_RDNMA ? { raw: r.ORG_RDNMA.trim() } : null,
        homepage: r.HMPG_ADRES?.trim() || null,
        phone: r.ORG_TELNO?.trim() || null,
        role_title: '대표',
        created_by: authResult.user.id,
      }));

    let inserted = 0;
    if (inserts.length > 0) {
      const { error: insErr } = await admin.from('lead_staging').insert(inserts);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      inserted = inserts.length;
      await admin.rpc('lead_classify_staging', { p_batch: batchId });
    }

    return NextResponse.json({
      batch_id: batchId,
      fetched: rows.length,
      inserted,
      skipped_existing: rows.length - inserted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'NEIS 가져오기에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
