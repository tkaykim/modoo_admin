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

interface LocalDataRow {
  bplcNm?: string;       // 사업장명(상호)
  siteTel?: string;      // 소재지전화
  rdnWhlAddr?: string;   // 도로명전체주소
  siteWhlAddr?: string;  // 지번전체주소
  trdStateGbn?: string;  // 영업상태코드 (01=영업/정상)
  trdStateNm?: string;   // 영업상태명
  apvPermYmd?: string;   // 인허가일자
  opnSvcNm?: string;     // 개방서비스명(업종)
  mgtNo?: string;        // 관리번호
}

const CATEGORIES = ['학교', '기업', '동호회', '매장', '댄스', '기타'];

// ── POST: 지방행정 인허가(LocalData) API → lead_staging 적재 + 중복판정 ────────
// body: { opnSvcId, localCode?, category?, pageIndex?, pageSize? }
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const key = process.env.LOCALDATA_API_KEY;
    if (!key) {
      return NextResponse.json(
        {
          error: 'LocalData API 키가 설정되지 않았습니다.',
          hint: 'localdata.go.kr 개발자센터 → API 신청 후 인증키를 modoo_admin/.env.local 의 LOCALDATA_API_KEY 에 추가하세요.',
          needsKey: true,
        },
        { status: 400 }
      );
    }

    const payload = await request.json().catch(() => null);
    const opnSvcId = typeof payload?.opnSvcId === 'string' ? payload.opnSvcId.trim() : '';
    const localCode = typeof payload?.localCode === 'string' ? payload.localCode.trim() : '';
    const category = CATEGORIES.includes(payload?.category) ? payload.category : null;
    const pageIndex = Number(payload?.pageIndex ?? 1) || 1;
    const pageSize = Math.min(Number(payload?.pageSize ?? 100) || 100, 500);
    if (!opnSvcId) return NextResponse.json({ error: '업종 코드(opnSvcId)가 필요합니다.' }, { status: 400 });

    const params = new URLSearchParams({
      authKey: key, resultType: 'json', opnSvcId,
      pageIndex: String(pageIndex), pageSize: String(pageSize),
    });
    if (localCode) params.set('localCode', localCode);

    const res = await fetch(`https://www.localdata.go.kr/platform/rest/GR0/openDataApi?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    const json = await res.json().catch(() => null);

    // 응답 구조 방어적 파싱: result.body.rows[0].row[]
    const rows: LocalDataRow[] =
      json?.result?.body?.rows?.[0]?.row ||
      json?.result?.body?.rows?.row ||
      json?.result?.rows?.[0]?.row ||
      [];
    const processMsg = json?.result?.header?.process?.message || json?.result?.header?.RESULT?.message;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'LocalData 결과가 없습니다.', localdataMessage: processMsg },
        { status: 200 }
      );
    }

    // 영업중(trdStateGbn=01)만, 상호+연락처 있는 행만
    const active = rows.filter(
      (r) => (!r.trdStateGbn || r.trdStateGbn === '01') && (r.bplcNm || r.siteTel)
    );

    const batchId = `localdata-${opnSvcId}-${localCode || 'all'}-${Date.now()}`;
    const admin = createAdminClient();

    // 멱등: 이미 적재된 mgtNo 제외
    const refs = active.map((r) => (r.mgtNo ? `${opnSvcId}_${r.mgtNo}` : null)).filter(Boolean) as string[];
    let existingSet = new Set<string>();
    if (refs.length > 0) {
      const { data: existing } = await admin
        .from('lead_staging')
        .select('source_ref')
        .eq('source', 'localdata')
        .in('source_ref', refs);
      existingSet = new Set((existing || []).map((e) => (e as { source_ref: string }).source_ref));
    }

    const inserts = active
      .map((r) => {
        const ref = r.mgtNo ? `${opnSvcId}_${r.mgtNo}` : null;
        return { r, ref };
      })
      .filter(({ ref }) => !ref || !existingSet.has(ref))
      .map(({ r, ref }) => ({
        source: 'localdata',
        source_ref: ref,
        batch_id: batchId,
        raw: r as Record<string, unknown>,
        org_name: r.bplcNm?.trim() || null,
        category,
        region: null,
        address: r.rdnWhlAddr || r.siteWhlAddr ? { raw: (r.rdnWhlAddr || r.siteWhlAddr)!.trim() } : null,
        phone: r.siteTel?.trim() || null,
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
      active: active.length,
      inserted,
      skipped_existing: active.length - inserted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LocalData 가져오기에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
