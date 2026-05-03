import { createClient } from '@/lib/supabase-client';
import { normalizeProfileRole, assertBackofficeProfileRole } from '@/lib/auth-helpers';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AuthStatus = 'idle' | 'hydrating' | 'checking' | 'authenticated' | 'unauthenticated';

export interface UserData {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  phone?: string;
  role?: 'admin' | 'customer' | 'factory' | 'super_admin';
  manufacturer_id?: string | null;
  manufacturer_name?: string | null;
  created_at?: string;
}

interface AuthState {
  user: UserData | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authStatus: AuthStatus;

  // Set auth status
  setAuthStatus: (status: AuthStatus) => void;

  // Set user data and mark as authenticated
  setUser: (user: UserData) => void;

  // Clear user data and mark as not authenticated
  logout: () => void;

  // Update user profile
  updateUser: (updates: Partial<UserData>) => void;

  // Set loading state
  setLoading: (loading: boolean) => void;

  // Login with email and password
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;

  // Sign up with email and password
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string; needsEmailConfirmation?: boolean }>;

  // Request password reset email
  resetPasswordForEmail: (email: string) => Promise<{ success: boolean; error?: string }>;

  // Update password (for authenticated users after reset link)
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      authStatus: 'idle' as AuthStatus,

      setAuthStatus: (status: AuthStatus) =>
        set({ authStatus: status }),

      setUser: (user) =>
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          authStatus: 'authenticated',
        }),

      logout: async () => {
        try {
          const supabase = createClient();
          await supabase.auth.signOut();
        } catch (e) {
          console.error('Error signing out:', e);
        }
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          authStatus: 'unauthenticated',
        });
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      setLoading: (loading) =>
        set({
          isLoading: loading,
        }),

      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true });
          const supabase = createClient();

          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            set({ isLoading: false });
            return { success: false, error: error.message };
          }

          if (data.user) {
            const userId = data.user.id;

            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', userId)
              .maybeSingle();

            if (profileError) {
              await supabase.auth.signOut();
              set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
                authStatus: 'unauthenticated',
              });
              return { success: false, error: profileError.message };
            }

            const canonicalRole = normalizeProfileRole(profile?.role ?? null);
            if (!assertBackofficeProfileRole(canonicalRole)) {
              await supabase.auth.signOut();
              set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
                authStatus: 'unauthenticated',
              });
              return {
                success: false,
                error: !profile
                  ? '관리자 프로필을 찾을 수 없습니다. 계정 또는 Supabase 프로필/RLS 정책을 확인해주세요.'
                  : '관리자·공장·슈퍼관리자 계정만 모두관리에 로그인할 수 있습니다.',
              };
            }

            const userData: UserData = {
              id: data.user.id,
              email: data.user.email!,
              name: data.user.user_metadata?.name,
              avatar_url: data.user.user_metadata?.avatar_url,
              phone: data.user.phone,
              created_at: data.user.created_at,
              role: canonicalRole,
            };

            set({
              user: userData,
              isAuthenticated: true,
              isLoading: false,
              authStatus: 'checking',
            });

            return { success: true };
          }

          set({ isLoading: false });
          return { success: false, error: 'Login failed' };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, error: (err as Error).message };
        }
      },

      signUp: async (email: string, password: string) => {
        try {
          set({ isLoading: true });
          const supabase = createClient();

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
            },
          });

          if (error) {
            set({ isLoading: false });
            return { success: false, error: error.message };
          }

          if (data.user) {
            // Check if email confirmation is needed
            const needsEmailConfirmation = !data.session;

            if (data.session) {
              // User is auto-confirmed, set user data
              const userData: UserData = {
                id: data.user.id,
                email: data.user.email!,
                name: data.user.user_metadata?.name,
                avatar_url: data.user.user_metadata?.avatar_url,
                phone: data.user.phone,
                created_at: data.user.created_at,
              };

              set({
                user: userData,
                isAuthenticated: true,
                isLoading: false,
              });
            } else {
              set({ isLoading: false });
            }

            return { success: true, needsEmailConfirmation };
          }

          set({ isLoading: false });
          return { success: false, error: 'Sign up failed' };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, error: (err as Error).message };
        }
      },

      resetPasswordForEmail: async (email: string) => {
        try {
          set({ isLoading: true });
          const supabase = createClient();

          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/confirm`,
          });

          set({ isLoading: false });

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, error: (err as Error).message };
        }
      },

      updatePassword: async (newPassword: string) => {
        try {
          set({ isLoading: true });
          const supabase = createClient();

          const { error } = await supabase.auth.updateUser({ password: newPassword });

          set({ isLoading: false });

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true };
        } catch (err) {
          set({ isLoading: false });
          return { success: false, error: (err as Error).message };
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') {
          return localStorage;
        }
        // Return a no-op storage for SSR
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      skipHydration: true,
    }
  )
);
