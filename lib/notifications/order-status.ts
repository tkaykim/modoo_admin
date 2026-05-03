import { sendGmailEmail } from '@/lib/gmail';
import { formatKstTodayLong } from '@/lib/kst';

export type OrderStatus = 'payment_pending' | 'payment_completed' | 'in_production' | 'shipping' | 'delivered' | 'cancelled' | 'partially_cancelled';

interface OrderItemSummary {
  product_title: string;
  quantity: number;
  price_per_item: number;
}

interface OrderStatusNotificationParams {
  orderId: string;
  customerName: string;
  customerEmail: string;
  newStatus: OrderStatus;
  previousStatus?: string;
  trackingNumber?: string | null;
  items?: OrderItemSummary[];
  totalAmount?: number;
  paymentMethod?: string;
}

const BRAND_COLOR = '#0052cc';
const BRAND_LIGHT = '#e8f0fe';
const BRAND_BG = '#f0f5ff';

const STATUS_CONFIG: Record<string, { subject: string; heading: string; message: string; icon: string }> = {
  payment_completed: {
    subject: '입금이 확인되었습니다',
    heading: '입금 확인 완료',
    message: '입금이 정상적으로 확인되었습니다. 디자인 검토 후 제작이 시작될 예정입니다.',
    icon: '✓',
  },
  in_production: {
    subject: '주문하신 상품의 제작이 시작되었습니다',
    heading: '제작 시작',
    message: '주문하신 상품의 제작이 시작되었습니다. 제작 완료 후 배송 안내를 보내드리겠습니다.',
    icon: '⚙',
  },
  shipping: {
    subject: '상품이 발송되었습니다',
    heading: '배송 시작',
    message: '주문하신 상품이 발송되었습니다.',
    icon: '📦',
  },
  delivered: {
    subject: '상품이 배송 완료되었습니다',
    heading: '배송 완료',
    message: '주문하신 상품이 배송 완료되었습니다. 상품에 만족하셨다면 리뷰를 남겨주세요!',
    icon: '✓',
  },
};

const NOTIFIABLE_STATUSES = new Set(Object.keys(STATUS_CONFIG));

