import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  if (!profile || !isAdminLike(profile.role)) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { user };
};

const CONTACT_SELECT =
  'id, organization_id, name, role_title, is_primary, email, phone, kakao_id, source, source_detail, status, consent_status, consent_source, consent_at, linked_inquiry_id, linked_chatbot_inquiry_id, last_contacted_at, note, meta, first_seen_at, created_at, updated_at, organization:lead_organizations(id, name, category, region, assigned_salesman_id, partner_mall_id, status)';

const CONTACT_STATUSES = ['new', 'valid', 'contacted', 'responded', 'converted', 'opted_out', 'bounced', 'invalid'];
const CONSENT_STATUSES = ['none', 'opt_in', 'existing_customer'];

// ── GET: 전체 리드(연락처+단체) + 영업사원 목록 ────────────────────────────
export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const admin = createAdminClient();

    const [{ data: contacts, error: cErr }, { data: salesmen, error: sErr }] = await Promise.all([
      admin.from('lead_contacts').select(CONTACT_SELECT).order('first_seen_at', { ascending: false }).limit(5000),
      admin.from('salesman_profiles').select('id, display_name, salesman_code, status').order('display_name'),
    ]);

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    return NextResponse.json({ contacts: contacts || [], salesmen: salesmen || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '리드를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PATCH: 연락처 수정 (opted_out 설정 시 suppression 자동 등록) ────────────
export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const id = payload?.id;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '연락처 ID가 필요합니다.' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (typeof payload.name === 'string') update.name = payload.name.trim() || null;
    if (typeof payload.role_title === 'string') update.role_title = payload.role_title.trim() || null;
    if (typeof payload.kakao_id === 'string') update.kakao_id = payload.kakao_id.trim() || null;
    if (typeof payload.email === 'string') update.email = payload.email.trim() || null;
    if (typeof payload.phone === 'string') update.phone = payload.phone.trim() || null;
    if (typeof payload.note === 'string') update.note = payload.note;
    if (typeof payload.is_primary === 'boolean') update.is_primary = payload.is_primary;
    if (typeof payload.status === 'string') {
      if (!CONTACT_STATUSES.includes(payload.status)) {
        return NextResponse.json({ error: '잘못된 상태값입니다.' }, { status: 400 });
      }
      update.status = payload.status;
    }
    if (typeof payload.consent_status === 'string') {
      if (!CONSENT_STATUSES.includes(payload.consent_status)) {
        return NextResponse.json({ error: '잘못된 동의값입니다.' }, { status: 400 });
      }
      update.consent_status = payload.consent_status;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: '수정할 항목이 없습니다.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // opted_out 으로 변경 시 suppression 목록에 자동 등록(발송 영구 제외).
    // 부가 기능이므로 실패해도 본 업데이트는 진행한다(부분 유니크 인덱스 충돌 방어).
    if (update.status === 'opted_out') {
      try {
        const { data: cur } = await admin
          .from('lead_contacts')
          .select('email, phone')
          .eq('id', id)
          .maybeSingle();
        if (cur && (cur.email || cur.phone)) {
          const orFilters: string[] = [];
          if (cur.email) orFilters.push(`email.eq.${cur.email}`);
          if (cur.phone) orFilters.push(`phone.eq.${cur.phone}`);
          const { data: existing } = await admin
            .from('lead_suppression')
            .select('id')
            .or(orFilters.join(','))
            .limit(1);
          if (!existing || existing.length === 0) {
            await admin.from('lead_suppression').insert({
              email: cur.email ?? null,
              phone: cur.phone ?? null,
              reason: 'unsubscribe',
              source: 'admin_manual',
            });
          }
        }
      } catch {
        // suppression 등록 실패는 무시 — 상태 변경은 계속 진행
      }
    }

    const { data, error } = await admin
      .from('lead_contacts')
      .update(update)
      .eq('id', id)
      .select(CONTACT_SELECT)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '리드 수정에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE: 연락처 삭제 ─────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: '연락처 ID가 필요합니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('lead_contacts').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '리드 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
