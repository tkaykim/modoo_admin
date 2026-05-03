import Link from 'next/link';

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white shadow-md rounded-xl p-6 border border-gray-200/60 text-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">인증 오류</h2>
          <p className="text-sm text-red-700 mb-4">
            인증 과정에서 오류가 발생했습니다.
            링크가 만료되었거나 유효하지 않을 수 있습니다.
          </p>
          <div className="space-y-2">
            <Link
              href="/login"
              className="inline-block w-full rounded-md bg-blue-600 px-4 py-2 text-white text-sm font-semibold hover:bg-blue-700"
            >
              로그인으로 돌아가기
            </Link>
            <Link
              href="/reset-password"
              className="inline-block w-full rounded-md border border-blue-600 px-4 py-2 text-blue-600 text-sm font-semibold hover:bg-blue-50"
            >
              비밀번호 재설정 다시 요청
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
