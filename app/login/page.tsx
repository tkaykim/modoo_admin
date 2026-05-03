'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';

/** Same-origin path only; blocks open redirects. */
function getSafeInternalRedirect(raw: string | null): string {
  if (!raw || typeof raw !== 'string') return '/';
  try {
    const path = decodeURIComponent(raw.trim());
    if (!path.startsWith('/') || path.startsWith('//')) return '/';
    if (path.includes('://') || path.includes('\\')) return '/';
    return path;
  } catch {
    return '/';
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const sha = process.env.NEXT_PUBLIC_MODOO_ADMIN_DEPLOY_SHA;
    console.info('[modoo_admin]', '번들 버전(commit/deployment_sha):', sha || '(설정 없음)');
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(email.trim(), password);
    setIsSubmitting(false);

    if (!result.success) {
      setErrorMessage(result.error || '로그인에 실패했습니다.');
      return;
    }

    const next = getSafeInternalRedirect(searchParams.get('redirect'));
    router.push(next);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white shadow-md rounded-xl p-6 border border-gray-200/60">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-900">관리자 로그인</h1>
          <p className="text-sm text-gray-500 mt-2">관리자/공장 계정으로 로그인하세요.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="email">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="password">
                비밀번호
              </label>
              <Link
                href="/reset-password"
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                비밀번호를 잊으셨나요?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          {errorMessage && (
            <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
