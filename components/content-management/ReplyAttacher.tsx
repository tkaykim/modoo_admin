'use client';

import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';

interface Props {
  urls: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}

const isImage = (u: string) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);

export default function ReplyAttacher({ urls, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('files', f));
      const res = await fetch('/api/admin/inquiries/replies/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '업로드 실패');
      const newUrls = (json?.data || []).map((d: { url: string }) => d.url);
      onChange([...urls, ...newUrls]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '업로드 실패');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (u: string) => onChange(urls.filter((x) => x !== u));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Paperclip className="w-3.5 h-3.5" />
          {uploading ? '업로드 중...' : '이미지/파일 첨부'}
        </button>
        {urls.length > 0 && <span className="text-xs text-gray-400">{urls.length}개 첨부</span>}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.ai"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {urls.map((u) => (
            <div key={u} className="relative group">
              {isImage(u) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u} alt="첨부" className="w-16 h-16 object-cover rounded border border-gray-200" />
              ) : (
                <a href={u} target="_blank" rel="noreferrer" className="flex items-center justify-center w-16 h-16 rounded border border-gray-200 bg-gray-50 text-[10px] text-gray-500 px-1 text-center">
                  파일
                </a>
              )}
              <button
                type="button"
                onClick={() => remove(u)}
                className="absolute -top-1.5 -right-1.5 bg-gray-800 text-white rounded-full w-4 h-4 flex items-center justify-center"
                aria-label="첨부 삭제"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
