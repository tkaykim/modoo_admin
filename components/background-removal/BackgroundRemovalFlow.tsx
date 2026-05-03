'use client';

import { useEffect, useMemo, useState } from 'react';

export type ModelKey = 'isnet_fp16' | 'isnet_quint8' | 'isnet';
type Engine = 'imgly' | 'chroma' | 'hybrid';
type Step =
  | 'upload'
  | 'ask'
  | 'processing'
  | 'review'
  | 'designer-form'
  | 'designer-done';
type Progress = { key: string; current: number; total: number } | null;
type Tier = { engine: Engine; model: ModelKey; statusLabel: string };

const TIERS: Tier[] = [
  { engine: 'hybrid', model: 'isnet_quint8', statusLabel: '이미지를 분석하고 있어요' },
  { engine: 'imgly', model: 'isnet_fp16', statusLabel: '더 정교하게 다듬고 있어요' },
  { engine: 'imgly', model: 'isnet', statusLabel: '한 번 더 꼼꼼히 살펴보고 있어요' },
];

const MAX_BYTES = 25 * 1024 * 1024;

const PROGRESS_KEY_LABEL: Record<string, string> = {
  fetch: '이미지 분석 도구 받는 중',
  compute: '배경 분석 중',
  decode: '준비 중',
};

function humanizeProgressKey(key: string): string {
  for (const k of Object.keys(PROGRESS_KEY_LABEL)) {
    if (key.toLowerCase().includes(k)) return PROGRESS_KEY_LABEL[k];
  }
  return '처리 중';
}

export async function clearBackgroundRemovalCache(): Promise<string> {
  const messages: string[] = [];
  try {
    if ('caches' in self) {
      const keys = await caches.keys();
      const matched = keys.filter((k) => /imgly|background-removal|onnx/i.test(k));
      for (const k of matched) await caches.delete(k);
      messages.push(`Cache: ${matched.length}`);
    }
  } catch {}
  try {
    const idb = (indexedDB as unknown as { databases?: () => Promise<{ name?: string }[]> }).databases;
    if (typeof idb === 'function') {
      const dbs = await idb.call(indexedDB);
      const matched = dbs.filter((d) => d.name && /imgly|background-removal|onnx/i.test(d.name));
      await Promise.all(
        matched.map(
          (d) =>
            new Promise<void>((res) => {
              if (!d.name) return res();
              const req = indexedDB.deleteDatabase(d.name);
              req.onsuccess = req.onerror = req.onblocked = () => res();
            }),
        ),
      );
      messages.push(`IDB: ${matched.length}`);
    }
  } catch {}
  return messages.join(' · ') || 'no-op';
}

export async function preloadBackgroundRemoval(model: ModelKey = 'isnet_quint8'): Promise<void> {
  try {
    const mod = await import('@imgly/background-removal');
    const preload = (mod as unknown as { preload?: (cfg?: unknown) => Promise<void> }).preload;
    if (typeof preload === 'function') {
      await preload({ model });
    }
  } catch {
    // Silent — prefetch is best-effort
  }
}

async function chromaKeyRemove(
  file: File | Blob,
  tolerance: number,
): Promise<{ blob: Blob; matched: boolean }> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const w = canvas.width;
  const h = canvas.height;
  const corners: Array<[number, number]> = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  const cornerColors = corners.map(([x, y]) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  });
  const avg = [0, 1, 2].map(
    (c) => cornerColors.reduce((s, col) => s + col[c], 0) / cornerColors.length,
  );
  const maxDiff = Math.max(
    ...cornerColors.flatMap((col) => col.map((v, i) => Math.abs(v - avg[i]))),
  );
  if (maxDiff > 25) {
    return { blob: file instanceof Blob ? file : new Blob(), matched: false };
  }
  const [bgR, bgG, bgB] = avg;
  const t = tolerance;
  const t2 = tolerance * 2;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bgR;
    const dg = data[i + 1] - bgG;
    const db = data[i + 2] - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < t) data[i + 3] = 0;
    else if (dist < t2) data[i + 3] = Math.round((255 * (dist - t)) / t);
  }
  ctx.putImageData(imgData, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    );
  });
  return { blob, matched: true };
}

