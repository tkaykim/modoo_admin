import type { MetadataRoute } from "next";

/** 관리자 도메인 전체 크롤링 차단 — 공유 링크 직접 접속은 허용되나 검색 색인은 방지합니다. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
