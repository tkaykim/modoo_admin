'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, Loader2, Building2, CheckCircle, AlertCircle } from 'lucide-react';
import { PartnerMall } from '@/types/types';

interface PartnerMallInfoEditorProps {
  partnerMall: PartnerMall;
  onClose: () => void;
  onSave: (updated: PartnerMall) => void;
}

export default function PartnerMallInfoEditor({
  partnerMall,
  onClose,
  onSave,
}: PartnerMallInfoEditorProps) {
  const [name, setName] = useState(partnerMall.name);
  const [slug, setSlug] = useState(partnerMall.slug || '');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>(
    partnerMall.slug ? 'available' : 'idle'
  );
  const [slugMessage, setSlugMessage] = useState('');
  const slugCheckTimeout = useRef<NodeJS.Timeout | null>(null);
  const [logoUrl, setLogoUrl] = useState(partnerMall.logo_url);
  const [originalLogoUrl, setOriginalLogoUrl] = useState(partnerMall.original_logo_url);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkSlugAvailability = useCallback(async (value: string) => {
    if (!value) {
      setSlugStatus('idle');
      setSlugMessage('');
      return;
    }
    const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
    if (!slugRegex.test(value)) {
      setSlugStatus('invalid');
      setSlugMessage('영문 소문자, 숫자, 하이픈(-)만 가능');
      return;
    }
    if (value.length < 2) {
      setSlugStatus('invalid');
      setSlugMessage('2자 이상 입력해주세요');
      return;
    }
    setSlugStatus('checking');
    try {
      const res = await fetch(`/api/admin/partner-malls/check-slug?slug=${encodeURIComponent(value)}&exclude_id=${partnerMall.id}`);
      const result = await res.json();
      setSlugStatus(result.available ? 'available' : 'taken');
      setSlugMessage(result.message || '');
    } catch {
      setSlugStatus('invalid');
      setSlugMessage('확인 실패');
    }
  }, [partnerMall.id]);

  const handleSlugChange = (value: string) => {
    const formatted = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(formatted);
    setSlugStatus('idle');
    setSlugMessage('');
    if (slugCheckTimeout.current) clearTimeout(slugCheckTimeout.current);
    if (formatted) {
      slugCheckTimeout.current = setTimeout(() => checkSlugAvailability(formatted), 400);
    }
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('올바른 이미지 형식이 아닙니다.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;

        // Process with background removal
        let processedBase64 = base64;
        try {
          const response = await fetch('/api/admin/remove-background', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64 }),
          });

          if (response.ok) {
            const result = await response.json();
            processedBase64 = result.processedUrl || base64;
          }
        } catch (err) {
          console.error('Background removal error:', err);
        }

        // Upload processed logo to storage
        try {
          const uploadResponse = await fetch('/api/admin/partner-malls/upload-logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: processedBase64,
              partnerMallId: partnerMall.id,
            }),
          });

          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            setLogoUrl(uploadResult.url);
          } else {
            // Fallback to data URL if upload fails
            setLogoUrl(processedBase64);
          }
        } catch (err) {
          console.error('Logo storage upload error:', err);
          setLogoUrl(processedBase64);
        }

        // Upload original logo to storage
        try {
          const originalUploadResponse = await fetch('/api/admin/partner-malls/upload-logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64,
              partnerMallId: `${partnerMall.id}-original`,
            }),
          });

          if (originalUploadResponse.ok) {
            const originalUploadResult = await originalUploadResponse.json();
            setOriginalLogoUrl(originalUploadResult.url);
          } else {
            setOriginalLogoUrl(base64);
          }
        } catch (err) {
          console.error('Original logo storage upload error:', err);
          setOriginalLogoUrl(base64);
        }

        setIsUploading(false);
      };

      reader.onerror = () => {
        setError('파일을 읽는데 실패했습니다.');
        setIsUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error('File upload error:', err);
      setError('파일 업로드에 실패했습니다.');
      setIsUploading(false);
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!name.trim()) {
      setError('파트너몰명을 입력해주세요.');
      return;
    }

    if (slug && slugStatus !== 'available') {
      setError('슬러그를 확인해주세요.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/partner-malls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: partnerMall.id,
          name: name.trim(),
          slug: slug || null,
          logo_url: logoUrl,
          original_logo_url: originalLogoUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || '저장에 실패했습니다.');
      }

      const result = await response.json();
      onSave(result.data);
    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-xl sm:rounded-xl sm:max-w-md w-full sm:mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">파트너몰 정보 수정</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              로고
            </label>
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                {isUploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                ) : logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <Building2 className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center gap-2 py-2 px-3 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  새 로고 업로드
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  배경이 자동으로 제거됩니다.
                </p>
              </div>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              파트너몰명
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="파트너몰 이름을 입력하세요"
              className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              슬러그 (URL 주소)
            </label>
            <div className="relative">
              <input
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="예: samsung, lg-electronics"
                className={`w-full px-3 py-2.5 sm:py-2 border rounded-lg text-base focus:outline-none focus:ring-2 focus:border-transparent ${
                  slugStatus === 'available' ? 'border-green-400 focus:ring-green-500' :
                  slugStatus === 'taken' || slugStatus === 'invalid' ? 'border-red-400 focus:ring-red-500' :
                  'border-gray-300 focus:ring-blue-500'
                }`}
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {slugStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                {slugStatus === 'available' && <CheckCircle className="w-4 h-4 text-green-500" />}
                {(slugStatus === 'taken' || slugStatus === 'invalid') && <AlertCircle className="w-4 h-4 text-red-500" />}
              </div>
            </div>
            {slugMessage && (
              <p className={`mt-1 text-xs ${
                slugStatus === 'available' ? 'text-green-600' :
                slugStatus === 'taken' || slugStatus === 'invalid' ? 'text-red-600' :
                'text-gray-500'
              }`}>
                {slugMessage}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              modoouniform.com/mall/<span className="font-medium">{slug || 'slug'}</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 sm:py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isUploading || (!!slug && slugStatus !== 'available')}
            className="flex-1 py-2.5 sm:py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                저장 중...
              </>
            ) : (
              '저장'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
