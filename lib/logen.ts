import { fetch as undiciFetch, ProxyAgent } from 'undici';

const LOGEN_API_BASE_URL = process.env.LOGEN_API_BASE_URL || 'https://topenapi.ilogen.com';
// 로젠 API 자격증명 — 토큰 발급 시 로젠이 함께 제공. Vercel 환경변수 필수.
const LOGEN_SECRET_KEY = process.env.LOGEN_SECRET_KEY || '';
// userId(API 사용자 ID): 로젠 접수(registerOrderData)는 userId에 "거래처번호(22254633)"를 요구한다.
// ※ contractTotalInfo는 'peacecorp'도 받지만 접수는 "잘못된 ID"로 거부 → 거래처번호로 통일.
//   (조회·접수·송장조회 모두 22254633으로 검증 완료. 2026-06-08) env LOGEN_USER_ID 로 설정.
const LOGEN_USER_ID = process.env.LOGEN_USER_ID || '22254633';
// custCd(거래처 코드): 피스코프(모두의 유니폼) 22254633 (집화지점 서마포). env LOGEN_CUST_CD 로 설정.
const LOGEN_CUST_CD = process.env.LOGEN_CUST_CD || '22254633';

// 로젠 API는 IP 화이트리스트 필수 → modoo(Vercel, 가변IP)는 고정IP 프록시를 경유한다.
// LOGEN_PROXY_URL 예) http://user:pass@<고정IP>:8888  (미설정 시 직접 호출)
const LOGEN_PROXY_URL = process.env.LOGEN_PROXY_URL || '';
const logenProxyAgent = LOGEN_PROXY_URL ? new ProxyAgent(LOGEN_PROXY_URL) : undefined;

interface LogenResponse {
  sttsCd: 'SUCCESS' | 'PARTIAL SUCCESS' | 'FAIL';
  sttsMsg: string;
  data?: any;
}

async function logenFetch(endpoint: string, body: Record<string, any>): Promise<LogenResponse> {
  const url = `${LOGEN_API_BASE_URL}/lrm02b-edi/edi/${endpoint}`;
  const res = await undiciFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      secretKey: LOGEN_SECRET_KEY,
    },
    body: JSON.stringify(body),
    ...(logenProxyAgent ? { dispatcher: logenProxyAgent } : {}),
  });

  if (!res.ok) {
    throw new Error(`로젠 API 호출 실패: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as LogenResponse;
}

function logenGetUrl(endpoint: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${LOGEN_API_BASE_URL}/lrm02b-edi/edi/${endpoint}?${qs}`;
}

// ── 계약정보 통합조회 ──
export async function getContractInfo(custCd?: string) {
  return logenFetch('contractTotalInfo', {
    userId: LOGEN_USER_ID,
    data: [{ custCd: custCd || LOGEN_CUST_CD }],
  });
}

// ── 주문 정보 일괄 등록 (iLOGEN 출력방식) ──
export interface RegisterOrderInput {
  takeDt: string;           // 접수일자 YYYYMMDD
  fixTakeNo: string;        // 주문번호 (order.id 사용)
  sndCustNm: string;        // 송하인명
  sndZipCd?: string;        // 송하인우편번호
  sndCustAddr: string;      // 송하인주소
  sndTelNo?: string;        // 송하인전화번호 (문서상 필수 Y)
  sndCellNo?: string;       // 송하인휴대폰
  rcvCustNm: string;        // 수하인명
  rcvZipCd?: string;        // 수하인우편번호
  rcvCustAddr: string;      // 수하인주소
  rcvTelNo?: string;        // 수하인전화번호 (문서상 필수 Y — 휴대폰만 있어도 여기에 같이 넣을 것)
  rcvCellNo?: string;       // 수하인휴대폰
  fareTy: string;           // 운임타입코드 (010:선불,020:착불,030:신용,040:본사신용)
  qty: number;              // 수량
  dlvFare: number;          // 택배운임
  goodsNm?: string;         // 물품명
  sndMsg?: string;          // 배송메시지
}

export async function registerOrder(orders: RegisterOrderInput[]) {
  return logenFetch('registerOrderData', {
    userId: LOGEN_USER_ID,
    data: orders.map((o) => ({
      custCd: LOGEN_CUST_CD,
      ...o,
    })),
  });
}

// ── 송장 출력 팝업 URL 생성 ──
export function getSlipPrintPopUrl(takeDt: string) {
  return logenGetUrl('outSlipPrintPop', {
    userId: LOGEN_USER_ID,
    custCd: LOGEN_CUST_CD,
    takeDt,
  });
}

// ── 송장 출력 화면 실제 URL 해석 ──
// openapi.ilogen.com은 IP 화이트리스트(프록시 IP만 등록)라 관리자 브라우저에서 직접 열면 타임아웃된다.
// 서버에서 프록시 경유로 스텁 HTML을 받아, 그 안의 실제 출력 화면(logis.ilogen.com — 공개 호스트) URL을 추출해 돌려준다.
export async function getSlipPrintScreenUrl(takeDt: string): Promise<string> {
  const url = getSlipPrintPopUrl(takeDt);
  const res = await undiciFetch(url, {
    headers: { secretKey: LOGEN_SECRET_KEY },
    ...(logenProxyAgent ? { dispatcher: logenProxyAgent } : {}),
  });
  if (!res.ok) {
    throw new Error(`로젠 출력 팝업 조회 실패: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const m = html.match(/window\.open\('([^']+)'/);
  if (!m) {
    throw new Error('로젠 출력 화면 URL을 찾지 못했습니다.');
  }
  return m[1];
}

// ── 출력 송장번호 조회 ──
export async function inquirySlipNo(fixTakeNos: string[]) {
  return logenFetch('inquirySlipNoMulti', {
    userId: LOGEN_USER_ID,
    data: fixTakeNos.map((no) => ({
      custCd: LOGEN_CUST_CD,
      fixTakeNo: no,
    })),
  });
}

// ── 화물추적 조회 (전체 이력) ──
export async function trackCargo(slipNos: string[]) {
  return logenFetch('inquiryCargoTrackingMulti', {
    userId: LOGEN_USER_ID,
    data: slipNos.map((slipNo) => ({ slipNo })),
  });
}

// ── 최종 화물추적 조회 ──
export async function trackCargoLast(slipNos: string[]) {
  return logenFetch('inquiryCargoTrackingMultiLast', {
    userId: LOGEN_USER_ID,
    data: slipNos.map((slipNo) => ({ slipNo })),
  });
}

// ── 반품접수 정보 조회 ──
export async function inquiryReturnState(orgnSlipNos: string[]) {
  return logenFetch('inquiryReturnStateMulti', {
    userId: LOGEN_USER_ID,
    data: orgnSlipNos.map((orgnSlipNo) => ({
      custCd: LOGEN_CUST_CD,
      orgnSlipNo,
    })),
  });
}

// ── 반품 요청 상태 및 송장번호 조회 ──
export async function inquiryReserveState(takeNos: string[]) {
  return logenFetch('inquiryReserveStateMulti', {
    userId: LOGEN_USER_ID,
    data: takeNos.map((takeNo) => ({
      custCd: LOGEN_CUST_CD,
      takeNo,
    })),
  });
}

// ── 반품 집하지점 및 운임 조회 ──
export async function getReturnBranchFare(orgnSlipNos: string[]) {
  return logenFetch('reverseChkInfoMulti', {
    userId: LOGEN_USER_ID,
    data: orgnSlipNos.map((orgnSlipNo) => ({
      custCd: LOGEN_CUST_CD,
      orgnSlipNo,
    })),
  });
}
