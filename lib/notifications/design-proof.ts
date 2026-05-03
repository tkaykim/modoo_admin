import { sendGmailEmail } from '@/lib/gmail';

interface DesignProofEmailParams {
  orderId: string;
  orderItemId: string;
  customerName: string;
  customerEmail: string;
  productTitle: string;
  designTitle: string | null;
  previewUrl: string | null;
  confirmToken: string;
}

interface DesignConfirmedEmailParams {
  orderId: string;
  orderItemId: string;
  customerName: string;
  productTitle: string;
  designTitle: string | null;
}

interface DesignRevisionEmailParams {
  orderId: string;
  orderItemId: string;
  customerName: string;
  productTitle: string;
  designTitle: string | null;
  revisionNote: string;
}

const BRAND_COLOR = '#0052cc';
const BRAND_LIGHT = '#e8f0fe';
const BRAND_BG = '#f0f5ff';

export async function sendDesignProofEmail(params: DesignProofEmailParams): Promise<boolean> {
  const {
    orderId, customerName, customerEmail, productTitle, designTitle, previewUrl, confirmToken,
  } = params;

  const itemLabel = designTitle || productTitle;
  const confirmUrl = `https://modoouniform.com/order/${orderId}/design-review?token=${confirmToken}`;

  const previewHtml = previewUrl
    ? `<div style="text-align:center;margin:20px 0;padding:20px;background:${BRAND_BG};border-radius:12px;">
        <img src="${previewUrl}" alt="디자인 미리보기" style="max-width:100%;max-height:400px;border-radius:8px;" />
      </div>`
    : '';

  const html = `
    <div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="text-align:center;padding:24px 0;background:${BRAND_BG};">
        <img src="https://modoouniform.com/icons/modoo_logo.png" alt="모두의 유니폼" style="height:48px;" />
      </div>
      <div style="height:3px;background:${BRAND_COLOR};"></div>
      <div style="padding:32px 28px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:8px 20px;border-radius:20px;font-size:14px;font-weight:600;">시안 확인 요청</div>
        </div>
        <p style="font-size:16px;color:#222;line-height:1.7;margin:0 0 8px;">
          <strong>${customerName}</strong>님, 안녕하세요.
        </p>
        <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 20px;">
          주문하신 <strong>${itemLabel}</strong>의 디자인 시안이 준비되었습니다.<br/>
          아래에서 시안을 확인하시고, 확정 또는 수정 요청을 해주세요.
        </p>

        <div style="background:#f8f9fa;border-radius:8px;padding:14px 16px;margin:16px 0;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr>
              <td style="color:#888;padding:3px 0;width:80px;">주문번호</td>
              <td style="font-weight:600;padding:3px 0;">${orderId}</td>
            </tr>
            <tr>
              <td style="color:#888;padding:3px 0;">상품</td>
              <td style="padding:3px 0;">${itemLabel}</td>
            </tr>
          </table>
        </div>

        ${previewHtml}

        <div style="text-align:center;margin:28px 0;">
          <a href="${confirmUrl}" style="display:inline-block;padding:16px 40px;background-color:${BRAND_COLOR};color:#ffffff;border-radius:10px;font-weight:bold;font-size:15px;text-decoration:none;">시안 확인하기</a>
        </div>

        <p style="font-size:13px;color:#888;text-align:center;line-height:1.6;">
          수정이 필요하시면 위 페이지에서 수정 요청을 해주세요.
        </p>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding:24px 28px;background:${BRAND_BG};">
        <p style="margin:0 0 2px;font-size:13px;font-weight:bold;color:#333;">MODOO UNIFORM | 모두의 유니폼</p>
        <p style="margin:0 0 2px;font-size:12px;color:#888;">서울특별시 마포구 성지3길 55, 4층</p>
        <p style="margin:0;font-size:12px;color:#888;">T. 010-8140-0621 | 카카오톡: 모두의유니폼</p>
      </div>
    </div>
  `;

  const text = [
    `[모두의 유니폼] 시안 확인 요청`,
    '',
    `${customerName}님, 안녕하세요.`,
    `주문하신 ${itemLabel}의 디자인 시안이 준비되었습니다.`,
    '',
    `주문번호: ${orderId}`,
    `상품: ${itemLabel}`,
    '',
    `시안 확인하기: ${confirmUrl}`,
    '',
    '문의: 카카오톡 채널 "모두의유니폼" / 010-8140-0621',
  ].join('\n');

  try {
    return await sendGmailEmail({
      to: [{ email: customerEmail, name: customerName }],
      subject: `[모두의 유니폼] 시안이 준비되었습니다 - ${itemLabel} (${orderId})`,
      text,
      html,
    });
  } catch (error) {
    console.error('Failed to send design proof email:', error);
    return false;
  }
}