async function runImgly(
  input: File | Blob,
  model: ModelKey,
  onProgress: (p: Progress) => void,
): Promise<Blob> {
  const mod = await import('@imgly/background-removal');
  return await mod.removeBackground(input, {
    output: { format: 'image/png' },
    model,
    progress: (key: string, current: number, total: number) => {
      onProgress({ key, current, total });
    },
  });
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`inline-block animate-spin ${className}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProgressBar({ progress, fallbackLabel }: { progress: Progress; fallbackLabel: string }) {
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;
  const indeterminate = pct === null;
  const label = progress ? humanizeProgressKey(progress.key) : fallbackLabel;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm text-gray-700">
        <span className="flex items-center gap-2">
          <Spinner className="text-gray-700" />
          {label}
        </span>
        {!indeterminate && <span className="tabular-nums text-xs text-gray-500">{pct}%</span>}
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-gray-100">
        {indeterminate ? (
          <div
            key="indeterminate"
            className="absolute inset-y-0 left-0 w-1/3 animate-pulse rounded-full bg-gray-700"
          />
        ) : (
          <div
            key={`determinate-${pct}`}
            className="absolute inset-y-0 left-0 rounded-full bg-gray-900"
            style={{ width: pct === 0 ? '0%' : `${Math.max(pct, 2)}%` }}
          />
        )}
      </div>
    </div>
  );
}

const checkerStyle: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
  backgroundColor: '#fff',
};

export type DesignerRequestPayload = {
  name: string;
  contact: string;
  note: string;
  file: File;
};

export type FlowResult = {
  blob: Blob;
  /** true: user accepted bg-removed result. false: user opted to keep original or this is a designer-pending placeholder. */
  usedRemoval: boolean;
  attempts: number;
  /**
   * true when the user delegated background removal to a designer.
   * The provided blob is the original image, intended as a placeholder
   * on the canvas so the user can lay out position/size while waiting
   * for the designer's final result. Editor should mark the resulting
   * canvas object with a "디자이너 작업 중" badge and replace it once
   * the designer's processed image arrives.
   */
  designerPending?: boolean;
};

export type BackgroundRemovalFlowProps = {
  /**
   * Provide if file has already been picked elsewhere (e.g. editor's image picker).
   * If omitted, the flow shows its own upload step.
   */
  initialFile?: File;
  onComplete: (result: FlowResult) => void;
  onCancel?: () => void;
  /** Optional handler. If omitted, the flow shows its own success message after submit. */
  onDesignerRequest?: (payload: DesignerRequestPayload) => void | Promise<void>;
  /** Force a specific model (skip auto-escalation). Mostly for testing. */
  forceModel?: ModelKey;
  /** Chroma-key tolerance for solid-bg detection. Default 8. */
  chromaTolerance?: number;
  className?: string;
};

export function BackgroundRemovalFlow({
  initialFile,
  onComplete,
  onCancel,
  onDesignerRequest,
  forceModel,
  chromaTolerance = 8,
  className = '',
}: BackgroundRemovalFlowProps) {
  const [step, setStep] = useState<Step>(initialFile ? 'ask' : 'upload');
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [attemptBlobs, setAttemptBlobs] = useState<Blob[]>([]);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(null);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [requesterName, setRequesterName] = useState('');
  const [requesterContact, setRequesterContact] = useState('');
  const [requestNote, setRequestNote] = useState('');

  // Object URL lifecycle — tied to source blob, survives StrictMode double-effect
  useEffect(() => {
    if (!file) {
      setOriginalUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!resultBlob) {
      setResultUrl(null);
      return;
    }
    const url = URL.createObjectURL(resultBlob);
    setResultUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [resultBlob]);

  // Start prefetch in the background as soon as a file is present.
  useEffect(() => {
    if (file) void preloadBackgroundRemoval(TIERS[0].model);
  }, [file]);

  const tier = useMemo<Tier>(() => {
    if (forceModel) {
      return { engine: 'imgly', model: forceModel, statusLabel: '이미지를 분석하고 있어요' };
    }
    return TIERS[Math.min(attempt, TIERS.length - 1)];
  }, [attempt, forceModel]);

  function pickFile(f: File) {
    setError(null);
    if (!f.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있어요.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`파일이 너무 커요 (${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB 이하).`);
      return;
    }
    setFile(f);
    setStep('ask');
  }

  async function runRemoval(currentTier: Tier) {
    if (!file) return;
    setStep('processing');
    setError(null);
    setProgress(null);
    setStatusOverride(currentTier.statusLabel);
    try {
      let blob: Blob | null = null;
      if (currentTier.engine === 'chroma' || currentTier.engine === 'hybrid') {
        const r = await chromaKeyRemove(file, chromaTolerance);
        if (r.matched) blob = r.blob;
      }
      if (!blob) {
        blob = await runImgly(file, currentTier.model, setProgress);
      }
      setResultBlob(blob);
      setAttemptBlobs((prev) => [...prev, blob]);
      setStep('review');
    } catch (e) {
      setError((e as Error).message);
      setStep('ask');
    } finally {
      setProgress(null);
      setStatusOverride(null);
    }
  }

  function onConfirmRemoval() {
    void runRemoval(tier);
  }

  function onSkipRemoval() {
    if (file) onComplete({ blob: file, usedRemoval: false, attempts: 0 });
  }

  function onAcceptResult() {
    if (resultBlob) onComplete({ blob: resultBlob, usedRemoval: true, attempts: attempt + 1 });
  }

  function onRetry() {
    if (forceModel) {
      void runRemoval(tier);
      return;
    }
    const next = Math.min(attempt + 1, TIERS.length - 1);
    setAttempt(next);
    void runRemoval(TIERS[next]);
  }

  function onAskDesigner() {
    setStep('designer-form');
  }

  async function submitDesignerRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (onDesignerRequest) {
      await onDesignerRequest({
        name: requesterName,
        contact: requesterContact,
        note: requestNote,
        file,
      });
    }
    setStep('designer-done');
  }

  function onPlaceholderToCanvas(chosenBlob: Blob, isOriginal: boolean) {
    onComplete({
      blob: chosenBlob,
      usedRemoval: !isOriginal,
      attempts: attempt + 1,
      designerPending: true,
    });
  }

  return (
    <div className={className}>
      <StepIndicator step={step} />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {step === 'upload' && <UploadView onFile={pickFile} />}

      {step === 'ask' && originalUrl && (
        <AskView
          originalUrl={originalUrl}
          onConfirm={onConfirmRemoval}
          onSkip={onSkipRemoval}
          onCancel={onCancel}
        />
      )}

      {step === 'processing' && originalUrl && (
        <ProcessingView
          key={`run-${attempt}`}
          originalUrl={originalUrl}
          progress={progress}
          statusOverride={statusOverride}
        />
      )}

      {step === 'review' && originalUrl && resultUrl && (
        <ReviewView
          originalUrl={originalUrl}
          resultUrl={resultUrl}
          attempt={attempt}
          maxRetries={TIERS.length - 1}
          onAccept={onAcceptResult}
          onRetry={onRetry}
          onAskDesigner={onAskDesigner}
        />
      )}

      {step === 'designer-form' && (
        <DesignerFormView
          name={requesterName}
          contact={requesterContact}
          note={requestNote}
          setName={setRequesterName}
          setContact={setRequesterContact}
          setNote={setRequestNote}
          onSubmit={submitDesignerRequest}
          onBack={() => setStep('review')}
        />
      )}

      {step === 'designer-done' && file && (
        <DesignerDoneView
          originalFile={file}
          attemptBlobs={attemptBlobs}
          onChoose={onPlaceholderToCanvas}
        />
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps = [
    { key: 'upload', label: '이미지 첨부' },
    { key: 'ask', label: '배경 처리' },
    { key: 'review', label: '결과 확인' },
  ] as const;
  const stepIdx = (s: Step) => {
    if (s === 'upload') return 0;
    if (s === 'ask') return 1;
    return 2;
  };
  const current = stepIdx(step);
  return (
    <ol className="mb-6 flex items-center gap-1.5 text-xs sm:gap-2">
      {steps.map((s, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <li key={s.key} className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                active
                  ? 'border-black bg-black text-white'
                  : done
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-300 text-gray-400'
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`whitespace-nowrap ${
                active ? 'inline font-semibold text-gray-900' : 'hidden text-gray-500 sm:inline'
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-4 shrink-0 bg-gray-200 sm:w-6" />}
          </li>
        );
      })}
    </ol>
  );
}

