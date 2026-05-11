'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Upload, Loader2, Trash2, Image as ImageIcon } from 'lucide-react';
import { ProductColor, ProductSide } from '@/types/types';
import { createClient } from '@/lib/supabase-client';

interface ProductColorMockupModalProps {
  productId: string;
  productColor: ProductColor;
  sides: ProductSide[];
  onClose: () => void;
  onSaved: (updated: ProductColor) => void;
}

export default function ProductColorMockupModal({
  productId,
  productColor,
  sides,
  onClose,
  onSaved,
}: ProductColorMockupModalProps) {
  const [mockups, setMockups] = useState<Record<string, string>>(
    (productColor.side_mockups as Record<string, string> | undefined) ?? {}
  );
  const [uploadingSideId, setUploadingSideId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setMockups((productColor.side_mockups as Record<string, string> | undefined) ?? {});
  }, [productColor.id, productColor.side_mockups]);

  const colorName = productColor.manufacturer_colors?.name ?? '색상';
  const colorHex = productColor.manufacturer_colors?.hex ?? '#cccccc';

  const handleUpload = async (sideId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다.');
      return;
    }
    setError(null);
    setUploadingSideId(sideId);
    try {
      const supabase = createClient();
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `product-images/color-mockups/${productId}/${productColor.id}/${sideId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('products').getPublicUrl(filePath);

      setMockups((prev) => ({ ...prev, [sideId]: publicUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploadingSideId(null);
    }
  };

  const handleRemove = (sideId: string) => {
    setMockups((prev) => {
      const next = { ...prev };
      delete next[sideId];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/products/colors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productColor.id, side_mockups: mockups }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '저장 실패');
      onSaved(json.data as ProductColor);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div
              className="w-6 h-6 rounded border border-gray-300"
              style={{ backgroundColor: colorHex }}
            />
            <div>
              <h3 className="font-semibold text-gray-900">면별 목업 이미지 — {colorName}</h3>
              <p className="text-xs text-gray-500">
                업로드된 면은 색상 필터(BlendColor) 없이 이 이미지로 표시됩니다. 비워두면 기본 목업 + 색상 필터가 사용됩니다.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-900 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3">
          {sides.length === 0 && (
            <p className="text-sm text-gray-600">제품에 등록된 면(configuration)이 없습니다.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sides.map((side) => {
              const mockupUrl = mockups[side.id];
              const isUploading = uploadingSideId === side.id;
              return (
                <div
                  key={side.id}
                  className="border border-gray-200 rounded-md p-3 space-y-2 bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{side.name}</p>
                      <p className="text-[11px] text-gray-500">id: {side.id}</p>
                    </div>
                    {mockupUrl && (
                      <button
                        onClick={() => handleRemove(side.id)}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                        title="이미지 제거"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="aspect-square bg-white border border-dashed border-gray-300 rounded flex items-center justify-center overflow-hidden">
                    {mockupUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mockupUrl} alt={side.name} className="object-contain w-full h-full" />
                    ) : (
                      <div className="text-center text-gray-400">
                        <ImageIcon className="w-8 h-8 mx-auto mb-1" />
                        <p className="text-xs">이미지 없음 (필터 fallback)</p>
                      </div>
                    )}
                  </div>

                  <input
                    ref={(el) => {
                      fileInputRefs.current[side.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(side.id, f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    onClick={() => fileInputRefs.current[side.id]?.click()}
                    disabled={isUploading}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {mockupUrl ? '교체' : '업로드'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-red-600">{error}</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
