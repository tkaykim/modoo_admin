'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical, Type, Image as ImageIcon, Save, Loader2, Upload } from 'lucide-react';
import type {
  DesignComposition,
  CompositionSlot,
  CompositionTextSlot,
  CompositionImageSlot,
} from '@/types/types';
import { uploadFileToStorage } from '@/lib/supabase-storage';
import { STORAGE_BUCKETS, STORAGE_FOLDERS } from '@/lib/storage-config';
import { createClient } from '@/lib/supabase-client';

interface Props {
  value: DesignComposition;
  onChange: (next: DesignComposition) => void;
  onSave?: () => Promise<void> | void;
  saving?: boolean;
  dirty?: boolean;
}

const newSlotId = () =>
  `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const blankText = (): CompositionTextSlot => ({
  slot_id: newSlotId(),
  kind: 'text',
  label: '새 텍스트',
  default_text: '',
  lock_style: true,
});

const blankImage = (): CompositionImageSlot => ({
  slot_id: newSlotId(),
  kind: 'image',
  label: '새 이미지',
  default_image_url: '',
  aspect_ratio: 1,
  accepts: 'photo',
  bg_removal_default: true,
});

export default function CompositionEditor({ value, onChange, onSave, saving, dirty }: Props) {
  const slots = value?.slots ?? [];

  const update = (next: CompositionSlot[]) => onChange({ slots: next });

  const updateSlot = (idx: number, patch: Partial<CompositionSlot>) => {
    const copy = [...slots];
    copy[idx] = { ...copy[idx], ...patch } as CompositionSlot;
    update(copy);
  };

  const removeSlot = (idx: number) => {
    if (!confirm('이 슬롯을 삭제하시겠습니까? 이미 그룹에 연결된 인스턴스의 placement도 함께 무효화됩니다.')) return;
    update(slots.filter((_, i) => i !== idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= slots.length) return;
    const copy = [...slots];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    update(copy);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">디자인 컴포지션</h3>
          <p className="text-[11px] text-gray-500">
            이 그룹에 들어갈 텍스트/이미지 슬롯을 정의합니다. 각 제품 인스턴스는 이 슬롯들을 캔버스에 배치하기만 하면 됩니다.
          </p>
        </div>
        {onSave && (
          <button
            onClick={onSave}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-black text-white text-xs font-medium hover:bg-gray-800 disabled:bg-gray-300"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            <Save className="w-3 h-3" /> 컴포지션 저장
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => update([...slots, blankText()])}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 text-xs font-medium hover:bg-gray-50"
        >
          <Type className="w-3.5 h-3.5" /> 텍스트 슬롯
        </button>
        <button
          onClick={() => update([...slots, blankImage()])}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-300 text-xs font-medium hover:bg-gray-50"
        >
          <ImageIcon className="w-3.5 h-3.5" /> 이미지 슬롯
        </button>
      </div>

      {slots.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400">
          아직 슬롯이 없습니다. 위 버튼으로 텍스트/이미지 슬롯을 추가하세요.
        </div>
      ) : (
        <div className="space-y-2">
          {slots.map((slot, idx) => (
            <SlotCard
              key={slot.slot_id}
              slot={slot}
              isFirst={idx === 0}
              isLast={idx === slots.length - 1}
              onChange={(patch) => updateSlot(idx, patch)}
              onRemove={() => removeSlot(idx)}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SlotCardProps {
  slot: CompositionSlot;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<CompositionSlot>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SlotCard({ slot, isFirst, isLast, onChange, onRemove, onMoveUp, onMoveDown }: SlotCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <button onClick={onMoveUp} disabled={isFirst} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30">
            <GripVertical className="w-3 h-3" />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30">
            <GripVertical className="w-3 h-3 rotate-180" />
          </button>
        </div>
        {slot.kind === 'text' ? (
          <Type className="w-4 h-4 text-gray-400" />
        ) : (
          <ImageIcon className="w-4 h-4 text-gray-400" />
        )}
        <input
          type="text"
          value={slot.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="라벨"
          className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-black"
        />
        <code className="text-[10px] text-gray-400">{slot.slot_id.slice(0, 12)}…</code>
        <button onClick={onRemove} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {slot.kind === 'text' ? <TextSlotFields slot={slot} onChange={onChange} /> : <ImageSlotFields slot={slot} onChange={onChange} />}
    </div>
  );
}

function TextSlotFields({ slot, onChange }: { slot: CompositionTextSlot; onChange: (p: Partial<CompositionTextSlot>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="col-span-2">
        <label className="block text-[10px] text-gray-500 mb-0.5">기본 텍스트</label>
        <input
          type="text"
          value={slot.default_text}
          onChange={(e) => onChange({ default_text: e.target.value })}
          placeholder="예: 초코, 우리 가족 등"
          className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-black"
        />
      </div>
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">최대 글자수</label>
        <input
          type="number"
          value={slot.max_length ?? ''}
          onChange={(e) => onChange({ max_length: e.target.value ? parseInt(e.target.value, 10) : undefined })}
          className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
        />
      </div>
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">폰트 색상 (hex)</label>
        <input
          type="text"
          value={slot.font_color ?? ''}
          onChange={(e) => onChange({ font_color: e.target.value || undefined })}
          placeholder="#000000"
          className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
        />
      </div>
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">폰트 패밀리 (선택)</label>
        <input
          type="text"
          value={slot.font_family ?? ''}
          onChange={(e) => onChange({ font_family: e.target.value || undefined })}
          placeholder="Pretendard"
          className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
        />
      </div>
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">인쇄 방식 ID (선택)</label>
        <input
          type="text"
          value={slot.print_method_id ?? ''}
          onChange={(e) => onChange({ print_method_id: e.target.value || undefined })}
          className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
        />
      </div>
      <label className="col-span-2 inline-flex items-center gap-1.5 text-[11px] text-gray-700">
        <input
          type="checkbox"
          checked={slot.lock_style}
          onChange={(e) => onChange({ lock_style: e.target.checked })}
        />
        스타일 잠금 (사용자는 텍스트만 교체 가능)
      </label>
    </div>
  );
}

function ImageSlotFields({ slot, onChange }: { slot: CompositionImageSlot; onChange: (p: Partial<CompositionImageSlot>) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const supabase = createClient();
        const result = await uploadFileToStorage(
          supabase,
          file,
          STORAGE_BUCKETS.USER_DESIGNS,
          STORAGE_FOLDERS.IMAGES,
        );
        if (!result.success || !result.url) throw new Error(result.error || '업로드 실패');
        onChange({ default_image_url: result.url });
      } catch (err) {
        alert(err instanceof Error ? err.message : '업로드 실패');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="col-span-2">
        <label className="block text-[10px] text-gray-500 mb-0.5">기본 이미지</label>
        <div className="flex items-center gap-2">
          {slot.default_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slot.default_image_url} alt="" className="w-12 h-12 rounded object-cover bg-gray-100 border border-gray-200" />
          ) : (
            <div className="w-12 h-12 rounded bg-gray-100 border border-gray-200 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-gray-300" />
            </div>
          )}
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="inline-flex items-center gap-1 px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            업로드
          </button>
          {slot.default_image_url && (
            <button
              onClick={() => onChange({ default_image_url: '' })}
              className="text-[10px] text-gray-400 hover:text-red-500"
            >
              제거
            </button>
          )}
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">비율 W/H</label>
        <input
          type="number"
          step="0.01"
          value={slot.aspect_ratio}
          onChange={(e) => onChange({ aspect_ratio: parseFloat(e.target.value) || 1 })}
          className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
        />
      </div>
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">종류</label>
        <select
          value={slot.accepts}
          onChange={(e) => onChange({ accepts: e.target.value as 'photo' | 'logo' })}
          className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
        >
          <option value="photo">사진</option>
          <option value="logo">로고</option>
        </select>
      </div>
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">인쇄 방식 ID (선택)</label>
        <input
          type="text"
          value={slot.print_method_id ?? ''}
          onChange={(e) => onChange({ print_method_id: e.target.value || undefined })}
          className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
        />
      </div>
      <label className="col-span-2 inline-flex items-center gap-1.5 text-[11px] text-gray-700">
        <input
          type="checkbox"
          checked={slot.bg_removal_default ?? false}
          onChange={(e) => onChange({ bg_removal_default: e.target.checked })}
        />
        배경 제거 기본 ON
      </label>
    </div>
  );
}