function UploadView({ onFile }: { onFile: (f: File) => void }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`rounded-2xl border-2 border-dashed p-12 text-center transition ${
        dragOver ? 'border-black bg-gray-50' : 'border-gray-300 bg-white'
      }`}
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 16V4M12 4l-4 4M12 4l4 4M4 16v4h16v-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="mb-1 font-medium">이미지를 끌어다 놓거나 클릭해서 선택하세요</p>
      <p className="mb-4 text-xs text-gray-500">JPG, PNG, WebP · 최대 25MB</p>
      <label className="inline-block cursor-pointer rounded-full bg-black px-5 py-2 text-sm font-medium text-white">
        파일 선택
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
    </div>
  );
}

function AskView({
  originalUrl,
  onConfirm,
  onSkip,
  onCancel,
}: {
  originalUrl: string;
  onConfirm: () => void;
  onSkip: () => void;
  onCancel?: () => void;
}) {
  return (
    <div>
      <div className="mb-5">
        <div className="mx-auto mb-4 aspect-square w-full max-w-sm overflow-hidden rounded-xl border bg-gray-50">
          <img src={originalUrl} alt="원본" className="h-full w-full object-contain" />
        </div>
        <h2 className="text-base font-semibold">배경을 깔끔하게 정리해드릴까요?</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
          의류 디자인에는 배경이 투명한 이미지가 가장 깔끔하게 어울려요.
          잠시 동안만 분석하면 됩니다.
        </p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-2 text-[11px] text-gray-500 underline"
          >
            다른 이미지로 바꾸기
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-2xl border-2 border-black bg-black p-4 text-left text-white transition hover:opacity-90"
        >
          <div className="mb-0.5 text-sm font-semibold">배경 정리하기</div>
          <p className="text-[11px] text-white/80">자동으로 배경을 분리해서 투명하게 만들어드려요.</p>
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-2xl border-2 border-gray-200 bg-white p-4 text-left transition hover:border-gray-400"
        >
          <div className="mb-0.5 text-sm font-semibold">배경 그대로 사용하기</div>
          <p className="text-[11px] text-gray-500">
            이미 투명하거나 배경째로 디자인에 쓰고 싶을 때 선택해주세요.
          </p>
        </button>
      </div>
    </div>
  );
}

