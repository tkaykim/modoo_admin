'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/useAuthStore';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { resetPasswordForEmail, isLoading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('이메일을 입력해주세요.');
      return;
    }

    const result = await resetPasswordForEmail(email);

    if (!result.success) {
      setError(result.error || '비밀번호 재설정 요청에 실패했습니다.');
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white shadow-md rounded-xl p-6 border border-gray-200/60">
          <div className="text-center mb-6">
            <Link href="/login" className="text-sm text-blue-600 hover:text-blue-700">
              ← 로그인으로 돌아가기
            </Link>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <h2 className="text-lg font-semibold text-green-800 mb-2">이메일을 확인해주세요</h2>
            <p className="text-sm text-green-700">
              {email}로 비밀번호 재설정 링크를 보냈습니다.
              이메일을 확인하여 비밀번호를 재설정해주세요.
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
          <Link href="/login" className="text-sm text-blue-600 hover:text-blue-700">
            ← 로그인으로 돌아가기
          </Link>
        </div>

        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-900">비밀번호 찾기</h1>
          <p className="text-sm text-gray-500 mt-2">
            가입한 이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="email">
              이메일
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
              placeholder="admin@example.com"
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
            {isLoading ? '처리중...' : '재설정 링크 보내기'}
          </button>
        </form>
      </div>
    </div>
  );
}
