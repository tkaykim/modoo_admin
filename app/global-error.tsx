'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              오류가 발생했습니다
            </h2>
            <p className="text-gray-600 mb-6">
              페이지를 불러오는 중 문제가 발생했습니다.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => reset()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                다시 시도
              </button>
              <button
                onClick={() => {
                  // Clear auth storage and reload
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('auth-storage');
                    window.location.href = '/login';
                  }
                }}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                로그인 페이지로 이동
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
