'use client';

import { useRef } from 'react';

interface Props {
  onUpload: (payload: { dataUrl: string; nativeWidth: number; nativeHeight: number }) => void;
  hasImage: boolean;
}

export function MockupUploader({ onUpload, hasImage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        onUpload({ dataUrl, nativeWidth: img.naturalWidth, nativeHeight: img.naturalHeight });
      };
      img.onerror = () => console.error('[CALIB-TEST] failed to load image dimensions');
      img.src = dataUrl;
    };
    reader.onerror = () => console.error('[CALIB-TEST] failed to read file');
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.currentTarget.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
      >
        {hasImage ? 'mockup 교체' : 'mockup 업로드 (PNG)'}
      </button>
      <span className="text-xs text-gray-500">
        배경 투명 PNG 권장. 해상도 무관.
      </span>
    </div>
  );
}
