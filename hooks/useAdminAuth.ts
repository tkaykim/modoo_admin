'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { normalizeProfileRole, assertBackofficeProfileRole, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { useAuthStore, type AuthStatus, type UserData } from '@/store/useAuthStore';

type AdminRole = 'admin' | 'factory' | 'super_admin';

const adminRoutes = ['/dashboard', '/analytics', '/products', '/designs', '/content', '/orders', '/purchase-orders', '/factories', '/cobuy', '/partner_malls', '/coupons', '/users', '/settings', '/editor', '/print-methods', '/invoices', '/shipping', '/test', '/salespersons'];

const allowedRoutesByRole: Record<AdminRole, string[]> = {
  admin: adminRoutes,
  factory: ['/orders', '/users', '/editor'],
  super_admin: [...adminRoutes, '/finance'],
};

const defaultRouteByRole: Record<AdminRole, string> = {
  admin: '/dashboard',
  factory: '/orders',
  super_admin: '/dashboard',
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

    const checkAdminAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { user: supabaseUser }, error: getUserError } = await supabase.auth.getUser();

        // 세션이 없을 때 SDK가 AuthSessionMissingError를 throw하지 않고 error로 반환하도록 처리.
        // 세션 부재는 정상적인 비로그인 상태이므로 콘솔 에러로 남기지 않고 조용히 로그인으로 보낸다.
        if (getUserError || !supabaseUser) {
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
        if (!assertBackofficeProfileRole(canonicalRole)) {
          console.error(
            '[모두관리] 허용되지 않은 역할입니다. 필요: admin · factory · super_admin (표준 문자열 또는 super-admin 형태). 현재값:',
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
        // AuthSessionMissingError는 비로그인 상태의 정상 흐름이므로 에러 로그를 남기지 않는다.
        const isSessionMissing = error instanceof Error && /Auth session missing/i.test(error.message);
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

  // Handle role-based route access
  useEffect(() => {
    if (skip || authStatus !== 'authenticated' || !user?.role) return;

    const role = user.role as AdminRole;
    if (!isBackofficeOperatorRole(role)) return;

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
