import type { SupabaseClient } from '@supabase/supabase-js';
import { sendGmailEmail, type GmailAttachment } from '@/lib/gmail';
import { renderInvoicePdfBuffer } from '@/lib/invoice-html-to-pdf';
import { fetchCompanySealBuffer } from '@/lib/company-seal';
import { INVOICE_SUPPLIER, type InvoiceEmailParams } from '@/lib/invoice-email';
import type { InvoiceItem } from '@/types/types';
import { formatKstDateOnly } from '@/lib/kst';

export type SendInvoiceEmailInput = {
  invoiceNumber: string;
  /** 명세표·PDF에 표시할 일자 */
  statementDate: Date;
  includeVat: boolean;
  items: InvoiceItem[];
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  recipientOrg: string | null;
  recipientName: string | null;
  recipientEmail: string;
  memo: string | null;
  attach_invoice?: boolean;
  attach_pdf?: boolean;
  attach_business_registration?: boolean;
  attach_bank_account?: boolean;
};

export async function sendInvoiceEmail(
  adminClient: SupabaseClient,
  input: SendInvoiceEmailInput,
): Promise<{ emailSent: boolean; pdfAttachmentFailed: boolean }> {
  const {
    invoiceNumber,
    statementDate,
    includeVat,
    items,
    subtotal,
    vatAmount,
    totalAmount,
    recipientOrg,
    recipientName,
    recipientEmail,
    memo,
    attach_invoice,
    attach_pdf,
    attach_business_registration,
    attach_bank_account,
  } = input;

  const dateStr = formatKstDateOnly(statementDate);

  const pdfParams: InvoiceEmailParams = {
    invoiceNumber,
    date: dateStr,
    includeVat: !!includeVat,
    items,
    subtotal,
    vatAmount,
    totalAmount,
    recipientOrg,
    recipientName,
    memo,
  };

  const sealBuffer = await fetchCompanySealBuffer(adminClient);
  if (sealBuffer) {
    pdfParams.companySealImageSrc = `data:image/png;base64,${sealBuffer.toString('base64')}`;
  }

  const orgTrim = recipientOrg?.trim() || null;
  const nameTrim = recipientName?.trim() || null;
  const recipientDisplay = [orgTrim, nameTrim].filter(Boolean).join(' ');
  const greeting = recipientDisplay ? `${recipientDisplay}님, 안녕하세요.` : '안녕하세요.';

  const includeInvoiceBody = attach_invoice !== false;

  const html = `
<div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <div style="background: #1e3a5f; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 18px;">모두의 유니폼</h2>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
    <p style="margin: 0 0 16px; color: #374151; font-size: 15px;">${greeting}</p>
    <p style="margin: 0 0 16px; color: #374151;">모두의 유니폼 거래명세서 전달드립니다.</p>
    <p style="margin: 0 0 16px; color: #374151;">첨부된 PDF 파일을 확인해 주세요.</p>
    <table style="margin: 16px 0 20px; border-collapse: collapse;">
      <tr><td style="padding: 4px 12px 4px 0; color: #6b7280; font-size: 13px;">상호</td><td style="padding: 4px 0; color: #374151; font-size: 13px; font-weight: 600;">${INVOICE_SUPPLIER.tradeName}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #6b7280; font-size: 13px;">대표자</td><td style="padding: 4px 0; color: #374151; font-size: 13px; font-weight: 600;">${INVOICE_SUPPLIER.representative}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #6b7280; font-size: 13px;">사업자등록번호</td><td style="padding: 4px 0; color: #374151; font-size: 13px;">${INVOICE_SUPPLIER.registrationNo}</td></tr>
      <tr><td style="padding: 4px 12px 4px 0; color: #6b7280; font-size: 13px;">연락처</td><td style="padding: 4px 0; color: #374151; font-size: 13px;">modoogoods.com</td></tr>
    </table>
    <p style="margin: 0 0 4px; color: #374151; font-size: 13px;">감사합니다.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">본 메일은 모두의 유니폼에서 발송되었습니다.</p>
  </div>
</div>`;

  const text = [
    greeting,
    '',
    '모두의 유니폼 거래명세서 전달드립니다.',
    '첨부된 PDF 파일을 확인해 주세요.',
    '',
    `상호: ${INVOICE_SUPPLIER.tradeName}`,
    `대표자: ${INVOICE_SUPPLIER.representative}`,
    `사업자등록번호: ${INVOICE_SUPPLIER.registrationNo}`,
    '',
    '감사합니다.',
    '',
    '---',
    '본 메일은 모두의 유니폼에서 발송되었습니다.',
  ].join('\n');

  const attachments: GmailAttachment[] = [];

  const docTypesToAttach: string[] = [];
  if (attach_business_registration) docTypesToAttach.push('business_registration');
  if (attach_bank_account) docTypesToAttach.push('bank_account');

  if (docTypesToAttach.length > 0) {
    const { data: docs } = await adminClient
      .from('admin_documents')
      .select('doc_type, file_name, file_url')
      .in('doc_type', docTypesToAttach);

    if (docs) {
      for (const doc of docs) {
        try {
          const res = await fetch(doc.file_url);
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            attachments.push({
              filename: doc.file_name,
              content: buffer,
              contentType: res.headers.get('content-type') || undefined,
            });
          }
        } catch {
          console.error(`Failed to download attachment: ${doc.file_name}`);
        }
      }
    }
  }

  const wantPdf = attach_pdf !== false && (includeInvoiceBody || attach_pdf === true);
  let pdfAttachmentFailed = false;
  if (wantPdf) {
    const pdfBuf = await renderInvoicePdfBuffer(pdfParams);
    if (pdfBuf) {
      attachments.push({
        filename: `거래명세표-${invoiceNumber}.pdf`,
        content: pdfBuf,
        contentType: 'application/pdf',
      });
    } else {
      pdfAttachmentFailed = true;
      console.error(
        '[invoices] PDF 생성 실패 — 첨부 생략. Vercel이면 chromium bin 추적·maxDuration·런타임 로그를 확인하세요.',
      );
    }
  }

  const emailSent = await sendGmailEmail({
    to: [{ email: recipientEmail.trim(), name: nameTrim || undefined }],
    subject: includeInvoiceBody
      ? `[모두의 유니폼] 거래명세서 (${invoiceNumber})`
      : `[모두의 유니폼] 서류 전달 (${invoiceNumber})`,
    html,
    text,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  return { emailSent, pdfAttachmentFailed };
}
