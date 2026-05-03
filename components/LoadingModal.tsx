'use client';

interface LoadingModalProps {
  isOpen: boolean;
  message?: string;
  submessage?: string;
}

export default function LoadingModal({
  isOpen,
  message = '처리 중...',
  submessage,
}: LoadingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white px-5 py-4 text-center shadow-lg border border-gray-200/60">
        <div className="mx-auto mb-3 h-10 w-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
        <p className="text-sm font-semibold text-gray-900">{message}</p>
        {submessage && (
          <p className="mt-1 text-xs text-gray-500">{submessage}</p>
        )}
      </div>
    </div>
  );
}
