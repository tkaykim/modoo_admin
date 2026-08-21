import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase-middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // api 제외: 모든 /api/admin 라우트는 requireAdmin() 등으로 자체 인증하고, 그 과정의
    // createClient()가 토큰 갱신과 쿠키 기록까지 수행한다. 미들웨어까지 태우면 요청 1건당
    // 인증 왕복이 2회로 늘어날 뿐 얻는 게 없다.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
