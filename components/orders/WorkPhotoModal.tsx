'use client';

import { useState, useRef, useEffect } from 'react';

interface WorkPhotoModalProps {
  open: boolean;
  orderItemId: string;
  designTitle: string | null;
  folderUrl: string | null;
  onClose: () => void;
  onUploaded?: (folderUrl: string) => void;
}

/**
 * 작업사진 모달 — 카메라 촬영·업로드 또는 Drive 폴더 새창 열기.
 * 관리자·공장 사용자 공통.
 */
export default function WorkPhotoModal({
  open,
  orderItemId,
  designTitle,
  folderUrl,
  onClose,
  onUploaded,
}: WorkPhotoModalProps) {
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ count: number; folderUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setUploading(false);
      setProgressText(null);
      setLastResult(null);
    }
  }, [open]);

  if (!open) return null;

  const triggerCamera = () => {
    fileInputRef.current?.click();
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setProgressText(`${files.length}장 업로드 중...`);
    try {
      const form = new FormData();
      form.append('orderItemId', orderItemId);
      for (const f of files) form.append('files', f);

      const res = await fetch('/api/admin/orders/items/upload-work-photo', {
        method: 'POST',
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '업로드 실패');

      setLastResult({
        count: payload.uploaded?.length ?? files.length,
        folderUrl: payload.folderUrl || folderUrl || '',
      });
      setProgressText(null);
      if (onUploaded && payload.folderUrl) onUploaded(payload.folderUrl);
    } catch (err) {
      setProgressText(null);
      alert(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
      // 같은 파일 다시 선택 가능하도록 reset
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openFolder = () => {
    if (folderUrl) {
      window.open(folderUrl, '_blank', 'noopener,noreferrer');
    } else {
      alert('Drive 폴더 링크가 아직 준비되지 않았습니다. 사진을 한 장 업로드하면 자동 생성됩니다.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">작업사진</h3>
          {designTitle && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{designTitle}</p>
          )}
        </div>

        <div className="p-5 space-y-3">
          {lastResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              ✅ {lastResult.count}장 업로드 완료
            </div>
          )}

          {progressText && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              ⏳ {progressText}
            </div>
          )}

          <button
            type="button"
            onClick={triggerCamera}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium text-sm transition-colors disabled:opacity-60"
          >
            📷 사진 촬영 / 업로드
          </button>
          <p className="text-[11px] text-gray-500 text-center -mt-1">
            모바일은 카메라 즉시 실행 · PC는 파일 선택
          </p>

          <button
            type="button"
            onClick={openFolder}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium text-sm transition-colors disabled:opacity-60"
          >
            📁 Drive 폴더 열기
          </button>
          <p className="text-[11px] text-gray-500 text-center -mt-1">
            업로드된 모든 작업사진 보기
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-60"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
