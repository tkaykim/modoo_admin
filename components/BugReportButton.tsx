'use client';

import { useState, useRef, useEffect } from 'react';
import { AlertTriangle, X, Image as ImageIcon, Loader2, CheckCircle2 } from 'lucide-react';

type Severity = 'low' | 'medium' | 'high' | 'critical';

const SEVERITY_OPTIONS: { value: Severity; label: string; hint: string; color: string }[] = [
  { value: 'low', label: '낮음', hint: '불편하지만 작업 가능', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'medium', label: '보통', hint: '기능 일부 동작 안 함', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'high', label: '높음', hint: '업무 진행 불가', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'critical', label: '심각', hint: '서비스 장애 / 데이터 손상', color: 'bg-red-100 text-red-800 border-red-300' },
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function BugReportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  // Allow paste-from-clipboard for screenshots while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            void readFileAsDataUrl(file);
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [isOpen]);

  const readFileAsDataUrl = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setError('스크린샷이 너무 큽니다 (최대 5MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(reader.result as string);
      setScreenshotName(file.name || `paste-${Date.now()}.png`);
      setError(null);
    };
    reader.onerror = () => setError('파일을 읽지 못했습니다.');
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!title.trim()) { setError('제목을 입력해주세요.'); return; }
    if (!description.trim()) { setError('증상을 자세히 설명해주세요.'); return; }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          severity,
          pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          screenshotDataUrl: screenshot ?? undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body.error || '신고 접수에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      setSuccess(true);
      // Reset form for next time, but keep modal open briefly to show success
      setTimeout(() => {
        setIsOpen(false);
        setTitle('');
        setDescription('');
        setSeverity('medium');
        setScreenshot(null);
        setScreenshotName('');
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(`네트워크 오류: ${(err as Error).message}`);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
        title="현재 발견한 버그/오류를 즉시 신고합니다"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        고장신고
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !isSubmitting && setIsOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h2 className="text-base font-bold text-gray-900">버그/오류 신고</h2>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setIsOpen(false)}
                disabled={isSubmitting}
                className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {success ? (
              <div className="px-5 py-10 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-50 mb-3">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-gray-900 mb-1">신고가 접수되었습니다</p>
                <p className="text-xs text-gray-600">개발팀에 이메일로 전달되었습니다.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
                <p className="text-xs text-gray-500 leading-relaxed">
                  현재 페이지({typeof window !== 'undefined' ? window.location.pathname : ''})와 브라우저 정보가 자동으로 함께 전송됩니다.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    제목 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="예: 제품 색상 저장 안 됨"
                    disabled={isSubmitting}
                    maxLength={200}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:bg-gray-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    심각도 <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SEVERITY_OPTIONS.map((opt) => (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setSeverity(opt.value)}
                        disabled={isSubmitting}
                        className={`px-3 py-2 text-left border rounded-md text-xs transition-all disabled:opacity-50 ${
                          severity === opt.value
                            ? `${opt.color} ring-2 ring-offset-1 ring-current`
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="font-semibold">{opt.label}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">{opt.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    증상 설명 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="어떤 작업을 시도했고, 무엇이 잘못 동작했는지 자세히 알려주세요.&#10;&#10;예시:&#10;1) 제품 관리 → A제품 클릭&#10;2) 색상을 화이트로 변경 후 저장&#10;3) 새로고침했더니 블랙으로 돌아감"
                    rows={6}
                    disabled={isSubmitting}
                    maxLength={5000}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:bg-gray-50 resize-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">{description.length} / 5000</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    스크린샷 (선택)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void readFileAsDataUrl(file);
                      e.currentTarget.value = '';
                    }}
                    disabled={isSubmitting}
                  />
                  {screenshot ? (
                    <div className="border border-gray-200 rounded-md p-2 bg-gray-50">
                      <img src={screenshot} alt="screenshot preview" className="max-h-40 mx-auto rounded" />
                      <div className="flex items-center justify-between mt-2 text-xs">
                        <span className="text-gray-600 truncate">{screenshotName}</span>
                        <button
                          type="button"
                          onClick={() => { setScreenshot(null); setScreenshotName(''); }}
                          disabled={isSubmitting}
                          className="text-red-600 hover:text-red-800 ml-2 shrink-0"
                        >
                          제거
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSubmitting}
                      className="w-full px-3 py-3 border border-dashed border-gray-300 rounded-md text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <ImageIcon className="w-4 h-4" />
                      파일 선택하거나 Ctrl+V로 붙여넣기
                    </button>
                  )}
                </div>

                {error && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition disabled:bg-gray-400 inline-flex items-center gap-2 min-w-[100px] justify-center"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        전송 중...
                      </>
                    ) : '신고 접수'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