function ProcessingView({
  originalUrl,
  progress,
  statusOverride,
}: {
  originalUrl: string;
  progress: Progress;
  statusOverride: string | null;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="mb-5">
        <div className="mx-auto mb-4 aspect-square w-full max-w-sm overflow-hidden rounded-xl border bg-gray-50">
          <img src={originalUrl} alt="원본" className="h-full w-full object-contain" />
        </div>
        <h2 className="text-base font-semibold">{statusOverride ?? '이미지를 분석하고 있어요'}</h2>
        <p className="mt-1 text-xs text-gray-500">
          잠시만 기다려주세요. 처음에는 조금 더 걸릴 수 있어요.
        </p>
      </div>
      <ProgressBar progress={progress} fallbackLabel="준비 중…" />
    </div>
  );
}

function ReviewView({
  originalUrl,
  resultUrl,
  attempt,
  maxRetries,
  onAccept,
  onRetry,
  onAskDesigner,
}: {
  originalUrl: string;
  resultUrl: string;
  attempt: number;
  maxRetries: number;
  onAccept: () => void;
  onRetry: () => void;
  onAskDesigner: () => void;
}) {
  const reachedLastTier = attempt >= maxRetries;
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">결과가 마음에 드시나요?</h2>
      <p className="mb-5 text-sm text-gray-600">
        원본과 비교해보고 마음에 드시면 그대로 적용해드릴게요.
      </p>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <figure>
          <div className="aspect-square overflow-hidden rounded-xl border bg-gray-50">
            <img src={originalUrl} alt="원본" className="h-full w-full object-contain" />
          </div>
          <figcaption className="mt-1 text-center text-xs text-gray-500">원본</figcaption>
        </figure>
        <figure>
          <div className="aspect-square overflow-hidden rounded-xl border" style={checkerStyle}>
            <img src={resultUrl} alt="결과" className="h-full w-full object-contain" />
          </div>
          <figcaption className="mt-1 text-center text-xs text-gray-500">정리한 결과</figcaption>
        </figure>
      </div>
      <div className="space-y-2">
        <button
          type="button"
          onClick={onAccept}
          className="w-full rounded-xl bg-black py-3 text-sm font-semibold text-white"
        >
          좋아요, 이대로 사용할게요
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={reachedLastTier}
            className="flex-1 rounded-xl border border-gray-300 bg-white py-3 text-sm font-medium disabled:opacity-40"
          >
            한 번 더 시도하기
          </button>
          <button
            type="button"
            onClick={onAskDesigner}
            className={`flex-1 rounded-xl py-3 text-sm font-medium ${
              reachedLastTier ? 'bg-amber-500 text-white' : 'border border-gray-300 bg-white'
            }`}
          >
            디자이너에게 맡기기
          </button>
        </div>
        {reachedLastTier && (
          <p className="pt-2 text-center text-xs text-gray-500">
            아직 만족스럽지 않으신가요? 디자이너가 직접 깨끗하게 작업해드릴 수 있어요.
          </p>
        )}
      </div>
    </div>
  );
}

