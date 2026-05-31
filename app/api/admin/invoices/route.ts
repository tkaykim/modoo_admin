import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendInvoiceEmail } from '@/lib/send-invoice-email';
import type { InvoiceItem, InvoiceDocumentType, InvoiceRecipientBusiness, CashReceiptMethod } from '@/types/types';
import { computeInvoiceTotalsByMode } from '@/lib/invoice-payload';
import { getKstYYYYMMDD } from '@/lib/kst';

const VALID_DOC_TYPES: InvoiceDocumentType[] = ['transaction_statement', 'tax_invoice', 'cash_receipt'];

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

function generateInvoiceNumber(): string {
  const ymd = getKstYYYYMMDD();
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `INV-${ymd}-${rand}`;
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    const adminClient = createAdminClient();

    const { count } = await adminClient
      .from('invoices')
      .select('*', { count: 'exact', head: true });

    const { data, error } = await adminClient
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [], total: count || 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '거래명세서 목록을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

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
      document_type,
      order_id,
      recipient_business,
      cash_receipt_method,
      cash_receipt_identifier,
      vat_mode,
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
      document_type?: InvoiceDocumentType;
      order_id?: string;
      recipient_business?: InvoiceRecipientBusiness | null;
      cash_receipt_method?: CashReceiptMethod | null;
      cash_receipt_identifier?: string | null;
      vat_mode?: 'none' | 'exclusive' | 'inclusive';
      attach_invoice?: boolean;
      attach_pdf?: boolean;
      attach_business_registration?: boolean;
      attach_bank_account?: boolean;
    };

    const documentType: InvoiceDocumentType = VALID_DOC_TYPES.includes(document_type as InvoiceDocumentType)
      ? (document_type as InvoiceDocumentType)
      : 'transaction_statement';

    if (!recipient_email || typeof recipient_email !== 'string') {
      return NextResponse.json({ error: '이메일 주소가 필요합니다.' }, { status: 400 });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '최소 1개 이상의 항목이 필요합니다.' }, { status: 400 });
    }

    // 문서 종류별 최소 검증
    if (documentType === 'tax_invoice' && !recipient_business?.biz_no?.trim()) {
      return NextResponse.json({ error: '세금계산서는 공급받는자 사업자등록번호가 필요합니다.' }, { status: 400 });
    }
    if (documentType === 'cash_receipt' && (!cash_receipt_method || !cash_receipt_identifier?.trim())) {
      return NextResponse.json({ error: '현금영수증은 발급수단과 식별번호가 필요합니다.' }, { status: 400 });
    }

    // 부가세 계산 모드: 명시값 우선, 없으면 기존 동작(include_vat ? 'exclusive' : 'none')
    const vatMode: 'none' | 'exclusive' | 'inclusive' =
      vat_mode || (include_vat ? 'exclusive' : 'none');
    const { subtotal, vatAmount, totalAmount } = computeInvoiceTotalsByMode(items, vatMode);
    const effectiveIncludeVat = vatMode !== 'none';

    const invoiceNumber = generateInvoiceNumber();
    const now = new Date();

    const adminClient = createAdminClient();
    const { data: invoice, error: insertError } = await adminClient
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        document_type: documentType,
        order_id: order_id || null,
        status: 'sent',
        include_vat: effectiveIncludeVat,
        items,
        subtotal,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        recipient_org: recipient_org?.trim() || null,
        recipient_name: recipient_name?.trim() || null,
        recipient_email: recipient_email.trim(),
        recipient_business: documentType === 'tax_invoice' ? (recipient_business || null) : null,
        cash_receipt_method: documentType === 'cash_receipt' ? (cash_receipt_method || null) : null,
        cash_receipt_identifier: documentType === 'cash_receipt' ? (cash_receipt_identifier?.trim() || null) : null,
        issue_date: now.toISOString(),
        memo: memo?.trim() || null,
        sent_at: now.toISOString(),
        created_at: now.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { emailSent, pdfAttachmentFailed } = await sendInvoiceEmail(adminClient, {
      invoiceNumber,
      statementDate: now,
      includeVat: effectiveIncludeVat,
      items,
      subtotal,
      vatAmount,
      totalAmount,
      recipientOrg: recipient_org?.trim() || null,
      recipientName: recipient_name?.trim() || null,
      recipientEmail: recipient_email.trim(),
      memo: memo?.trim() || null,
      documentType,
      recipientBusiness: documentType === 'tax_invoice' ? (recipient_business || null) : null,
      cashReceiptMethod: documentType === 'cash_receipt' ? (cash_receipt_method || null) : null,
      cashReceiptIdentifier: documentType === 'cash_receipt' ? (cash_receipt_identifier?.trim() || null) : null,
      attach_invoice,
      attach_pdf,
      attach_business_registration,
      attach_bank_account,
    });

    if (!emailSent) {
      return NextResponse.json(
        { data: invoice, warning: '거래명세서가 저장되었으나 이메일 발송에 실패했습니다.' },
        { status: 200 },
      );
    }

    if (pdfAttachmentFailed) {
      return NextResponse.json({
        data: invoice,
        warning:
          '메일은 발송되었으나 거래명세표 PDF 생성에 실패해 PDF 첨부가 없습니다. 배포 환경(Chromium 번들·함수 제한 시간)을 확인해 주세요.',
      });
    }

    return NextResponse.json({ data: invoice });
  } catch (error) {
    const message = error instanceof Error ? error.message : '거래명세서 발송에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
