'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Type,
  Image as ImageIcon,
  Trash2,
  Loader2,
  Save,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import * as fabric from 'fabric';
import { uploadFileToStorage } from '@/lib/supabase-storage';
import { STORAGE_BUCKETS, STORAGE_FOLDERS } from '@/lib/storage-config';
import { createClient } from '@/lib/supabase-client';
import type {
  TemplateGroup,
  SlotManifestEntry,
  SlotManifestTextEntry,
  SlotManifestImageEntry,
  ArtworkCanvasSize,
} from '@/types/types';

interface Props {
  groupId: string;
}

// Object metadata key — every user object in the artwork carries an `object_id`
// so admin can reference it from slot_manifest.
const newObjectId = () =>
  `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

type ObjectWithMeta = fabric.FabricObject & {
  data?: { object_id?: string; [k: string]: unknown };
};

function ensureObjectId(obj: fabric.FabricObject): string {
  const o = obj as ObjectWithMeta;
  if (!o.data) o.data = {};
  if (!o.data.object_id) o.data.object_id = newObjectId();
  return o.data.object_id as string;
}

function getObjectId(obj: fabric.FabricObject | null | undefined): string | null {
  return ((obj as ObjectWithMeta | null | undefined)?.data?.object_id as string) || null;
}

/**
 * Standalone Fabric.js editor for a TemplateGroup's artwork.
 * Saves to template_groups.artwork_state + slot_manifest + preview_url.
 */
function GroupArtworkEditorImpl({ groupId }: Props) {
  const router = useRouter();
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const [group, setGroup] = useState<TemplateGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<fabric.FabricObject | null>(null);
  const [, forceTick] = useState(0);
  const [canvasSize, setCanvasSize] = useState<ArtworkCanvasSize>({ width: 800, height: 800 });
  const [slotManifest, setSlotManifest] = useState<SlotManifestEntry[]>([]);

  // Display canvas at a fixed pixel size in the page; Fabric coordinates use
  // the actual artwork dimensions. We use CSS scale via container/zoom.
  const DISPLAY_PX = 560;
  const displayScale = useMemo(() => {
    const long = Math.max(canvasSize.width, canvasSize.height);
    return DISPLAY_PX / long;
  }, [canvasSize]);

  // ─── Init ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/template-groups?id=${groupId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || '그룹을 불러오지 못했습니다.');
        if (cancelled) return;
        const g = json.data as TemplateGroup;
        setGroup(g);
        setSlotManifest(Array.isArray(g.slot_manifest) ? g.slot_manifest : []);
        setCanvasSize(
          g.artwork_canvas_size && typeof g.artwork_canvas_size === 'object'
            ? g.artwork_canvas_size
            : { width: 800, height: 800 },
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '그룹을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  // Initialize Fabric canvas after group + element are ready.
  useEffect(() => {
    if (!group || !canvasElRef.current || fabricCanvasRef.current) return;
    const c = new fabric.Canvas(canvasElRef.current, {
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    });
    fabricCanvasRef.current = c;

    const updateSelected = () => {
      setSelected(c.getActiveObject() ?? null);
      forceTick((n) => n + 1);
    };
    c.on('selection:created', updateSelected);
    c.on('selection:updated', updateSelected);
    c.on('selection:cleared', updateSelected);
    c.on('object:modified', () => forceTick((n) => n + 1));

    // Restore artwork_state if present
    const state = group.artwork_state;
    if (state && typeof state === 'object' && Object.keys(state).length > 0) {
      try {
        c.loadFromJSON(state, () => {
          c.getObjects().forEach((o) => ensureObjectId(o));
          c.requestRenderAll();
          forceTick((n) => n + 1);
        });
      } catch (err) {
        console.error('Failed to load artwork_state:', err);
      }
    }

    return () => {
      c.dispose();
      fabricCanvasRef.current = null;
    };
  }, [group, canvasSize.width, canvasSize.height]);

  // ─── Toolbar actions ──────────────────────────────────────────────
  const addText = () => {
    const c = fabricCanvasRef.current;
    if (!c) return;
    const tb = new fabric.Textbox('텍스트 입력', {
      left: canvasSize.width / 2,
      top: canvasSize.height / 2,
      width: canvasSize.width * 0.4,
      fontSize: Math.round(canvasSize.height * 0.06),
      fontFamily: 'Pretendard',
      fill: '#111111',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
    });
    ensureObjectId(tb);
    c.add(tb);
    c.setActiveObject(tb);
    c.requestRenderAll();
  };

  const addImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const c = fabricCanvasRef.current;
      if (!c) return;
      try {
        const supabase = createClient();
        const result = await uploadFileToStorage(
          supabase,
          file,
          STORAGE_BUCKETS.USER_DESIGNS,
          STORAGE_FOLDERS.IMAGES,
        );
        if (!result.success || !result.url) throw new Error(result.error || '업로드 실패');
        const img = await fabric.FabricImage.fromURL(result.url, { crossOrigin: 'anonymous' });
        const naturalW = img.width ?? 1;
        const naturalH = img.height ?? 1;
        const targetW = canvasSize.width * 0.4;
        const scale = targetW / naturalW;
        img.set({
          left: canvasSize.width / 2,
          top: canvasSize.height / 2,
          scaleX: scale,
          scaleY: scale,
          originX: 'center',
          originY: 'center',
        });
        ensureObjectId(img);
        c.add(img);
        c.setActiveObject(img);
        c.requestRenderAll();
      } catch (err) {
        alert(err instanceof Error ? err.message : '이미지 추가 실패');
      }
    };
    input.click();
  };

  const removeSelected = () => {
    const c = fabricCanvasRef.current;
    if (!c || !selected) return;
    const oid = getObjectId(selected);
    c.remove(selected);
    if (oid) setSlotManifest((prev) => prev.filter((s) => s.object_id !== oid));
    c.requestRenderAll();
    setSelected(null);
  };

  // ─── Slot tagging ─────────────────────────────────────────────────
  const selectedObjectId = getObjectId(selected);
  const selectedManifest = useMemo(
    () => (selectedObjectId ? slotManifest.find((s) => s.object_id === selectedObjectId) ?? null : null),
    [selectedObjectId, slotManifest],
  );
  const selectedKind: 'text' | 'image' | null = selected
    ? selected.type === 'image'
      ? 'image'
      : selected.type === 'i-text' || selected.type === 'text' || selected.type === 'textbox'
      ? 'text'
      : null
    : null;

  const updateSlot = (next: Partial<SlotManifestEntry>) => {
    if (!selectedObjectId || !selectedManifest) return;
    setSlotManifest((prev) =>
      prev.map((s) => (s.object_id === selectedObjectId ? ({ ...s, ...next } as SlotManifestEntry) : s)),
    );
  };

  const addToManifest = () => {
    if (!selected || !selectedKind) return;
    const oid = ensureObjectId(selected);
    if (slotManifest.some((s) => s.object_id === oid)) return;
    const entry: SlotManifestEntry = selectedKind === 'text'
      ? { object_id: oid, kind: 'text', label: '새 텍스트 슬롯', lock_style: true } as SlotManifestTextEntry
      : { object_id: oid, kind: 'image', label: '새 이미지 슬롯', accepts: 'photo', bg_removal_default: true } as SlotManifestImageEntry;
    setSlotManifest((prev) => [...prev, entry]);
    forceTick((n) => n + 1);
  };

  const removeFromManifest = (oid: string) => {
    setSlotManifest((prev) => prev.filter((s) => s.object_id !== oid));
  };

  // ─── Save ─────────────────────────────────────────────────────────
  const save = async () => {
    const c = fabricCanvasRef.current;
    if (!c) return;
    setSaving(true);
    try {
      // Ensure every user object has an object_id
      c.getObjects().forEach((o) => ensureObjectId(o));
      // Fabric v6: toObject(propertiesToInclude) carries custom `data` field through.
      const artwork_state = c.toObject(['data']);
      const preview_url = c.toDataURL({ format: 'png', multiplier: 0.5, quality: 0.85 });

      // Sanitize manifest: drop entries whose object_id no longer exists on canvas
      const liveIds = new Set(c.getObjects().map((o) => getObjectId(o)).filter(Boolean) as string[]);
      const cleanManifest = slotManifest.filter((s) => liveIds.has(s.object_id));

      const res = await fetch('/api/admin/template-groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: groupId,
          artwork_state,
          artwork_canvas_size: canvasSize,
          slot_manifest: cleanManifest,
          preview_url,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '저장 실패');
      setGroup({ ...(group as TemplateGroup), ...json.data });
      setSlotManifest(cleanManifest);
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (error || !group) {
    return (
      <div className="p-6">
        <button onClick={() => router.push('/templates')} className="text-sm text-gray-500 mb-4 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> 템플릿 목록
        </button>
        <p className="text-sm text-red-500">{error || '그룹을 찾을 수 없습니다.'}</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => router.push(`/templates/group/${groupId}`)}
          className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 그룹 상세로
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-black text-white text-xs font-medium hover:bg-gray-800 disabled:bg-gray-300"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            아트워크 저장
          </button>
        </div>
      </div>

      <div className="mb-3">
        <h1 className="text-lg font-bold text-gray-900">{group.title}</h1>
        <p className="text-xs text-gray-500">디자인 그룹 아트워크 편집</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Canvas + toolbar */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <button onClick={addText} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 text-xs font-medium hover:bg-gray-50">
              <Type className="w-3.5 h-3.5" /> 텍스트
            </button>
            <button onClick={addImage} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 text-xs font-medium hover:bg-gray-50">
              <Upload className="w-3.5 h-3.5" /> 이미지
            </button>
            {selected && (
              <button onClick={removeSelected} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-300 text-xs font-medium text-red-600 hover:bg-red-50 ml-auto">
                <Trash2 className="w-3.5 h-3.5" /> 선택 객체 삭제
              </button>
            )}
          </div>

          <div className="bg-gray-100 p-3 rounded flex items-center justify-center" style={{ minHeight: DISPLAY_PX + 40 }}>
            <div
              className="bg-white shadow-sm border border-gray-200"
              style={{
                width: canvasSize.width * displayScale,
                height: canvasSize.height * displayScale,
              }}
            >
              <div
                style={{
                  transform: `scale(${displayScale})`,
                  transformOrigin: 'top left',
                  width: canvasSize.width,
                  height: canvasSize.height,
                }}
              >
                <canvas ref={canvasElRef} />
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
            <span>캔버스 크기:</span>
            <input
              type="number"
              value={canvasSize.width}
              onChange={(e) => setCanvasSize((s) => ({ ...s, width: parseInt(e.target.value) || 800 }))}
              className="w-16 px-1.5 py-0.5 border border-gray-200 rounded text-[11px]"
            />
            <span>×</span>
            <input
              type="number"
              value={canvasSize.height}
              onChange={(e) => setCanvasSize((s) => ({ ...s, height: parseInt(e.target.value) || 800 }))}
              className="w-16 px-1.5 py-0.5 border border-gray-200 rounded text-[11px]"
            />
            <span className="text-gray-400">(저장 후 적용)</span>
          </div>
        </div>

        {/* Right panel */}
        <aside className="bg-white border border-gray-200 rounded-lg p-3 h-fit lg:sticky lg:top-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">선택 객체</h3>
            {!selected ? (
              <p className="text-[11px] text-gray-400 mt-1">캔버스의 객체를 선택하세요.</p>
            ) : !selectedKind ? (
              <p className="text-[11px] text-gray-400 mt-1">이 객체는 슬롯으로 지정할 수 없습니다.</p>
            ) : !selectedManifest ? (
              <button
                onClick={addToManifest}
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded bg-purple-600 text-white text-xs font-medium hover:bg-purple-700"
              >
                <Tag className="w-3 h-3" /> 슬롯으로 등록
              </button>
            ) : (
              <SlotEditor
                manifest={selectedManifest}
                onChange={updateSlot}
                onRemove={() => removeFromManifest(selectedManifest.object_id)}
              />
            )}
          </div>

          <div className="border-t pt-3">
            <h3 className="text-sm font-semibold text-gray-900">
              슬롯 ({slotManifest.length})
            </h3>
            {slotManifest.length === 0 ? (
              <p className="text-[11px] text-gray-400 mt-1">아직 슬롯이 없습니다.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {slotManifest.map((s) => (
                  <div key={s.object_id} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded text-[11px]">
                    {s.kind === 'text' ? <Type className="w-3 h-3 text-gray-400" /> : <ImageIcon className="w-3 h-3 text-gray-400" />}
                    <span className="flex-1 truncate">{s.label}</span>
                    <button
                      onClick={() => removeFromManifest(s.object_id)}
                      className="text-gray-300 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

interface SlotEditorProps {
  manifest: SlotManifestEntry;
  onChange: (patch: Partial<SlotManifestEntry>) => void;
  onRemove: () => void;
}

function SlotEditor({ manifest, onChange, onRemove }: SlotEditorProps) {
  return (
    <div className="mt-2 space-y-2">
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">슬롯 라벨</label>
        <input
          type="text"
          value={manifest.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-black"
        />
      </div>
      {manifest.kind === 'text' ? (
        <>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-700">
            <input
              type="checkbox"
              checked={manifest.lock_style}
              onChange={(e) => onChange({ lock_style: e.target.checked } as Partial<SlotManifestTextEntry>)}
            />
            스타일 잠금 (텍스트만 교체 가능)
          </label>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">최대 글자수</label>
            <input
              type="number"
              value={manifest.max_length ?? ''}
              onChange={(e) => onChange({ max_length: e.target.value ? parseInt(e.target.value) : undefined } as Partial<SlotManifestTextEntry>)}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">placeholder</label>
            <input
              type="text"
              value={manifest.placeholder ?? ''}
              onChange={(e) => onChange({ placeholder: e.target.value || undefined } as Partial<SlotManifestTextEntry>)}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">종류</label>
            <select
              value={manifest.accepts}
              onChange={(e) => onChange({ accepts: e.target.value as 'photo' | 'logo' } as Partial<SlotManifestImageEntry>)}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
            >
              <option value="photo">사진</option>
              <option value="logo">로고</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">크롭 비율 W/H (선택)</label>
            <input
              type="number"
              step="0.01"
              value={manifest.aspect_ratio ?? ''}
              onChange={(e) => onChange({ aspect_ratio: e.target.value ? parseFloat(e.target.value) : undefined } as Partial<SlotManifestImageEntry>)}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
              placeholder="비우면 원본 비율"
            />
          </div>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-700">
            <input
              type="checkbox"
              checked={manifest.bg_removal_default ?? false}
              onChange={(e) => onChange({ bg_removal_default: e.target.checked } as Partial<SlotManifestImageEntry>)}
            />
            배경 제거 기본 ON
          </label>
        </>
      )}
      <button
        onClick={onRemove}
        className="w-full text-xs text-red-500 hover:bg-red-50 rounded py-1 inline-flex items-center justify-center gap-1"
      >
        <Trash2 className="w-3 h-3" /> 슬롯 등록 해제
      </button>
    </div>
  );
}

// Fabric.js requires a browser environment — render only on client.
const GroupArtworkEditor = dynamic(() => Promise.resolve(GroupArtworkEditorImpl), {
  ssr: false,
});

export default GroupArtworkEditor;
