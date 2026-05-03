import nodemailer from 'nodemailer';
import { formatKstDateOnly } from '@/lib/kst';

interface GmailRecipient {
  email: string;
  name?: string;
}

export interface GmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  /** 인라인 이미지 (HTML 에서 cid:값 과 동일) */
  cid?: string;
  contentDisposition?: 'inline' | 'attachment';
}

interface SendGmailParams {
  to: GmailRecipient[];
  subject: string;
  text: string;
  html: string;
  attachments?: GmailAttachment[];
}

export interface OrderItemForEmail {
  id: string;
  productId: string;
  productTitle: string;
  designTitle: string | null;
  quantity: number;
  thumbnailUrl: string | null;
}

export interface FactoryAssignmentEmailParams {
  factoryName: string;
  factoryEmail: string;
  orderId: string;
  deadline: string | null;
  factoryAmount: number | null;
  customerNote: string | null;
  shareToken: string;
  orderItems: OrderItemForEmail[];
  appUrl: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.error('Gmail environment variables (GMAIL_USER, GMAIL_APP_PASSWORD) are not configured.');
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  return transporter;
}

export async function sendGmailEmail({ to, subject, text, html, attachments }: SendGmailParams): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;

  const fromName = process.env.GMAIL_FROM_NAME || '모두의 유니폼';
  const fromEmail = process.env.GMAIL_USER;

  try {
    await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: to.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', '),
      subject,
      text,
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        cid: a.cid,
        contentDisposition: a.contentDisposition,
      })),
    });
    return true;
  } catch (error) {
    console.error('Gmail send failed:', error);
    return false;
  }
}

export async function sendFactoryAssignmentEmail(params: FactoryAssignmentEmailParams): Promise<boolean> {
  const {
    factoryName,
    factoryEmail,
    orderId,
    deadline,
    factoryAmount,
    customerNote,
    shareToken,
    orderItems,
    appUrl,
  } = params;
  const displayOrderId = orderId.toUpperCase();
  const formattedDeadline = deadline ? formatKstDateOnly(deadline) : null;
  const formattedAmount = factoryAmount != null
    ? factoryAmount.toLocaleString('ko-KR') + '원'
    : null;
  const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);

  const sharedPageUrl = `${appUrl}/shared/order/${shareToken}`;

  const subject = `[모두의 유니폼] 작업지시서 전달 드립니다 (${displayOrderId})`;

  const itemsText = orderItems.map((item, i) => {
    const name = item.designTitle || item.productTitle;
    return `  ${i + 1}. ${name} — 수량: ${item.quantity}개`;
  }).join('\n');

  const text = [
    `안녕하세요, ${factoryName}님.`,
    '',
    `작업지시서(${displayOrderId}) 전달 드립니다.`,
    '',
    formattedDeadline ? `납기일: ${formattedDeadline}` : null,
    formattedAmount ? `공장 금액: ${formattedAmount}` : null,
    `총 수량: ${totalQuantity}개 (${orderItems.length}건)`,
    '',
    '--- 주문 상품 ---',
    itemsText,
    '',
    customerNote ? `고객 메모: ${customerNote}` : null,
    '',
    `주문 상세: ${sharedPageUrl}`,
    '',
    '감사합니다.',
    '모두의 유니폼',
  ].filter((line) => line !== null).join('\n');

  const orderItemsHtml = orderItems.map((item) => {
    const name = item.designTitle || item.productTitle;
    const itemLink = `${sharedPageUrl}?item=${item.id}`;
    const isUsableUrl = item.thumbnailUrl && !item.thumbnailUrl.startsWith('data:');
    const thumbnailHtml = isUsableUrl
      ? `<img src="${item.thumbnailUrl}" alt="${name}" style="width: 72px; height: 72px; object-fit: contain; border-radius: 6px; border: 1px solid #e5e7eb; background: #f9fafb;" />`
      : `<div style="width: 72px; height: 72px; border-radius: 6px; border: 1px solid #e5e7eb; background: #f3f4f6; color: #9ca3af; font-size: 11px; text-align: center; line-height: 72px;">미리보기</div>`;

    return `
      <tr style="border-bottom: 1px solid #f3f4f6;">
        <td style="padding: 12px; vertical-align: top; width: 84px;">
          ${thumbnailHtml}
        </td>
        <td style="padding: 12px; vertical-align: top;">
          <p style="margin: 0 0 4px; color: #111827; font-size: 14px; font-weight: 600;">${name}</p>
          ${item.designTitle && item.designTitle !== item.productTitle ? `<p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">${item.productTitle}</p>` : ''}
          <p style="margin: 0 0 8px; color: #374151; font-size: 13px;">수량: <strong>${item.quantity}개</strong></p>
          <a href="${itemLink}" style="display: inline-block; background: #f3f4f6; color: #374151; padding: 6px 14px; border-radius: 4px; text-decoration: none; font-size: 12px; font-weight: 500; border: 1px solid #e5e7eb;">디자인 상세 보기</a>
        </td>
      </tr>`;
  }).join('');

  const html = `
    <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="background: #2563eb; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">작업지시서 전달 드립니다</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px; color: #374151;">안녕하세요, <strong>${factoryName}</strong>님.</p>
        <p style="margin: 0 0 20px; color: #374151;">작업지시서를 전달드립니다. 아래 내용을 확인해 주세요.</p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px; color: #6b7280; font-size: 14px; width: 120px;">주문 번호</td>
            <td style="padding: 10px 12px; color: #111827; font-size: 14px; font-weight: 600;">${displayOrderId}</td>
          </tr>
          ${formattedDeadline ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px; color: #6b7280; font-size: 14px;">납기일</td>
            <td style="padding: 10px 12px; color: #111827; font-size: 14px;">${formattedDeadline}</td>
          </tr>` : ''}
          ${formattedAmount ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px; color: #6b7280; font-size: 14px;">공장 금액</td>
            <td style="padding: 10px 12px; color: #111827; font-size: 14px;">${formattedAmount}</td>
          </tr>` : ''}
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px; color: #6b7280; font-size: 14px;">총 수량</td>
            <td style="padding: 10px 12px; color: #111827; font-size: 14px;">${totalQuantity}개 (${orderItems.length}건)</td>
          </tr>
          ${customerNote ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px; color: #6b7280; font-size: 14px;">고객 메모</td>
            <td style="padding: 10px 12px; color: #111827; font-size: 14px;">${customerNote}</td>
          </tr>` : ''}
        </table>

        ${orderItems.length > 0 ? `
        <h3 style="margin: 0 0 12px; font-size: 15px; color: #111827;">주문 상품 (${orderItems.length}건)</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          ${orderItemsHtml}
        </table>` : ''}

        <div style="text-align: center; margin: 24px 0;">
          <a href="${sharedPageUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">주문 내역 보기</a>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">본 메일은 모두의 유니폼에서 자동 발송된 알림 메일입니다.</p>
      </div>
    </div>
  `;

  return sendGmailEmail({
    to: [{ email: factoryEmail, name: factoryName }],
    subject,
    text,
    html,
  });
}
