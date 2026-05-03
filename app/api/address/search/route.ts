import { NextResponse } from 'next/server';

const JUSO_API_URL = 'https://www.juso.go.kr/addrlink/addrLinkApi.do';
const JUSO_CONFIRM_KEY = process.env.NEXT_PUBLIC_JUSO_API_KEY;

interface JusoApiResult {
  roadAddr: string;
  roadAddrPart1: string;
  roadAddrPart2: string;
  jibunAddr: string;
  engAddr: string;
  zipNo: string;
  admCd: string;
  rnMgtSn: string;
  bdMgtSn: string;
  detBdNmList: string;
  bdNm: string;
  bdKdcd: string;
  siNm: string;
  sggNm: string;
  emdNm: string;
  liNm: string;
  rn: string;
  udrtYn: string;
  buldMnnm: string;
  buldSlno: string;
  mtYn: string;
  lnbrMnnm: string;
  lnbrSlno: string;
  emdNo: string;
}

interface JusoApiResponse {
  results: {
    common: {
      errorCode: string;
      errorMessage: string;
      totalCount: string;
      countPerPage: string;
      currentPage: string;
    };
    juso: JusoApiResult[] | null;
  };
}

export async function POST(request: Request) {
  try {
    if (!JUSO_CONFIRM_KEY) {
      return NextResponse.json(
        { error: 'JUSO API 키가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const keyword = body?.keyword;

    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json(
        { error: '검색어를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (keyword.length < 2) {
      return NextResponse.json(
        { error: '검색어는 2글자 이상 입력해주세요.' },
        { status: 400 }
      );
    }

    // Call JUSO API
    const params = new URLSearchParams({
      confmKey: JUSO_CONFIRM_KEY,
      currentPage: '1',
      countPerPage: '20',
      keyword: keyword,
      resultType: 'json',
    });

    const response = await fetch(`${JUSO_API_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('JUSO API 요청에 실패했습니다.');
    }

    const data: JusoApiResponse = await response.json();

    // Check for API errors
    if (data.results.common.errorCode !== '0') {
      return NextResponse.json(
        { error: data.results.common.errorMessage || '주소 검색에 실패했습니다.' },
        { status: 400 }
      );
    }

    // Transform results
    const results = (data.results.juso || []).map((juso) => ({
      roadAddr: juso.roadAddr,
      jibunAddr: juso.jibunAddr,
      zipNo: juso.zipNo,
      siNm: juso.siNm,
      sggNm: juso.sggNm,
      emdNm: juso.emdNm,
      bdNm: juso.bdNm,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : '주소 검색에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
