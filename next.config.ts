import type { NextConfig } from "next";

/** 배포 디버깅용(브라우저 번들 치환). Vercel 빌드 시 자동 설정. */
const deployCommitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  "";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "@google-analytics/data", "google-gax", "google-auth-library"],
  env: {
    NEXT_PUBLIC_MODOO_ADMIN_DEPLOY_SHA: deployCommitSha || "local",
  },
  /**
   * Vercel/서버리스에서 파일 추적 시 @sparticuz/chromium 의 brotli 바이너리가
   * 람다 패키지에 빠지면 executablePath 가 실패하고 PDF 첨부가 조용히 누락됩니다.
   */
  outputFileTracingIncludes: {
    "/api/admin/invoices": [
      "./node_modules/@sparticuz/chromium/**/*",
      "./node_modules/@fontsource/noto-sans-kr/**/*",
    ],
    "/api/admin/invoices/[id]/resend": [
      "./node_modules/@sparticuz/chromium/**/*",
      "./node_modules/@fontsource/noto-sans-kr/**/*",
    ],
  },

  /** 로그인 HTML·JS가 에지에 오래 캐시되면 예전 번들(useAdminAuth)이 남아 super_admin 접속이 막힐 수 있음 */
  headers: async () => [
    {
      source: "/login",
      headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate" }],
    },
    {
      source: "/dashboard",
      headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate" }],
    },
  ],
};

export default nextConfig;
