const LOGEN_API_BASE_URL = process.env.LOGEN_API_BASE_URL || 'https://topenapi.ilogen.com';
const LOGEN_SECRET_KEY = process.env.LOGEN_SECRET_KEY || '';
const LOGEN_USER_ID = process.env.LOGEN_USER_ID || '10358007';
const LOGEN_CUST_CD = process.env.LOGEN_CUST_CD || '20179999';

interface LogenResponse {
  sttsCd: 'SUCCESS' | 'PARTIAL SUCCESS' | 'FAIL';
  sttsMsg: string;
  data?: any;
}

async function logenFetch(endpoint: string, body: Record<string, any>): Promise<LogenResponse> {
  const url = `${LOGEN_API_BASE_URL}/lrm02b-edi/edi/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      secretKey: LOGEN_SECRET_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`로젠 API 호출 실패: ${res.status} ${res.statusText}`);
  }

  return res.json();
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
  sndCustAddr: string;      // 송하인주소
  sndTelNo?: string;        // 송하인전화번호
  sndCellNo?: string;       // 송하인휴대폰
  rcvCustNm: string;        // 수하인명
  rcvCustAddr: string;      // 수하인주소
  rcvTelNo?: string;        // 수하인전화번호
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
