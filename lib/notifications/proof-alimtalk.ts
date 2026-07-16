/**
 * 카카오 알림톡 '시안확인'(SOLAPI_TPL_PROOF) 문구를 어드민에서 그대로 재현한다.
 *
 * 문구/버튼/링크의 정본은 워커 `worker/src/scripts/solapi-templates.ts` 의 `modoo_시안확인` 템플릿이다.
 * 카카오 심사를 통과한 템플릿이라 문구를 바꾸려면 재심사가 필요하다 — 여기만 고치면 자동 발송분과 어긋난다.
 */

export const PROOF_TEMPLATE =
  '#{고객명}님, 요청하신 디자인 시안이 준비되었습니다.\n' +
  '아래 버튼에서 시안을 확인하신 후 확정을 눌러주세요.\n' +
  '확정하시면 본주문이 확정되어 제작이 진행됩니다.';

export const PROOF_BUTTON_NAME = '시안 확인하기';

/** 알림톡 템플릿 버튼에 등록된 도메인 — 심사 대상이라 고정. */
const PUBLIC_BASE_URL = 'https://www.modoouniform.com';

export function proofReviewUrl(orderId: string, token: string): string {
  return `${PUBLIC_BASE_URL}/order/${orderId}/design-review?token=${token}`;
}

/**
 * 복붙 수동발송용 문구.
 * 알림톡은 링크를 본문 밖 웹링크 버튼으로 싣지만 카톡 수동발송에는 버튼이 없으므로,
 * '버튼' 표현을 '링크'로 바꾸고 URL 을 본문 끝에 붙인다.
 */
export function buildManualProofMessage(params: {
  customerName: string;
  orderId: string;
  token: string;
}): string {
  const body = PROOF_TEMPLATE
    .replace('#{고객명}', params.customerName)
    .replace('아래 버튼에서', '아래 링크에서');
  return `${body}\n\n▶ ${PROOF_BUTTON_NAME}\n${proofReviewUrl(params.orderId, params.token)}`;
}

type OrderRecipientRow = {
  customer_name?: string | null;
  guest_name?: string | null;
  customer_phone?: string | null;
  guest_phone?: string | null;
};

/** 수신자 해석 — 워커 폴러(modoo-alimtalk.ts)와 동일한 우선순위를 유지한다. */
export function resolveProofRecipient(order: OrderRecipientRow): {
  customerName: string;
  phone: string | null;
} {
  const digits = String(order.customer_phone || order.guest_phone || '').replace(/[^0-9]/g, '');
  return {
    customerName: order.customer_name || order.guest_name || '고객',
    phone: digits || null,
  };
}
