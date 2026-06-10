import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { trackCargo } from '@/lib/logen';

// 수동 접수건들의 배송 추적 (배송완료 발견 시 status=delivered 자동 전환)
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
    const adminClient = createAdminClient();
    let trackingNumbers: string[] = [];
    if (Array.isArray(ids) && ids.length > 0) {
      const { data } = await adminClient.from('manual_shipments').select('id, tracking_number').in('id', ids).not('tracking_number', 'is', null);
      trackingNumbers = (data || []).map((r) => r.tracking_number).filter(Boolean) as string[];
    }
    if (trackingNumbers.length === 0) {
      return NextResponse.json({ error: '추적할 송장번호가 없습니다.' }, { status: 400 });
    }

    const result = await trackCargo(trackingNumbers);
    if (result.sttsCd === 'FAIL') return NextResponse.json({ error: result.sttsMsg, logenResponse: result }, { status: 500 });

    const delivered: string[] = [];
    if (Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item.resultCd === 'TRUE' && Array.isArray(item.data1)) {
          const last = item.data1[item.data1.length - 1];
          if (last?.statNm?.includes('배송완료')) delivered.push(item.slipNo);
        }
      }
    }
    if (delivered.length > 0) {
      await adminClient.from('manual_shipments').update({ status: 'delivered' }).in('tracking_number', delivered).eq('status', 'shipping');
    }

    return NextResponse.json({ data: { tracking: result.data, deliveredCount: delivered.length } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '추적 실패' }, { status: 500 });
  }
}
