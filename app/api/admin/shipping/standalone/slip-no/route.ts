import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { inquirySlipNo } from '@/lib/logen';

// 선택한 수동 접수건들의 송장번호를 로젠에서 가져와 DB에 채움
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !isAdminLike(profile.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ID 배열이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: rows, error } = await adminClient
      .from('manual_shipments')
      .select('id, fix_take_no')
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows || rows.length === 0) return NextResponse.json({ error: '대상 건이 없습니다.' }, { status: 404 });

    const fixTakeNos = rows.map((r) => r.fix_take_no);
    const result = await inquirySlipNo(fixTakeNos);
    if (result.sttsCd === 'FAIL') {
      return NextResponse.json({ error: result.sttsMsg, logenResponse: result }, { status: 500 });
    }

    const updated: Array<{ id: string; fixTakeNo: string; slipNo: string }> = [];
    if (Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item.resultCd === 'TRUE' && Array.isArray(item.data1)) {
          const active = item.data1.find((s: any) => s.delYn !== 'Y');
          if (active?.slipNo) {
            const row = rows.find((r) => r.fix_take_no === item.fixTakeNo);
            if (row) {
              await adminClient
                .from('manual_shipments')
                .update({ tracking_number: active.slipNo, logen_slip_printed: true, status: 'shipping' })
                .eq('id', row.id);
              updated.push({ id: row.id, fixTakeNo: item.fixTakeNo, slipNo: active.slipNo });
            }
          }
        }
      }
    }

    return NextResponse.json({ data: { updated, total: rows.length, logenResponse: result } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '송장번호 조회 실패' }, { status: 500 });
  }
}
