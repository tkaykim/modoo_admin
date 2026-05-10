import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';

interface Body {
  dryRun?: boolean;
  salesmanIds?: string[];
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty body 허용 */
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_URL 또는 SERVICE_ROLE_KEY 가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  const fnUrl = `${supabaseUrl}/functions/v1/monthly-grade-reevaluation`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      dryRun: body.dryRun === true,
      salesmanIds: body.salesmanIds ?? undefined,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: '재평가 함수 호출 실패', detail: payload },
      { status: res.status }
    );
  }
  return NextResponse.json(payload);
}
