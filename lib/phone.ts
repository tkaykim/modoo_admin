/**
 * 전화번호 입력 정규화·검증 정본.
 *
 * 배경: 주문 연락처에 한 자리가 빠지거나(0104931766) 국가번호가 붙은 채로(821044024301)
 * 저장돼 고객에게 연락이 닿지 않는 사고가 반복됐다. 실제 주문 데이터 395건 기준
 * 010 + 11자리가 389건(98.5%)이고 나머지 6건은 전부 오타였다.
 * 유선·대표번호로 주문한 사례는 0건이라 010은 강하게 막고, 그 외는 안내만 한다.
 *
 * 저장은 항상 숫자만(기존 DB·로젠 연동 포맷 유지), 화면 표시만 하이픈을 넣는다.
 */

export type PhoneSeverity = 'ok' | 'notice' | 'warn' | 'error';

export interface PhoneCheck {
  /** 저장용 — 숫자만 */
  digits: string;
  /** 화면 표시용 — 하이픈 */
  formatted: string;
  severity: PhoneSeverity;
  /** 입력칸 아래 노출할 문구. null이면 표시하지 않는다. */
  message: string | null;
  /** true면 결제·저장을 막아야 한다. */
  blocking: boolean;
}

/** 입력칸이 감당할 최대 자릿수 — 오타를 눈으로 확인할 여지는 남기고 폭주만 막는다. */
const MAX_DIGITS = 15;

/** 폐지된 01X 대역 — 2021년 2G 종료로 사실상 소멸했다. */
const LEGACY_MOBILE_PREFIXES = ['011', '016', '017', '018', '019'];

/** 전국대표번호 — 8자리. */
const NATIONWIDE_PREFIXES = ['15', '16', '18'];

const LANDLINE_NOTICE = '휴대폰 번호가 맞나요? 유선·대표번호라면 그대로 진행하셔도 됩니다.';

/**
 * 입력값을 저장 가능한 숫자 문자열로 정리한다.
 * - 숫자가 아닌 문자 제거
 * - 국가번호(+82) 제거 후 0을 붙여 국내 포맷으로 교정
 *
 * 국내 번호는 82로 시작하는 대역이 없어서 이 교정은 오탐 위험이 없다.
 */
export function sanitizePhoneInput(raw: string): string {
  let digits = (raw || '').replace(/[^0-9]/g, '');

  // 8210xxxxxxxx → 010xxxxxxxx
  if (digits.startsWith('82') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }

  return digits.slice(0, MAX_DIGITS);
}

/** 화면 표시용 하이픈 포맷. 자릿수를 눈으로 셀 수 있게 하는 게 목적이다. */
export function formatPhone(raw: string): string {
  const d = sanitizePhoneInput(raw);
  if (!d) return '';

  if (d.startsWith('02')) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }

  if (NATIONWIDE_PREFIXES.some((p) => d.startsWith(p)) && !d.startsWith('0')) {
    if (d.length <= 4) return d;
    return `${d.slice(0, 4)}-${d.slice(4, 8)}`;
  }

  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

/**
 * 검증 결과를 만든다.
 *
 * 규칙:
 *  A. 010으로 시작하면 정확히 11자리 — 예외가 없으므로 차단한다.
 *  B. 폐지된 01X 대역은 경고만 — 차단하면 진짜 옛 번호를 쓰는 고객을 막는다.
 *  C. 유선·대표번호는 안내만 — 학원·학교 대표번호로 주문할 수 있다.
 *  D. 어느 대역에도 안 맞으면 차단.
 */
export function checkPhone(raw: string): PhoneCheck {
  const digits = sanitizePhoneInput(raw);
  const formatted = formatPhone(digits);

  const base = { digits, formatted };

  if (!digits) {
    // 아직 입력하지 않은 칸에 빨간 문구를 띄우지는 않는다. 제출 시 blocking으로만 막는다.
    return { ...base, severity: 'error', message: null, blocking: true };
  }

  if (digits.startsWith('010')) {
    if (digits.length === 11) {
      return { ...base, severity: 'ok', message: null, blocking: false };
    }
    const message =
      digits.length < 11
        ? '휴대폰 번호는 11자리예요. 한 자리가 빠진 것 같아요. (010-1234-5678)'
        : '휴대폰 번호는 11자리예요. 한 자리가 더 입력된 것 같아요. (010-1234-5678)';
    return { ...base, severity: 'error', message, blocking: true };
  }

  if (LEGACY_MOBILE_PREFIXES.some((p) => digits.startsWith(p))) {
    if (digits.length === 10 || digits.length === 11) {
      return {
        ...base,
        severity: 'warn',
        message: '011·016~019 번호는 현재 거의 사용되지 않습니다. 010이 맞는지 확인해주세요.',
        blocking: false,
      };
    }
    return {
      ...base,
      severity: 'error',
      message: '전화번호 자릿수를 확인해주세요.',
      blocking: true,
    };
  }

  if (digits.startsWith('02')) {
    if (digits.length === 9 || digits.length === 10) {
      return { ...base, severity: 'notice', message: LANDLINE_NOTICE, blocking: false };
    }
    return { ...base, severity: 'error', message: '전화번호 자릿수를 확인해주세요.', blocking: true };
  }

  // 지역번호(031~064)·인터넷전화(070)·안심번호(050)
  if (/^0(3[1-3]|4[1-4]|5[1-5]|6[1-4]|70|50\d?)/.test(digits)) {
    if (digits.length === 10 || digits.length === 11 || digits.length === 12) {
      return { ...base, severity: 'notice', message: LANDLINE_NOTICE, blocking: false };
    }
    return { ...base, severity: 'error', message: '전화번호 자릿수를 확인해주세요.', blocking: true };
  }

  if (NATIONWIDE_PREFIXES.some((p) => digits.startsWith(p)) && digits.length === 8) {
    return { ...base, severity: 'notice', message: LANDLINE_NOTICE, blocking: false };
  }

  return {
    ...base,
    severity: 'error',
    message: '전화번호 형식을 확인해주세요. 휴대폰이라면 010으로 시작하는 11자리입니다.',
    blocking: true,
  };
}

/** 제출 직전 가드용 — 차단해야 하면 true. */
export function isPhoneBlocking(raw: string): boolean {
  return checkPhone(raw).blocking;
}

/**
 * 서버 검증용 — 차단 사유가 있으면 사람이 읽을 메시지를 돌려준다.
 * 클라이언트 우회로 들어온 값도 같은 규칙으로 거른다.
 */
export function assertPhoneOrMessage(raw: string, label = '연락처'): string | null {
  const result = checkPhone(raw);
  if (!result.blocking) return null;
  return result.message ? `${label}: ${result.message}` : `${label}를 입력해주세요.`;
}
