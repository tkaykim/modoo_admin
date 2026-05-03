'use client';

import React, { useState } from 'react';
import { useCanvasStore } from '@/store/useCanvasStore';
import { Download, Upload, Loader2 } from 'lucide-react';

/**
 * Example component demonstrating SVG export functionality
 *
 * Usage:
 * - Add this component to your editor page
 * - Users can export text objects as SVG
 * - Choose to download locally or upload to Supabase
 */
export default function ExportTextButton() {
  const {
    exportTextToSVG,
    exportAndUploadTextToSVG,
    exportAndUploadAllTextToSVG,
    activeSideId
  } = useCanvasStore();

  const [isLoading, setIsLoading] = useState(false);
  const [lastUploadUrl, setLastUploadUrl] = useState<string | null>(null);

  /**
   * Export current canvas text to SVG and download locally
   */
  const handleDownloadSVG = () => {
    const result = exportTextToSVG();

    if (!result || !result.svg) {
      alert('현재 캔버스에 텍스트가 없습니다.');
      return;
    }

    // Create download link
    const blob = new Blob([result.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `text-${activeSideId}-${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(url);

    alert(`SVG 다운로드 완료! (${result.textObjects.length}개 텍스트)`);
  };

  /**
   * Export current canvas text to SVG and upload to Supabase
   */
  const handleUploadSVG = async () => {
    setIsLoading(true);
    setLastUploadUrl(null);

    try {
      const result = await exportAndUploadTextToSVG();

      if (!result || !result.uploadResult?.success) {
        alert('업로드 실패: ' + (result?.uploadResult?.error || '알 수 없는 오류'));
        return;
      }

      setLastUploadUrl(result.uploadResult.url || null);
      alert(
        `SVG 업로드 완료!\n` +
        `텍스트 개수: ${result.textObjects.length}\n` +
        `URL: ${result.uploadResult.url}`
      );
    } catch (error) {
      console.error('Upload error:', error);
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Export all canvases text to SVG and upload to Supabase
   */
  const handleUploadAllSVG = async () => {
    setIsLoading(true);

    try {
      const results = await exportAndUploadAllTextToSVG();

      const successCount = Object.values(results).filter(
        r => r.uploadResult?.success
      ).length;

      const urls = Object.entries(results)
        .filter(([_, r]) => r.uploadResult?.success)
        .map(([sideId, r]) => `${sideId}: ${r.uploadResult?.url}`)
        .join('\n');

      alert(
        `모든 면의 SVG 업로드 완료!\n` +
        `성공: ${successCount}개\n\n` +
        urls
      );
    } catch (error) {
      console.error('Upload all error:', error);
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-4 bg-white rounded-lg shadow border border-gray-200">
      <h3 className="font-semibold text-sm text-gray-700">텍스트 SVG 내보내기</h3>

      <div className="flex gap-2">
        {/* Download SVG locally */}
        <button
          onClick={handleDownloadSVG}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <Download className="size-4" />
          다운로드
        </button>

        {/* Upload current canvas SVG */}
        <button
          onClick={handleUploadSVG}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          업로드
        </button>

        {/* Upload all canvases SVG */}
        <button
          onClick={handleUploadAllSVG}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          전체 업로드
        </button>
      </div>

      {/* Show last uploaded URL */}
      {lastUploadUrl && (
        <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">마지막 업로드:</p>
          <a
            href={lastUploadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline break-all"
          >
            {lastUploadUrl}
          </a>
        </div>
      )}
    </div>
  );
}