function shouldNotify(newStatus: string, previousStatus?: string): boolean {
  if (!NOTIFIABLE_STATUSES.has(newStatus)) return false;
  return newStatus !== previousStatus;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

function paymentMethodLabel(method?: string): string {
  switch (method) {
    case 'card': return '카드 결제';
    case 'bank_transfer': return '무통장 입금';
    case 'virtual_account': return '가상계좌';
    case 'toss': return '토스페이';
    default: return method || '';
  }
}

function buildStatusEmailHtml(params: OrderStatusNotificationParams): string {
  const config = STATUS_CONFIG[params.newStatus];
  if (!config) return '';

  const orderUrl = `https://modoouniform.com/order/${params.orderId}`;
  const orderDate = formatKstTodayLong();

  const trackingHtml = params.newStatus === 'shipping' && params.trackingNumber
    ? `<div style="background:${BRAND_LIGHT};border-radius:8px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">운송장 번호</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:${BRAND_COLOR};letter-spacing:0.5px;">${params.trackingNumber}</p>
      </div>`
    : '';

  const itemsHtml = params.items && params.items.length > 0
    ? `<div style="margin:20px 0;">
        <p style="font-size:13px;font-weight:600;margin:0 0 8px;color:#333;">주문 상품</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid #e5e7eb;">
              <th style="padding:8px 0;text-align:left;font-weight:600;color:#555;">상품</th>
              <th style="padding:8px 0;text-align:center;font-weight:600;color:#555;width:50px;">수량</th>
              <th style="padding:8px 0;text-align:right;font-weight:600;color:#555;width:90px;">금액</th>
            </tr>
          </thead>
          <tbody>
            ${params.items.map(item => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${item.product_title}</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity}</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;text-align:right;">${formatCurrency(item.price_per_item * item.quantity)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`
    : '';

  const totalHtml = params.totalAmount != null
    ? `<div style="border-top:2px solid #e5e7eb;margin-top:8px;padding-top:12px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:600;font-size:14px;color:#333;">총 결제금액</span>
        <span style="font-weight:700;font-size:18px;color:${BRAND_COLOR};">${formatCurrency(params.totalAmount)}</span>
      </div>`
    : '';

  const paymentLine = params.paymentMethod
    ? `<tr>
        <td style="color:#888;padding:3px 0;">결제방법</td>
        <td style="padding:3px 0;">${paymentMethodLabel(params.paymentMethod)}</td>
      </tr>`
    : '';

  return `
    <div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="text-align:center;padding:24px 0;background:${BRAND_BG};">
        <img src="https://modoouniform.com/icons/modoo_logo.png" alt="모두의 유니폼" style="height:48px;" />
      </div>
      <div style="height:3px;background:${BRAND_COLOR};"></div>
      <div style="padding:32px 28px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:8px 20px;border-radius:20px;font-size:14px;font-weight:600;">${config.icon} ${config.heading}</div>
        </div>
        <p style="font-size:16px;color:#222;line-height:1.7;margin:0 0 8px;">
          <strong>${params.customerName}</strong>님, 안녕하세요.
        </p>
        <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 20px;">
          ${config.message}
        </p>
        ${trackingHtml}
        <div style="background:#f8f9fa;border-radius:8px;padding:14px 16px;margin:16px 0;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr>
              <td style="color:#888;padding:3px 0;width:80px;">주문번호</td>
              <td style="font-weight:600;padding:3px 0;">${params.orderId}</td>
            </tr>
            <tr>
              <td style="color:#888;padding:3px 0;">주문일시</td>
              <td style="padding:3px 0;">${orderDate}</td>
            </tr>
            ${paymentLine}
          </table>
        </div>
        ${itemsHtml}
        ${totalHtml}
        <div style="text-align:center;margin:28px 0;">
          <a href="${orderUrl}" style="display:inline-block;padding:14px 32px;background-color:${BRAND_COLOR};color:#ffffff;border-radius:10px;font-weight:bold;font-size:14px;text-decoration:none;">주문 상세 보기</a>
          ${params.newStatus === 'delivered' ? `<a href="https://modoouniform.com/home/my-page/orders" style="display:inline-block;padding:14px 32px;background-color:#333333;color:#ffffff;border-radius:10px;font-weight:bold;font-size:14px;text-decoration:none;margin-left:8px;">리뷰 작성하기</a>` : ''}
        </div>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding:24px 28px;background:${BRAND_BG};">
        <p style="margin:0 0 2px;font-size:13px;font-weight:bold;color:#333;">MODOO UNIFORM | 모두의 유니폼</p>
        <p style="margin:0 0 2px;font-size:12px;color:#888;">서울특별시 마포구 성지3길 55, 4층</p>
        <p style="margin:0;font-size:12px;color:#888;">T. 010-8140-0621 | 카카오톡: 모두의유니폼</p>
      </div>
    </div>
  `;
}

function buildStatusEmailText(params: OrderStatusNotificationParams): string {
  const config = STATUS_CONFIG[params.newStatus];
  if (!config) return '';

  const trackingLine = params.newStatus === 'shipping' && params.trackingNumber
    ? `\n운송장 번호: ${params.trackingNumber}\n`
    : '';

  const itemLines = params.items && params.items.length > 0
    ? [
        '',
        '--- 주문 상품 ---',
        ...params.items.map(item =>
          `- ${item.product_title} x${item.quantity} : ${formatCurrency(item.price_per_item * item.quantity)}`
        ),
        '',
      ].join('\n')
    : '';

  const totalLine = params.totalAmount != null
    ? `총 결제금액: ${formatCurrency(params.totalAmount)}\n`
    : '';

  return [
    `[모두의 유니폼] ${config.subject}`,
    '',
    `${params.customerName}님, 안녕하세요.`,
    config.message,
    '',
    `주문번호: ${params.orderId}`,
    trackingLine,
    itemLines,
    totalLine,
    '주문 상세: https://modoouniform.com/order/' + params.orderId,
    ...(params.newStatus === 'delivered' ? ['리뷰 작성: https://modoouniform.com/home/my-page/orders'] : []),
    '',
    '문의: 카카오톡 채널 "모두의유니폼" / 010-8140-0621',
  ].filter(Boolean).join('\n');
}

export async function sendOrderStatusNotification(params: OrderStatusNotificationParams): Promise<boolean> {
  if (!shouldNotify(params.newStatus, params.previousStatus)) return false;
  if (!params.customerEmail) return false;

  const config = STATUS_CONFIG[params.newStatus];
  if (!config) return false;

  try {
    return await sendGmailEmail({
      to: [{ email: params.customerEmail, name: params.customerName }],
      subject: `[모두의 유니폼] ${config.subject} (${params.orderId})`,
      text: buildStatusEmailText(params),
      html: buildStatusEmailHtml(params),
    });
  } catch (error) {
    console.error('Failed to send order status notification:', error);
    return false;
  }
}
