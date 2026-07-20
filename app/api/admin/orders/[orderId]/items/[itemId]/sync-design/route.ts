import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { writeBackConfirmedDesign } from '@/lib/designWriteBack';

// 주문 상품의 현재 아트워크(스냅샷)를 고객 '내 디자인'(saved_designs)에 수동 반영.
// 고객 시안확정 시 자동 write-back(modoo_app confirm-design)과 동일 로직 —
// 전화 확정 대행, 과거 확정 건 소급 반영 등 관리자가 명시적으로 밀어넣는 용도.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderId: string; itemId: string }> }
) {
  try {
    const { orderId, itemId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !isAdminLike(profile.role)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // itemId가 해당 주문 소속인지 검증
    const { data: item, error: itemError } = await adminClient
      .from('order_items')
      .select('id, order_id')
      .eq('id', itemId)
      .eq('order_id', orderId)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: '주문 상품을 찾을 수 없습니다.' }, { status: 404 });
    }

    const result = await writeBackConfirmedDesign(adminClient, itemId);

    if (result.action === 'skipped') {
      const reasonMap: Record<string, string> = {
        guest_order: '비회원 주문이라 고객 디자인함이 없습니다.',
        no_canvas_state: '반영할 디자인(캔버스)이 없습니다.',
        no_product: '제품 정보가 없어 반영할 수 없습니다.',
        order_item_not_found: '주문 상품을 찾을 수 없습니다.',
      };
      return NextResponse.json({
        data: result,
        message: reasonMap[result.reason ?? ''] || '반영이 생략되었습니다.',
      });
    }

    const actionMap: Record<string, string> = {
      updated: '고객 디자인을 최신 확정본으로 갱신했습니다.',
      copied: '고객이 원본을 수정한 상태라 "제작 확정본" 사본을 새로 만들었습니다.',
      created: '고객 디자인함에 확정본을 새로 저장했습니다.',
      stamped: '이미 최신 상태라 확정 스탬프만 갱신했습니다.',
    };

    return NextResponse.json({
      data: result,
      message: actionMap[result.action] || '반영했습니다.',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '고객 디자인 반영에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
