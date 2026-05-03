import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendInvoiceEmail } from '@/lib/send-invoice-email';
import { computeInvoiceTotals, normalizeInvoiceItems } from '@/lib/invoice-payload';
import type { InvoiceItem } from '@/types/types';

export const maxDuration = 60;

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

export async function POST(
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
      attach_invoice,
      attach_pdf,
      attach_business_registration,
      attach_bank_account,
    } = payload as {
      include_vat: boolean;
      items: InvoiceItem[];
      recipient_org?: string;
      recipient_name?: string;
      recipient_email: string;
      memo?: string;
      attach_invoice?: boolean;
      attach_pdf?: boolean;
      attach_business_registration?: boolean;
      attach_bank_account?: boolean;
    };

    if (!recipient_email || typeof recipient_email !== 'string') {
      return NextResponse.json({ error: '이메일 주소가 필요합니다.' }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '최소 1개 이상의 항목이 필요합니다.' }, { status: 400 });
    }

    const attachInvoice = attach_invoice !== false;
    const attachPdf = attach_pdf !== false;
    if (!attachInvoice && !attachPdf && !attach_business_registration && !attach_bank_account) {
      return NextResponse.json({ error: '최소 1개 이상의 발송 항목을 선택해주세요.' }, { status: 400 });
    }

    const normalized = normalizeInvoiceItems(items).filter((i) => i.name.length > 0);
    if (normalized.length === 0) {
      return NextResponse.json({ error: '품목명이 있는 항목이 최소 1개 필요합니다.' }, { status: 400 });
    }

    const { subtotal, vatAmount, totalAmount } = computeInvoiceTotals(!!include_vat, normalized);
    const now = new Date();

    const adminClient = createAdminClient();

    const { data: existing, error: fetchError } = await adminClient
      .from('invoices')
      .select('id, invoice_number')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: '거래명세서를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: invoice, error: updateError } = await adminClient
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

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { emailSent, pdfAttachmentFailed } = await sendInvoiceEmail(adminClient, {
      invoiceNumber: existing.invoice_number,
      statementDate: now,
      includeVat: !!include_vat,
      items: normalized,
      subtotal,
      vatAmount,
      totalAmount,
      recipientOrg: recipient_org?.trim() || null,
      recipientName: recipient_name?.trim() || null,
      recipientEmail: recipient_email.trim(),
      memo: memo?.trim() || null,
      attach_invoice,
      attach_pdf,
      attach_business_registration,
      attach_bank_account,
    });

    if (!emailSent) {
      return NextResponse.json(
        {
          data: invoice,
          warning: '내용은 저장되었으나 이메일 재발송에 실패했습니다.',
        },
        { status: 200 },
      );
    }

    const sentAt = now.toISOString();
    const { data: invoiceAfterSend, error: sentAtError } = await adminClient
      .from('invoices')
      .update({ sent_at: sentAt })
      .eq('id', id)
      .select()
      .single();

    const finalInvoice = !sentAtError && invoiceAfterSend ? invoiceAfterSend : { ...invoice, sent_at: sentAt };

    if (pdfAttachmentFailed) {
      return NextResponse.json({
        data: finalInvoice,
        warning:
          '메일은 발송되었으나 거래명세표 PDF 생성에 실패해 PDF 첨부가 없습니다. 배포 환경(Chromium 번들·함수 제한 시간)을 확인해 주세요.',
      });
    }

    return NextResponse.json({ data: finalInvoice });
  } catch (error) {
    const message = error instanceof Error ? error.message : '재발송에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