function DesignerFormView({
  name,
  contact,
  note,
  setName,
  setContact,
  setNote,
  onSubmit,
  onBack,
}: {
  name: string;
  contact: string;
  note: string;
  setName: (v: string) => void;
  setContact: (v: string) => void;
  setNote: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-2xl border bg-white p-6">
      <h2 className="text-lg font-semibold">디자이너에게 맡기기</h2>
      <p className="mt-1 text-sm text-gray-600">
        걱정하지 마세요. 전문 디자이너가 24시간 안에 깨끗하게 작업해서 보내드려요.
      </p>
      <div className="mt-5 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="홍길동"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            연락처 (이메일 또는 휴대폰)
          </label>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="hello@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">요청사항 (선택)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="예: 인물의 머리카락 디테일을 살려주세요"
          />
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium"
        >
          뒤로
        </button>
        <button
          type="submit"
          className="flex-1 rounded-xl bg-black py-3 text-sm font-semibold text-white"
        >
          요청 보내기
        </button>
      </div>
    </form>
  );
}

function DesignerDoneView({
  originalFile,
  attemptBlobs,
  onChoose,
}: {
  originalFile: File;
  attemptBlobs: Blob[];
  onChoose: (blob: Blob, isOriginal: boolean) => void;
}) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [attemptUrls, setAttemptUrls] = useState<string[]>([]);

  useEffect(() => {
    const o = URL.createObjectURL(originalFile);
    setOriginalUrl(o);
    return () => URL.revokeObjectURL(o);
  }, [originalFile]);

  useEffect(() => {
    const urls = attemptBlobs.map((b) => URL.createObjectURL(b));
    setAttemptUrls(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [attemptBlobs]);

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-green-700"
          >
            <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">요청이 접수되었어요</h2>
        <p className="mt-1 text-sm text-gray-600">
          디자이너가 24시간 안에 깨끗하게 작업해서 알려드릴게요.
        </p>
      </div>

      <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <strong className="block mb-0.5">기다리는 동안 미리 자리를 잡아두세요</strong>
        가장 가까워 보이는 이미지로 위치와 크기를 잡아두세요. 디자이너 작업이 완료되면 그
        자리에 자동으로 깨끗한 이미지로 교체해드려요.
      </div>

      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-gray-700">어떤 이미지로 자리를 잡을까요?</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {originalUrl && (
            <ThumbCard
              label="원본"
              url={originalUrl}
              transparent={false}
              onClick={() => onChoose(originalFile, true)}
            />
          )}
          {attemptUrls.map((url, i) => (
            <ThumbCard
              key={i}
              label={`시도 ${i + 1}`}
              url={url}
              transparent
              onClick={() => onChoose(attemptBlobs[i], false)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ThumbCard({
  label,
  url,
  transparent,
  onClick,
}: {
  label: string;
  url: string;
  transparent: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-1 rounded-xl border-2 border-gray-200 p-1.5 text-left transition hover:border-black"
    >
      <div className="aspect-square overflow-hidden rounded-lg" style={transparent ? checkerStyle : { backgroundColor: '#f9f9f9' }}>
        <img src={url} alt={label} className="h-full w-full object-contain" />
      </div>
      <div className="flex items-center justify-between px-1 pt-0.5 text-[11px]">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-400 group-hover:text-black">선택 →</span>
      </div>
    </button>
  );
}
