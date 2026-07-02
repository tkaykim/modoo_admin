// 제주·도서산간 추가 택배비(고객 부담) 판정 유틸.
//
// ⚠ 정본 데이터: 국내 표준 "제주·도서산간" 우편번호 기준표(제주 전역 + 섬 도서지역).
//    로젠택배 공식 도서산간 목록과 정기적으로 대조해 갱신할 것(운영 정본은 로젠 기준).
//    실제 로젠 할증 지역과 어긋나면 고객 청구 = 실제 원가 매칭이 깨지므로 주의.
//
// 🔁 이 파일은 3개 앱(modoo_app / modoo_admin / munchpeek_goods)에 동일하게 복제되어 있다.
//    한 곳을 고치면 나머지도 함께 동기화한다(별도 공유 패키지 없음 — 레포·DB 분리 구조).

// 할증 금액. 기본 3,000원, 필요 시 env로 오버라이드.
// 클라이언트·서버가 같은 값을 봐야 서버 검증(총액 재계산)이 통과하므로 NEXT_PUBLIC_ 변수를 사용한다.
export const REMOTE_AREA_SURCHARGE_KRW = (() => {
  const raw =
    process.env.NEXT_PUBLIC_REMOTE_AREA_SURCHARGE_KRW ??
    process.env.REMOTE_AREA_SURCHARGE_KRW;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 3000;
})();

// 제주 전역 + 도서산간 섬지역 우편번호 구간 [시작, 끝] (5자리, 양 끝 포함).
// 출처: 국내 통용 표준 제주·도서산간 기준표(2026-07 기준). 로젠 공식표와 대조 갱신 대상.
const REMOTE_AREA_RANGES: ReadonlyArray<readonly [number, number]> = [
  [63000, 63644], // 제주 전역
  [22386, 22388], // 인천 중구 섬지역
  [23004, 23010], // 인천 강화 섬지역
  [23100, 23116], // 인천 옹진 섬지역
  [23124, 23136], // 인천 옹진 섬지역
  [31708, 31708], // 충남 당진 섬지역
  [32133, 32133], // 충남 태안 섬지역
  [33411, 33411], // 충남 보령 섬지역
  [40200, 40240], // 경북 울릉도 전지역
  [46768, 46771], // 부산 강서구 섬지역
  [52570, 52571], // 경남 사천 섬지역
  [53031, 53033], // 경남 통영 섬지역
  [53089, 53104], // 경남 통영 섬지역
  [54000, 54000], // 경남 통영 섬지역
  [56347, 56349], // 전북 부안 섬지역
  [57068, 57069], // 전남 영광 섬지역
  [58760, 58762], // 전남 목포 섬지역
  [58800, 58810], // 전남 신안 섬지역
  [58816, 58818], // 전남 신안 섬지역
  [58826, 58826], // 전남 신안 섬지역
  [58828, 58866], // 전남 신안 섬지역
  [58953, 58958], // 전남 진도 섬지역
  [59102, 59103], // 전남 완도 섬지역
  [59106, 59106], // 전남 완도 섬지역
  [59127, 59127], // 전남 완도 섬지역
  [59129, 59129], // 전남 완도 섬지역
  [59137, 59166], // 전남 완도 섬지역
  [59650, 59650], // 전남 여수 섬지역
  [59766, 59766], // 전남 여수 섬지역
  [59781, 59790], // 전남 여수 섬지역
];

/** 우편번호 문자열을 5자리 숫자로 정규화. 유효하지 않으면 null. */
export function normalizeZonecode(zonecode: string | null | undefined): number | null {
  if (!zonecode) return null;
  const digits = String(zonecode).replace(/[^0-9]/g, '');
  if (digits.length !== 5) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** 제주·도서산간 지역인지 판정. */
export function isRemoteArea(zonecode: string | null | undefined): boolean {
  const n = normalizeZonecode(zonecode);
  if (n == null) return false;
  return REMOTE_AREA_RANGES.some(([start, end]) => n >= start && n <= end);
}

/**
 * 고객이 부담할 도서산간 추가 택배비를 계산한다.
 * - 국내배송(domestic)에만 적용. 픽업·해외배송은 0.
 * - 우편번호가 제주·도서산간 구간이면 REMOTE_AREA_SURCHARGE_KRW, 아니면 0.
 */
export function getRemoteAreaSurcharge(
  zonecode: string | null | undefined,
  shippingMethod?: string | null,
): number {
  if (shippingMethod != null && shippingMethod !== 'domestic') return 0;
  return isRemoteArea(zonecode) ? REMOTE_AREA_SURCHARGE_KRW : 0;
}
