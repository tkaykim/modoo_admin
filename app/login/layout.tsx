/** 로그인 라우트는 항상 동적 렌더(HTML 캐시로 옛 번들이 붙는 것 방지) */
export const dynamic = 'force-dynamic';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
