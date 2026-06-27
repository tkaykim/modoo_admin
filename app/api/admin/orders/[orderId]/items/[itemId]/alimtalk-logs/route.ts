import { NextResponse } from 'next/server';
import { isAdminLike } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const PROOF_TEMPLATE =
  '#{고객명}님, 요청하신 디자인 시안이 준비되었습니다.\n' +
  '아래 버튼에서 시안을 확인하신 후 확정을 눌러주세요.\n' +
  '확정하시면 본주문이 확정되어 제작이 진행됩니다.';

function maskPhone(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function replaceVars(template: string, variables: Record<string, unknown>): string {
  return template.replace(/#\{([^}]+)\}/g, (_, key: string) => {
    const direct = variables[key];
    const wrapped = variables[`#{${key}}`];
    return String(direct ?? wrapped ?? `#{${key}}`);
  });
}

function safeVariables(raw: unknown): Record<string, string> {
  const variables = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    const normalizedKey = key.replace(/^#\{/, '').replace(/\}$/, '');
    if (normalizedKey === '토큰') {
      out[normalizedKey] = value ? '(숨김)' : '';
    } else {
      out[normalizedKey] = String(value ?? '');
    }
  }
  return out;
}

function itemIdFromEntityId(entityId: string): string {
  return entityId.split(':')[0] || entityId;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string; itemId: string }> },
) {
  try {
    const { orderId, itemId } = await params;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
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
    const { data: item, error: itemError } = await adminClient
      .from('order_items')
      .select('id, order_id')
      .eq('id', itemId)
      .eq('order_id', orderId)
      .maybeSingle();
    if (itemError || !item) {
      return NextResponse.json({ error: '주문 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 발송 로그는 modoo DB(자기 DB)에 보관 → 어드민이 허브 결합 없이 직접 조회.
    const { data, error } = await adminClient
      .from('modoo_alimtalk_log')
      .select('id,event_type,entity_id,phone,template_key,status,message_id,error,variables,created_at')
      .eq('event_type', 'proof_request')
      .or(`entity_id.eq.${itemId},entity_id.like.${itemId}:%`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const logs = (data ?? [])
      .filter((row: any) => itemIdFromEntityId(String(row.entity_id)) === itemId)
      .map((row: any) => {
        const variables = safeVariables(row.variables);
        const orderNo = variables['주문번호'] || orderId;
        return {
          id: row.id,
          eventType: row.event_type,
          entityId: row.entity_id,
          status: row.status,
          statusText:
            row.status === 'sent' ? '성공' :
            row.status === 'failed' ? '실패' :
            row.status === 'pending' ? '대기중' :
            row.status === 'skipped_no_phone' ? '전화번호 없음' :
            row.status,
          phone: maskPhone(row.phone),
          templateKey: row.template_key,
          messageId: row.message_id,
          error: row.error,
          variables,
          messageText: replaceVars(PROOF_TEMPLATE, variables),
          buttonName: '시안 확인하기',
          buttonUrlPreview: `/order/${orderNo}/design-review?token=(숨김)`,
          createdAt: row.created_at,
        };
      });

    return NextResponse.json({ configured: true, logs });
  } catch (error) {
    console.error('Error fetching alimtalk logs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
