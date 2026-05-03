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

const requireAdmin = async () => {
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
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  }

  if (!profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
};

const paymentStatusLabels: Record<string, string> = {
  pending: '대기',
  completed: '완료',
  failed: '실패',
  refunded: '환불',
};

const formatTimestamp = (value: unknown) => {
  if (!value || typeof value !== 'string') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: '세션 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: session, error: sessionError } = await adminClient
      .from('cobuy_sessions')
      .select('id, title, custom_fields')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: participants, error: participantError } = await adminClient
      .from('cobuy_participants')
      .select('name, email, phone, field_responses, selected_size, payment_status, payment_amount, joined_at')
      .eq('cobuy_session_id', sessionId)
      .order('joined_at', { ascending: true });

    if (participantError) {
      return NextResponse.json({ error: participantError.message }, { status: 500 });
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ error: '참여자가 없습니다.' }, { status: 400 });
    }

    const customFields: CoBuyCustomField[] = Array.isArray(session.custom_fields)
      ? session.custom_fields
      : [];
    const fieldMap = new Map(
      customFields
        .filter((f): f is CoBuyCustomField & { id: string } => !!f.id)
        .map((f) => [f.id, f.label || f.id])
    );

    // Collect all unique field response keys
    const fieldKeys: string[] = [];
    const seen = new Set<string>();
    for (const p of participants) {
      const responses = p.field_responses && typeof p.field_responses === 'object'
        ? (p.field_responses as Record<string, unknown>)
        : {};
      for (const key of Object.keys(responses)) {
        if (!seen.has(key)) {
          seen.add(key);
          fieldKeys.push(key);
        }
      }
    }

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('참여자 목록');

    ws.columns = [
      { header: '이름', key: 'name', width: 15 },
      { header: '이메일', key: 'email', width: 25 },
      { header: '연락처', key: 'phone', width: 15 },
      { header: '사이즈', key: 'size', width: 10 },
      { header: '결제 상태', key: 'paymentStatus', width: 12 },
      { header: '결제 금액', key: 'paymentAmount', width: 15 },
      ...fieldKeys.map((key) => ({
        header: fieldMap.get(key) || key,
        key,
        width: 18,
      })),
      { header: '참여일', key: 'joinedAt', width: 20 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } };

    for (const p of participants) {
      const responses = p.field_responses && typeof p.field_responses === 'object'
        ? (p.field_responses as Record<string, unknown>)
        : {};
      const row: Record<string, unknown> = {
        name: p.name,
        email: p.email,
        phone: p.phone || '',
        size: p.selected_size || '',
        paymentStatus: paymentStatusLabels[p.payment_status] || p.payment_status,
        paymentAmount: p.payment_amount ?? 0,
        joinedAt: formatTimestamp(p.joined_at),
      };
      for (const key of fieldKeys) {
        const val = responses[key];
        row[key] = val !== null && val !== undefined ? String(val) : '';
      }
      ws.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = encodeURIComponent(`${session.title}_참여자목록.xlsx`);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '엑셀 다운로드에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
