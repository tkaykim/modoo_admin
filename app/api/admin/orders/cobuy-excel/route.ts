import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

type CoBuyCustomField = {
  id?: string;
  label?: string;
  fixed?: boolean;
};

const requireAdminOrFactory = async () => {
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
    .select('role, manufacturer_id')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  }

  if (!profile || (!isBackofficeOperatorRole(profile.role))) {
    return { error: NextResponse.json({ error: '권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user, profile };
};

const parseCustomFields = (value: unknown): CoBuyCustomField[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value as CoBuyCustomField[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as CoBuyCustomField[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const parseFieldResponses = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
};

const formatTimestamp = (value: unknown) => {
  if (!value || typeof value !== 'string') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
};

const paymentStatusLabels: Record<string, string> = {
  pending: '대기',
  completed: '완료',
  failed: '실패',
  refunded: '환불',
};

export async function GET(request: Request) {
  try {
    const authResult = await requireAdminOrFactory();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: '주문 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, cobuy_session_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message || '주문을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (authResult.profile.role === 'factory') {
      if (!authResult.profile.manufacturer_id) {
        return NextResponse.json({ error: '공장 정보가 필요합니다.' }, { status: 403 });
      }
      const { data: factoryItems, error: factoryItemsError } = await adminClient
        .from('order_items')
        .select('id')
        .eq('order_id', orderId)
        .eq('assigned_manufacturer_id', authResult.profile.manufacturer_id)
        .limit(1);

      if (factoryItemsError || !factoryItems || factoryItems.length === 0) {
        return NextResponse.json({ error: '이 주문에 대한 권한이 없습니다.' }, { status: 403 });
      }
    }

    const { data: session, error: sessionError } = order.cobuy_session_id
      ? await adminClient
          .from('cobuy_sessions')
          .select('id, title, custom_fields')
          .eq('id', order.cobuy_session_id)
          .maybeSingle()
      : await adminClient
          .from('cobuy_sessions')
          .select('id, title, custom_fields')
          .eq('bulk_order_id', orderId)
          .maybeSingle();

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ error: '공동구매 주문이 아닙니다.' }, { status: 404 });
    }

    const { data: participants, error: participantError } = await adminClient
      .from('cobuy_participants')
      .select('id, name, email, phone, field_responses, selected_size, payment_status, payment_amount, paid_at, joined_at')
      .eq('cobuy_session_id', session.id)
      .eq('payment_status', 'completed')
      .order('joined_at', { ascending: true });

    if (participantError) {
      return NextResponse.json({ error: participantError.message }, { status: 500 });
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ error: '결제 완료된 참여자가 없습니다.' }, { status: 400 });
    }

    const customFields = parseCustomFields(session.custom_fields);
    const exportFields = customFields.filter(
      (field) => typeof field.id === 'string' && field.id.length > 0 && field.id !== 'size-dropdown-fixed'
    );

    const headerLabels: string[] = [
      '참여자 ID',
      '이름',
      '이메일',
      '전화번호',
      '사이즈',
      '결제 상태',
      '결제 금액',
      '결제 일시',
      '참여 일시',
    ];

    const seenHeaders = new Map<string, number>();
    const resolvedFieldHeaders = exportFields.map((field) => {
      const base = (field.label || field.id || '').trim() || '응답';
      const count = (seenHeaders.get(base) || 0) + 1;
      seenHeaders.set(base, count);
      return count === 1 ? base : `${base} (${field.id})`;
    });

    const sheetHeader = [...headerLabels, ...resolvedFieldHeaders];
    const rows = participants.map((participant) => {
      const responses = parseFieldResponses(participant.field_responses);

      const baseRow: Array<string | number> = [
        participant.id,
        participant.name,
        participant.email,
        participant.phone || '',
        participant.selected_size || '',
        paymentStatusLabels[participant.payment_status] || participant.payment_status || '',
        typeof participant.payment_amount === 'number' ? participant.payment_amount : participant.payment_amount ?? '',
        formatTimestamp(participant.paid_at),
        formatTimestamp(participant.joined_at),
      ];

      const customValues = exportFields.map((field) => {
        if (!field.id) return '';
        const value = responses[field.id];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        }
        return JSON.stringify(value);
      });

      return [...baseRow, ...customValues];
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('participants');

    worksheet.addRow(sheetHeader);
    rows.forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `cobuy-order-${orderId}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=\"${filename}\"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '엑셀 다운로드에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
