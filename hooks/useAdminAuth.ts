'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { normalizeProfileRole, assertModooAdminAppProfileRole, isModooAdminAppRole } from '@/lib/auth-helpers';
import { useAuthStore, type AuthStatus, type UserData } from '@/store/useAuthStore';

type AdminRole = 'admin' | 'factory' | 'super_admin' | 'marketing_manager';

const adminRoutes = ['/dashboard', '/analytics', '/marketing-console', '/products', '/naver-commerce', '/designs', '/templates', '/content', '/orders', '/purchase-orders', '/factories', '/factory', '/cobuy', '/partner_malls', '/coupons', '/users', '/settings', '/editor', '/print-methods', '/customer-pricing', '/invoices', '/shipping', '/test', '/salespersons', '/leads', '/bug-reports'];
const marketingRoutes = ['/analytics', '/marketing-console'];

const allowedRoutesByRole: Record<AdminRole, string[]> = {
  admin: adminRoutes,
  factory: ['/orders', '/users', '/editor', '/factory'],
  super_admin: [...adminRoutes, '/finance'],
  marketing_manager: marketingRoutes,
};

const defaultRouteByRole: Record<AdminRole, string> = {
  admin: '/dashboard',
  factory: '/orders',
  super_admin: '/dashboard',
  marketing_manager: '/analytics',
};

interface UseAdminAuthOptions {
  skip?: boolean;
}

interface UseAdminAuthResult {
  authStatus: AuthStatus;
  user: UserData | null;
  logout: () => void;
}

export function useAdminAuth(options: UseAdminAuthOptions = {}): UseAdminAuthResult {
  const { skip = false } = options;
  const router = useRouter();
  const pathname = usePathname();
  const [isHydrated, setIsHydrated] = useState(false);

  const { user, authStatus, setUser, setAuthStatus, logout } = useAuthStore();

  // Handle Zustand hydration - wait for it to complete
  useEffect(() => {
    if (skip) {
      setIsHydrated(true);
      return;
    }

    // Check if already hydrated
    if (useAuthStore.persist.hasHydrated()) {
      setIsHydrated(true);
      setAuthStatus('checking');
      return;
    }

    // Subscribe to hydration completion
    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      setIsHydrated(true);
      setAuthStatus('checking');
    });

    // Trigger rehydration
    useAuthStore.persist.rehydrate();

    return () => {
      unsubscribe();
    };
  }, [skip, setAuthStatus]);

  // Check admin authentication after hydration
  useEffect(() => {
    if (skip || !isHydrated || authStatus !== 'checking') return;

    let isActive = true;

    const checkAdminAuth = async (didRetry = false): Promise<void> => {
      try {
        const supabase = createClient();
        const { data: { user: supabaseUser }, error: getUserError } = await supabase.auth.getUser();

        // 세션이 없거나 오류가 발생한 경우 — 리프레시 토큰이 살아있을 수 있으므로 1회 갱신을 시도한다.
        if (getUserError || !supabaseUser) {
          if (!didRetry) {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshed?.session) {
              return checkAdminAuth(true);
            }
          }
          if (isActive) setAuthStatus('unauthenticated');
          router.push('/login');
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role, email, phone_number, manufacturer_id')
          .eq('id', supabaseUser.id)
          .maybeSingle();

        if (error) {
          console.error('프로필 조회 오류:', error);
          logout();
          if (isActive) setAuthStatus('unauthenticated');
          router.push('/login');
          return;
        }

        if (!profile) {
          console.error('profiles 행 없음 또는 RLS로 조회 차단 가능 (user id:', supabaseUser.id, ')');
          logout();
          if (isActive) setAuthStatus('unauthenticated');
          router.push('/login');
          return;
        }

        const canonicalRole = normalizeProfileRole(profile.role);
        if (!assertModooAdminAppProfileRole(canonicalRole)) {
          console.error(
            '[모두관리] 허용되지 않은 역할입니다. 필요: admin · factory · super_admin · marketing_manager. 현재값:',
            profile.role,
            '→ 정규화:',
            canonicalRole
          );
          logout();
          if (isActive) setAuthStatus('unauthenticated');
          router.push('/login');
          return;
        }

        let manufacturer_name: string | null = null;
        if (profile.manufacturer_id) {
          const { data: mfg } = await supabase
            .from('manufacturers')
            .select('name')
            .eq('id', profile.manufacturer_id)
            .maybeSingle();
          manufacturer_name = mfg?.name ?? null;
        }

        if (isActive) {
          setUser({
            id: supabaseUser.id,
            email: supabaseUser.email || profile.email || '',
            name: supabaseUser.user_metadata?.name || supabaseUser.user_metadata?.full_name,
            avatar_url: supabaseUser.user_metadata?.avatar_url,
            phone: supabaseUser.phone || profile.phone_number,
            role: canonicalRole,
            manufacturer_id: profile.manufacturer_id ?? null,
            manufacturer_name,
          });
        }
      } catch (error) {
        const isSessionMissing = error instanceof Error && /Auth session missing/i.test(error.message);
        if (isSessionMissing && !didRetry) {
          try {
            const supabase = createClient();
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshed?.session) {
              return checkAdminAuth(true);
            }
          } catch {
            // fall through to logout
          }
        }
        if (!isSessionMissing) {
          console.error('Error checking admin auth:', error);
        }
        logout();
        if (isActive) setAuthStatus('unauthenticated');
        router.push('/login');
      }
    };

    checkAdminAuth();

    return () => {
      isActive = false;
    };
  }, [skip, isHydrated, authStatus, router, setUser, setAuthStatus, logout]);

  // 다른 탭에서의 로그아웃 / 리프레시 토큰 폐기 등 인증 상태 변화 구독
  useEffect(() => {
    if (skip) return;
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') {
        // If we're already unauthenticated, skip — the button handler is
        // already handling the redirect. This guards against cascade loops
        // when signOut() is invoked from both the button and this listener.
        if (useAuthStore.getState().authStatus === 'unauthenticated') return;
        setAuthStatus('unauthenticated');
        // Only navigate if not already on /login
        if (!pathname?.startsWith('/login')) {
          router.push('/login');
        }
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [skip, router, setAuthStatus, pathname]);

  // Handle role-based route access
  useEffect(() => {
    if (skip || authStatus !== 'authenticated' || !user?.role) return;

    const role = user.role as AdminRole;
    if (!isModooAdminAppRole(role)) return;

    const allowedRoutes = allowedRoutesByRole[role];
    const isAllowed = allowedRoutes.some(
      (route) => pathname === route || (pathname ?? '').startsWith(`${route}/`)
    );

    if (!isAllowed) {
      router.push(defaultRouteByRole[role]);
    }
  }, [skip, pathname, user?.role, authStatus, router]);

  return { authStatus, user, logout };
}
