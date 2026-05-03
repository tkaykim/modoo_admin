'use client';

import { useState, useRef } from 'react';
import { Paperclip, Download, Upload, Loader2, X, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { uploadFileToStorage } from '@/lib/supabase-storage';

const FILE_ACCEPT = 'image/*,.pdf,.ai,.psd,.eps,.svg,.zip';

interface OrderAttachmentSectionProps {
  orderId: string;
  attachmentUrls: string[];
  onUrlsUpdated: (urls: string[]) => void;
  compact?: boolean;
  readonly?: boolean;
  isAdmin?: boolean;
}

interface PendingFile {
  file: File;
  status: 'uploading' | 'done' | 'error';
}

export default function OrderAttachmentSection({
  orderId,
  attachmentUrls,
  onUrlsUpdated,
  compact = false,
  readonly = false,
  isAdmin = false,
}: OrderAttachmentSectionProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);
    const pending: PendingFile[] = newFiles.map((f) => ({ file: f, status: 'uploading' as const }));
    setPendingFiles((prev) => [...prev, ...pending]);
    setIsUploading(true);

    try {
      const supabase = createClient();
      const uploadedUrls: string[] = [];

      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        const result = await uploadFileToStorage(supabase, file, 'order-attachments', `attachments/${orderId}`);
        if (result.success && result.url) {
          uploadedUrls.push(result.url);
          setPendingFiles((prev) =>
            prev.map((p) => (p.file === file ? { ...p, status: 'done' as const } : p))
          );
        } else {
          setPendingFiles((prev) =>
            prev.map((p) => (p.file === file ? { ...p, status: 'error' as const } : p))
          );
        }
      }

      if (uploadedUrls.length > 0) {
        const res = await fetch('/api/admin/orders/attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, newUrls: uploadedUrls }),
        });

        if (res.ok) {
          const { data } = await res.json();
          onUrlsUpdated(data.attachment_urls);
        } else {
          onUrlsUpdated([...attachmentUrls, ...uploadedUrls]);
        }
      }
    } catch (error) {
      console.error('File upload error:', error);
    } finally {
      setIsUploading(false);
      setPendingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (url: string) => {
    if (!confirm('이 첨부파일을 삭제하시겠습니까?')) return;

    setDeletingUrl(url);
    try {
      const res = await fetch('/api/admin/orders/attachments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, url }),
      });

      if (res.ok) {
        const { data } = await res.json();
        onUrlsUpdated(data.attachment_urls);
      } else {
        const { error } = await res.json();
        alert(error || '삭제에 실패했습니다.');
      }
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingUrl(null);
    }
  };

  const textSize = compact ? 'text-[11px]' : 'text-sm';
  const iconSize = compact ? 'w-3 h-3' : 'w-4 h-4';
  const headerIconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const itemPadding = compact ? 'px-2 py-1.5' : 'px-3 py-2';
  const headerSize = compact ? 'text-[11px]' : 'text-xs';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Paperclip className={`${headerIconSize} text-gray-400`} />
          <span className={`${headerSize} text-gray-500 font-semibold ${compact ? 'uppercase tracking-wide' : ''}`}>
            첨부파일 ({attachmentUrls.length})
          </span>
        </div>
        {!readonly && (
          <label className={`flex items-center gap-1 ${itemPadding} ${textSize} text-blue-600 hover:bg-blue-50 rounded cursor-pointer transition-colors`}>
            {isUploading ? (
              <Loader2 className={`${iconSize} animate-spin`} />
            ) : (
              <Upload className={iconSize} />
            )}
            <span>{isUploading ? '업로드 중...' : '추가'}</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              onChange={handleFileSelect}
              className="hidden"
              disabled={isUploading}
            />
          </label>
        )}
      </div>

      <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
        {attachmentUrls.map((url, index) => {
          const filename = url.split('/').pop() || `첨부파일 ${index + 1}`;
          const isDeleting = deletingUrl === url;
          return (
            <div
              key={index}
              className={`flex items-center gap-${compact ? '1.5' : '2'} ${itemPadding} ${textSize} text-blue-700 bg-blue-50 border border-blue-100 rounded${compact ? '' : '-md'} group`}
            >
              <a
                href={url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 min-w-0 flex-1 hover:underline"
              >
                <Download className={`${iconSize} shrink-0`} />
                <span className="truncate">{decodeURIComponent(filename)}</span>
              </a>
              {isAdmin && !readonly && (
                <button
                  type="button"
                  onClick={() => handleDelete(url)}
                  disabled={isDeleting}
                  className="shrink-0 p-0.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                  title="첨부파일 삭제"
                >
                  {isDeleting ? (
                    <Loader2 className={`${iconSize} animate-spin`} />
                  ) : (
                    <Trash2 className={iconSize} />
                  )}
                </button>
              )}
            </div>
          );
        })}

        {pendingFiles.map((pf, index) => (
          <div
            key={`pending-${index}`}
            className={`flex items-center gap-${compact ? '1.5' : '2'} ${itemPadding} ${textSize} rounded${compact ? '' : '-md'} border ${
              pf.status === 'error'
                ? 'text-red-600 bg-red-50 border-red-100'
                : 'text-gray-500 bg-gray-50 border-gray-100'
            }`}
          >
            {pf.status === 'uploading' ? (
              <Loader2 className={`${iconSize} shrink-0 animate-spin`} />
            ) : pf.status === 'error' ? (
              <X className={`${iconSize} shrink-0`} />
            ) : (
              <Download className={`${iconSize} shrink-0`} />
            )}
            <span className="truncate">{pf.file.name}</span>
            <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-400 shrink-0`}>
              {pf.status === 'uploading'
                ? '업로드 중...'
                : pf.status === 'error'
                ? '실패'
                : '완료'}
            </span>
          </div>
        ))}
      </div>

      {attachmentUrls.length === 0 && pendingFiles.length === 0 && !readonly && (
        <p className={`${textSize} text-gray-400 mt-1`}>첨부파일이 없습니다.</p>
      )}
    </div>
  );
}
