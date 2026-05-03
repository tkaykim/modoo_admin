'use client';

import { ArrowLeft, Pencil, Save, Download, X, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EditorModeConfig } from './hooks/useEditorMode';

interface EditorHeaderProps {
  modeConfig: EditorModeConfig;
  isEditing: boolean;
  isSaving: boolean;
  onToggleEdit?: () => void;
  onSave: () => void;
  onDownload?: () => void;
  isDownloading?: boolean;
  saveError?: string | null;
  children?: React.ReactNode;
  showSketchToggle?: boolean;
  isSketchOpen?: boolean;
  onToggleSketch?: () => void;
}

export default function EditorHeader({
  modeConfig,
  isEditing,
  isSaving,
  onToggleEdit,
  onSave,
  onDownload,
  isDownloading,
  saveError,
  children,
  showSketchToggle,
  isSketchOpen,
  onToggleSketch,
}: EditorHeaderProps) {
  const router = useRouter();

  return (
    <header className="bg-neutral-900 text-neutral-200 px-3 py-1.5 flex items-center justify-between gap-3 shrink-0">
      {/* Left: Back + title */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => router.back()}
          className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-medium text-neutral-300 truncate">
          {modeConfig.label}
        </span>
      </div>

      {/* Center: optional children */}
      {children && <div className="flex-1 flex justify-center">{children}</div>}

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {saveError && (
          <span className="text-[10px] text-red-400 mr-1">{saveError}</span>
        )}

        {/* Order mode: edit toggle */}
        {modeConfig.mode === 'order' && onToggleEdit && (
          isEditing ? (
            <button
              onClick={onToggleEdit}
              className="flex items-center gap-1 text-[11px] font-medium text-neutral-300 bg-neutral-700 px-2 py-1 rounded hover:bg-neutral-600 transition-colors"
            >
              <X className="w-3 h-3" />
              편집 취소
            </button>
          ) : (
            <button
              onClick={onToggleEdit}
              className="flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-900/40 border border-amber-700/50 px-2 py-1 rounded hover:bg-amber-900/60 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              편집 모드
            </button>
          )
        )}

        {/* Freeform sketch toggle */}
        {showSketchToggle && onToggleSketch && (
          <button
            onClick={onToggleSketch}
            className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded transition-colors ${
              isSketchOpen
                ? 'text-purple-300 bg-purple-900/40 border border-purple-700/50 hover:bg-purple-900/60'
                : 'text-neutral-300 bg-neutral-700 hover:bg-neutral-600'
            }`}
          >
            {isSketchOpen ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            스케치
          </button>
        )}

        {/* Download (order mode) */}
        {modeConfig.showDownload && onDownload && (
          <button
            onClick={onDownload}
            disabled={isDownloading}
            className="flex items-center gap-1 text-[11px] font-medium text-white bg-blue-600 px-2 py-1 rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            <Download className="w-3 h-3" />
            {isDownloading ? '다운로드 중...' : '전체 다운로드'}
          </button>
        )}

        {/* Save button */}
        {isEditing && (
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1 text-[11px] font-medium text-white bg-green-600 px-2 py-1 rounded hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3 h-3" />
            {isSaving ? '저장 중...' : '저장'}
          </button>
        )}
      </div>
    </header>
  );
}
