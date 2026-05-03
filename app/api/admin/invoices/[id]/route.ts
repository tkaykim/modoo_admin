import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { computeInvoiceTotals, normalizeInvoiceItems } from '@/lib/invoice-payload';
import type { InvoiceItem } from '@/types/types';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const { id } = await params;
    const adminClient = createAdminClient();

    const { data, error } = await adminClient.from('invoices').select('*').eq('id', id).single();

    if (error || !data) {
      return NextResponse.json({ error: '거래명세서를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '거래명세서를 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const { id } = await params;
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const {
      include_vat,
      items,
      recipient_org,
      recipient_name,
      recipient_email,
      memo,
    } = payload as {
      include_vat: boolean;
      items: InvoiceItem[];
      recipient_org?: string;
      recipient_name?: string;
      recipient_email: string;
      memo?: string;
    };

    if (!recipient_email || typeof recipient_email !== 'string') {
      return NextResponse.json({ error: '이메일 주소가 필요합니다.' }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '최소 1개 이상의 항목이 필요합니다.' }, { status: 400 });
    }

    const normalized = normalizeInvoiceItems(items).filter((i) => i.name.length > 0);
    if (normalized.length === 0) {
      return NextResponse.json({ error: '품목명이 있는 항목이 최소 1개 필요합니다.' }, { status: 400 });
    }

    const { subtotal, vatAmount, totalAmount } = computeInvoiceTotals(!!include_vat, normalized);

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('invoices')
      .update({
        include_vat: !!include_vat,
        items: normalized,
        subtotal,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        recipient_org: recipient_org?.trim() || null,
        recipient_name: recipient_name?.trim() || null,
        recipient_email: recipient_email.trim(),
        memo: memo?.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '거래명세서를 찾을 수 없습니다.' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '저장에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
