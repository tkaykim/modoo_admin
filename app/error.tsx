'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-center p-8 max-w-md">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          오류가 발생했습니다
        </h2>
        <p className="text-gray-600 mb-6">
          페이지를 불러오는 중 문제가 발생했습니다.
        </p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