export async function sendDesignConfirmedNotification(params: DesignConfirmedEmailParams): Promise<boolean> {
  const { orderId, customerName, productTitle, designTitle } = params;
  const itemLabel = designTitle || productTitle;
  const adminUrl = `https://admin.modoogoods.com/orders/${orderId}`;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) return false;

  const html = `
    <div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="text-align:center;padding:24px 0;background:${BRAND_BG};">
        <img src="https://modoouniform.com/icons/modoo_logo.png" alt="모두의 유니폼" style="height:48px;" />
      </div>
      <div style="height:3px;background:#059669;"></div>
      <div style="padding:32px 28px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:#059669;color:#fff;padding:8px 20px;border-radius:20px;font-size:14px;font-weight:600;">시안 확정</div>
        </div>
        <p style="font-size:16px;color:#222;line-height:1.7;margin:0 0 20px;">
          <strong>${customerName}</strong>님이 <strong>${itemLabel}</strong>의 시안을 확정했습니다.
        </p>
        <div style="background:#f8f9fa;border-radius:8px;padding:14px 16px;margin:16px 0;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="color:#888;padding:3px 0;width:80px;">주문번호</td><td style="font-weight:600;">${orderId}</td></tr>
            <tr><td style="color:#888;padding:3px 0;">상품</td><td>${itemLabel}</td></tr>
          </table>
        </div>
        <div style="text-align:center;margin:28px 0;">
          <a href="${adminUrl}" style="display:inline-block;padding:14px 32px;background-color:#059669;color:#ffffff;border-radius:10px;font-weight:bold;font-size:14px;text-decoration:none;">관리자 페이지에서 확인</a>
        </div>
      </div>
    </div>
  `;

  try {
    return await sendGmailEmail({
      to: [{ email: adminEmail, name: '모두의 유니폼 관리자' }],
      subject: `[시안 확정] ${customerName} - ${itemLabel} (${orderId})`,
      text: `${customerName}님이 ${itemLabel}의 시안을 확정했습니다.\n주문번호: ${orderId}\n확인: ${adminUrl}`,
      html,
    });
  } catch (error) {
    console.error('Failed to send design confirmed notification:', error);
    return false;
  }
}

export async function sendDesignRevisionNotification(params: DesignRevisionEmailParams): Promise<boolean> {
  const { orderId, customerName, productTitle, designTitle, revisionNote } = params;
  const itemLabel = designTitle || productTitle;
  const adminUrl = `https://admin.modoogoods.com/orders/${orderId}`;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) return false;

  const html = `
    <div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="text-align:center;padding:24px 0;background:${BRAND_BG};">
        <img src="https://modoouniform.com/icons/modoo_logo.png" alt="모두의 유니폼" style="height:48px;" />
      </div>
      <div style="height:3px;background:${BRAND_COLOR};"></div>
      <div style="padding:32px 28px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:8px 20px;border-radius:20px;font-size:14px;font-weight:600;">수정 요청</div>
        </div>
        <p style="font-size:16px;color:#222;line-height:1.7;margin:0 0 20px;">
          <strong>${customerName}</strong>님이 <strong>${itemLabel}</strong>의 시안에 대해 수정을 요청했습니다.
        </p>
        <div style="background:#f8f9fa;border-radius:8px;padding:14px 16px;margin:16px 0;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="color:#888;padding:3px 0;width:80px;">주문번호</td><td style="font-weight:600;">${orderId}</td></tr>
            <tr><td style="color:#888;padding:3px 0;">상품</td><td>${itemLabel}</td></tr>
          </table>
        </div>
        <div style="background:${BRAND_LIGHT};border-left:3px solid ${BRAND_COLOR};padding:16px;border-radius:0 8px 8px 0;margin:20px 0;">
          <p style="margin:0 0 4px;font-size:12px;color:#003d99;font-weight:600;">고객 수정 요청 내용</p>
          <p style="margin:0;font-size:15px;color:#1a1a1a;line-height:1.6;white-space:pre-wrap;">${revisionNote}</p>
        </div>
        <div style="text-align:center;margin:28px 0;">
          <a href="${adminUrl}" style="display:inline-block;padding:14px 32px;background-color:${BRAND_COLOR};color:#ffffff;border-radius:10px;font-weight:bold;font-size:14px;text-decoration:none;">관리자 페이지에서 확인</a>
        </div>
      </div>
    </div>
  `;

  try {
    return await sendGmailEmail({
      to: [{ email: adminEmail, name: '모두의 유니폼 관리자' }],
      subject: `[수정 요청] ${customerName} - ${itemLabel} (${orderId})`,
      text: `${customerName}님이 ${itemLabel}의 시안에 대해 수정을 요청했습니다.\n주문번호: ${orderId}\n\n수정 요청 내용:\n${revisionNote}\n\n확인: ${adminUrl}`,
      html,
    });
  } catch (error) {
    console.error('Failed to send design revision notification:', error);
    return false;
  }
}
