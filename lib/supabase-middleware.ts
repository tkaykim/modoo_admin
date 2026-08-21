import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// getUser()는 Supabase 인증 서버로 나가는 네트워크 왕복이다. 이 미들웨어는 인가 게이트가 아니라
// 세션 쿠키 갱신기이므로(차단·리다이렉트 없음), 응답이 늦으면 갱신을 포기하고 통과시킨다.
// 이 상한이 없으면 인증 서버가 흔들릴 때 미들웨어가 25초를 매달려 전 경로가 504로 죽는다.
const AUTH_REFRESH_TIMEOUT_MS = 3000

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // RSC 프리페치는 사용자가 아직 열지 않은 화면을 미리 받아두는 요청이라 세션 갱신이 필요 없다.
  if (request.headers.get('next-router-prefetch') === '1') {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await Promise.race([
    supabase.auth.getUser().catch(() => null),
    new Promise((resolve) => setTimeout(resolve, AUTH_REFRESH_TIMEOUT_MS)),
  ])

  return supabaseResponse
}
