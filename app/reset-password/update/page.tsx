'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';
import { createClient } from '@/lib/supabase-client';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);
  const router = useRouter();
  const { updatePassword, isLoading } = useAuthStore();

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        setIsValidSession(true);
      } else {
        setIsValidSession(false);
      }
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password || !confirmPassword) {
      setError('모든 필드를 입력해주세요.');
      return;
    }

    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    const result = await updatePassword(password);

    if (!result.success) {
      setError(result.error || '비밀번호 변경에 실패했습니다.');
      return;
    }

    setSuccess(true);

    setTimeout(() => {
      router.push('/login');
    }, 3000);
  };

  if (isValidSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full"></div>
      </div>
    );
  }

  if (isValidSession === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white shadow-md rounded-xl p-6 border border-gray-200/60 text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">유효하지 않은 링크</h2>
            <p className="text-sm text-red-700 mb-4">
              비밀번호 재설정 링크가 만료되었거나 유효하지 않습니다.
            </p>
            <Link
              href="/reset-password"
              className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white text-sm font-semibold hover:bg-blue-700"
            >
              다시 요청하기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white shadow-md rounded-xl p-6 border border-gray-200/60 text-center">
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-green-800 mb-2">비밀번호가 변경되었습니다</h2>
            <p className="text-sm text-green-700">
              새 비밀번호로 로그인하실 수 있습니다.
              잠시 후 로그인 페이지로 이동합니다...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white shadow-md rounded-xl p-6 border border-gray-200/60">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-900">새 비밀번호 설정</h1>
          <p className="text-sm text-gray-500 mt-2">
            새로운 비밀번호를 입력해주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="password">
              새 비밀번호
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              placeholder="최소 6자 이상"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="confirmPassword">
              비밀번호 확인
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              placeholder="비밀번호를 다시 입력해주세요"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? '처리중...' : '비밀번호 변경'}
          </button>
        </form>
      </div>
    </div>
  );
}
