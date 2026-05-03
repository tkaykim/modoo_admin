'use client';

import { Fragment, useMemo, useState } from 'react';
import useSWR from 'swr';
import type { Factory, ManufacturerColor, Profile } from '@/types/types';
import {
  AlertCircle,
  ArrowLeft,
  Factory as FactoryIcon,
  Palette,
  Plus,
  Save,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';

const sortFactories = (items: Factory[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, 'ko'));

const sortColors = (items: ManufacturerColor[]) =>
  [...items].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name, 'ko');
  });

const emptyForm = {
  name: '',
  email: '',
  phone_number: '',
  address: '',
  is_active: true,
};

const emptyColorForm = {
  name: '',
  hex: '#000000',
  color_code: '',
  label: '',
  is_active: true,
  sort_order: 0,
};

interface ManufacturerColorsEditorProps {
  factory: Factory;
  onBack: () => void;
}

function ManufacturerColorsEditor({ factory, onBack }: ManufacturerColorsEditorProps) {
  const { data: rawColors = [], isLoading: loading, mutate: mutateColors } = useSWR<ManufacturerColor[]>(
    `/api/admin/manufacturer-colors?manufacturerId=${factory.id}&includeInactive=true`
  );
  const colors = useMemo(() => sortColors(rawColors), [rawColors]);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(emptyColorForm);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<typeof emptyColorForm | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const createColor = async () => {
    if (!form.name.trim()) {
      setError('색상명을 입력해주세요.');
      return;
    }
    if (!form.hex.trim()) {
      setError('HEX 색상 코드를 입력해주세요.');
      return;
    }
    if (!form.color_code.trim()) {
      setError('색상 코드를 입력해주세요.');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/manufacturer-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturer_id: factory.id,
          name: form.name.trim(),
          hex: form.hex.trim(),
          color_code: form.color_code.trim(),
          label: form.label.trim() || null,
          is_active: form.is_active,
          sort_order: form.sort_order,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '색상 생성에 실패했습니다.');
      }

      const payload = await response.json();
      const created = payload?.data as ManufacturerColor;
      mutateColors(sortColors([created, ...rawColors]), { revalidate: false });
      setForm(emptyColorForm);
    } catch (err) {
      console.error('Error creating color:', err);
      setError(err instanceof Error ? err.message : '색상 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const updateColor = async (colorId: string, updates: Partial<ManufacturerColor>) => {
    setUpdatingId(colorId);
    setError(null);
    try {
      const response = await fetch('/api/admin/manufacturer-colors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: colorId, ...updates }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '색상 업데이트에 실패했습니다.');
      }

      const payload = await response.json();
      const updated = payload?.data as ManufacturerColor;
      mutateColors(sortColors(rawColors.map((c) => (c.id === updated.id ? updated : c))), { revalidate: false });
      return updated;
    } catch (err) {
      console.error('Error updating color:', err);
      setError(err instanceof Error ? err.message : '색상 업데이트에 실패했습니다.');
      return null;
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteColor = async (colorId: string) => {
    const color = colors.find((c) => c.id === colorId);
    const confirmed = window.confirm(`"${color?.name}" 색상을 삭제할까요?`);
    if (!confirmed) return;

    setDeletingId(colorId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/manufacturer-colors?id=${colorId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '색상 삭제에 실패했습니다.');
      }

      mutateColors(rawColors.filter((c) => c.id !== colorId), { revalidate: false });
    } catch (err) {
      console.error('Error deleting color:', err);
      setError(err instanceof Error ? err.message : '색상 삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditStart = (color: ManufacturerColor) => {
    setEditingId(color.id);
    setEditDraft({
      name: color.name,
      hex: color.hex,
      color_code: color.color_code,
      label: color.label ?? '',
      is_active: color.is_active ?? true,
      sort_order: color.sort_order ?? 0,
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const handleEditSave = async (colorId: string) => {
    if (!editDraft) return;
    if (!editDraft.name.trim()) {
      setError('색상명을 입력해주세요.');
      return;
    }

    const updated = await updateColor(colorId, {
      name: editDraft.name.trim(),
      hex: editDraft.hex.trim(),
      color_code: editDraft.color_code.trim(),
      label: editDraft.label.trim() || null,
      is_active: editDraft.is_active,
      sort_order: editDraft.sort_order,
    });

    if (updated) {
      setEditingId(null);
      setEditDraft(null);
    }
  };

  const handleToggleActive = async (color: ManufacturerColor) => {
    await updateColor(color.id, { is_active: !color.is_active });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 sm:gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          뒤로
        </button>
        <div>
          <h2 className="text-base sm:text-xl font-semibold text-gray-900">{factory.name} - 색상 관리</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">총 {colors.length}개의 색상</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white border border-gray-200/60 rounded-md p-3 sm:p-4 shadow-sm space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-gray-600" />
          <h3 className="text-base font-semibold text-gray-900">새 색상 등록</h3>
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <label className="space-y-2 text-xs sm:text-sm text-gray-700">
            색상명 *
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="예: 네이비"
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
            />
          </label>
          <label className="space-y-2 text-xs sm:text-sm text-gray-700">
            HEX 코드 *
            <div className="flex gap-2">
              <input
                type="color"
                value={form.hex}
                onChange={(e) => setForm((prev) => ({ ...prev, hex: e.target.value }))}
                className="w-10 h-10 border border-gray-300 rounded-md cursor-pointer"
              />
              <input
                type="text"
                value={form.hex}
                onChange={(e) => setForm((prev) => ({ ...prev, hex: e.target.value }))}
                placeholder="#000000"
                className="flex-1 px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
              />
            </div>
          </label>
          <label className="space-y-2 text-xs sm:text-sm text-gray-700">
            색상 코드 *
            <input
              type="text"
              value={form.color_code}
              onChange={(e) => setForm((prev) => ({ ...prev, color_code: e.target.value }))}
              placeholder="예: NV001"
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
            />
          </label>
          <label className="space-y-2 text-xs sm:text-sm text-gray-700">
            라벨
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="표시용 라벨"
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
            />
          </label>
          <label className="space-y-2 text-xs sm:text-sm text-gray-700">
            정렬 순서
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))
              }
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
            />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="rounded border-gray-300"
            />
            활성 상태로 등록
          </label>
          <button
            onClick={createColor}
            disabled={creating}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {creating ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  색상
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  색상명
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  HEX
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  색상 코드
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  라벨
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  순서
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {colors.map((color) => {
                const isEditing = editingId === color.id;
                const isUpdating = updatingId === color.id;
                const isDeleting = deletingId === color.id;

                return (
                  <tr key={color.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="color"
                          value={editDraft?.hex || '#000000'}
                          onChange={(e) =>
                            setEditDraft((prev) => (prev ? { ...prev, hex: e.target.value } : prev))
                          }
                          className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded border border-gray-300"
                          style={{ backgroundColor: color.hex }}
                          title={color.hex}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editDraft?.name || ''}
                          onChange={(e) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, name: e.target.value } : prev
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                      ) : (
                        <span className="text-sm font-medium text-gray-900">{color.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editDraft?.hex || ''}
                          onChange={(e) =>
                            setEditDraft((prev) => (prev ? { ...prev, hex: e.target.value } : prev))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                      ) : (
                        <span className="text-sm text-gray-900 font-mono">{color.hex}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editDraft?.color_code || ''}
                          onChange={(e) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, color_code: e.target.value } : prev
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                      ) : (
                        <span className="text-sm text-gray-900">{color.color_code}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editDraft?.label || ''}
                          onChange={(e) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, label: e.target.value } : prev
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                      ) : (
                        <span className="text-sm text-gray-900">{color.label || '-'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editDraft?.sort_order || 0}
                          onChange={(e) =>
                            setEditDraft((prev) =>
                              prev ? { ...prev, sort_order: parseInt(e.target.value) || 0 } : prev
                            )
                          }
                          className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                      ) : (
                        <span className="text-sm text-gray-900">{color.sort_order ?? 0}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(color)}
                        disabled={isUpdating}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          color.is_active
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {color.is_active ? (
                          <>
                            <ToggleRight className="w-3 h-3" />
                            활성
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-3 h-3" />
                            비활성
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleEditSave(color.id)}
                              disabled={isUpdating}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                            >
                              <Save className="w-4 h-4" />
                              {isUpdating ? '저장 중...' : '저장'}
                            </button>
                            <button
                              onClick={handleEditCancel}
                              disabled={isUpdating}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleEditStart(color)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                            >
                              편집
                            </button>
                            <button
                              onClick={() => deleteColor(color.id)}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              {isDeleting ? '삭제 중...' : '삭제'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-gray-200">
          {colors.map((color) => {
            const isEditing = editingId === color.id;
            const isUpdating = updatingId === color.id;
            const isDeleting = deletingId === color.id;
            return (
              <div key={color.id} className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <input type="color" value={editDraft?.hex || '#000000'} onChange={(e) => setEditDraft((prev) => prev ? {...prev, hex: e.target.value} : prev)} className="w-7 h-7 border border-gray-300 rounded cursor-pointer" />
                  ) : (
                    <div className="w-7 h-7 rounded border border-gray-300 shrink-0" style={{backgroundColor: color.hex}} />
                  )}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input type="text" value={editDraft?.name || ''} onChange={(e) => setEditDraft((prev) => prev ? {...prev, name: e.target.value} : prev)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
                    ) : (
                      <span className="text-xs font-medium text-gray-900">{color.name}</span>
                    )}
                  </div>
                  <button onClick={() => handleToggleActive(color)} disabled={isUpdating} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 transition-colors ${color.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {color.is_active ? <><ToggleRight className="w-3 h-3" />활성</> : <><ToggleLeft className="w-3 h-3" />비활성</>}
                  </button>
                </div>
                {isEditing ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={editDraft?.hex || ''} onChange={(e) => setEditDraft((prev) => prev ? {...prev, hex: e.target.value} : prev)} placeholder="HEX" className="px-2 py-1 border border-gray-300 rounded text-xs" />
                    <input type="text" value={editDraft?.color_code || ''} onChange={(e) => setEditDraft((prev) => prev ? {...prev, color_code: e.target.value} : prev)} placeholder="코드" className="px-2 py-1 border border-gray-300 rounded text-xs" />
                    <input type="text" value={editDraft?.label || ''} onChange={(e) => setEditDraft((prev) => prev ? {...prev, label: e.target.value} : prev)} placeholder="라벨" className="px-2 py-1 border border-gray-300 rounded text-xs" />
                    <input type="number" value={editDraft?.sort_order || 0} onChange={(e) => setEditDraft((prev) => prev ? {...prev, sort_order: parseInt(e.target.value) || 0} : prev)} className="px-2 py-1 border border-gray-300 rounded text-xs" />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                    <span className="font-mono">{color.hex}</span>
                    <span>{color.color_code}</span>
                    <span>{color.label || '-'}</span>
                    <span>순서: {color.sort_order ?? 0}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 pt-0.5">
                  {isEditing ? (
                    <>
                      <button onClick={() => handleEditSave(color.id)} disabled={isUpdating} className="px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"><Save className="w-3.5 h-3.5 inline mr-0.5" />{isUpdating ? '저장 중...' : '저장'}</button>
                      <button onClick={handleEditCancel} disabled={isUpdating} className="px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50">취소</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleEditStart(color)} className="px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100 rounded transition-colors">편집</button>
                      <button onClick={() => deleteColor(color.id)} disabled={isDeleting} className="px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50 ml-auto"><Trash2 className="w-3.5 h-3.5 inline mr-0.5" />{isDeleting ? '삭제 중...' : '삭제'}</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {colors.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <Palette className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2">등록된 색상이 없습니다</h3>
            <p className="text-xs sm:text-sm text-gray-500">새 색상을 등록해보세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FactoriesTab() {
  const { data: rawFactories = [], isLoading: loading, mutate: mutateFactories } = useSWR<Factory[]>('/api/admin/factories');
  const factories = useMemo(() => sortFactories(rawFactories), [rawFactories]);
  const { data: factoryUsers = [], isLoading: loadingUsers, mutate: mutateFactoryUsers } = useSWR<Profile[]>('/api/admin/users?role=factory');
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Omit<typeof emptyForm, 'is_active'> | null>(null);
  const [updatingFactoryId, setUpdatingFactoryId] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [expandedFactoryId, setExpandedFactoryId] = useState<string | null>(null);
  const [selectedUserByFactory, setSelectedUserByFactory] = useState<Record<string, string>>({});

  // Color management view state
  const [selectedFactoryForColors, setSelectedFactoryForColors] = useState<Factory | null>(null);

  // Account creation state
  const [creatingAccountForId, setCreatingAccountForId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({ email: '', password: '' });
  const [creatingAccount, setCreatingAccount] = useState(false);

  const unassignedFactoryUsers = useMemo(
    () => factoryUsers.filter((user) => !user.manufacturer_id),
    [factoryUsers]
  );

  const createFactory = async () => {
    if (!form.name.trim()) {
      setError('공장명을 입력해주세요.');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/factories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone_number: form.phone_number.trim() || null,
          address: form.address.trim() || null,
          is_active: form.is_active,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '공장 생성에 실패했습니다.');
      }

      const payload = await response.json();
      const created = payload?.data as Factory;
      mutateFactories(sortFactories([created, ...rawFactories]), { revalidate: false });
      setForm(emptyForm);
    } catch (err) {
      console.error('Error creating factory:', err);
      setError(err instanceof Error ? err.message : '공장 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const updateFactory = async (factoryId: string, updates: Partial<Factory>) => {
    setUpdatingFactoryId(factoryId);
    setError(null);
    try {
      const response = await fetch('/api/admin/factories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: factoryId, ...updates }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '공장 업데이트에 실패했습니다.');
      }

      const payload = await response.json();
      const updated = payload?.data as Factory;
      mutateFactories(
        sortFactories(rawFactories.map((factory) => (factory.id === updated.id ? updated : factory))),
        { revalidate: false }
      );
      return updated;
    } catch (err) {
      console.error('Error updating factory:', err);
      setError(err instanceof Error ? err.message : '공장 업데이트에 실패했습니다.');
      return null;
    } finally {
      setUpdatingFactoryId(null);
    }
  };

  const handleEditStart = (factory: Factory) => {
    setEditingId(factory.id);
    setEditDraft({
      name: factory.name,
      email: factory.email ?? '',
      phone_number: factory.phone_number ?? '',
      address: factory.address ?? '',
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const handleEditSave = async (factoryId: string) => {
    if (!editDraft) return;
    if (!editDraft.name.trim()) {
      setError('공장명을 입력해주세요.');
      return;
    }

    const updated = await updateFactory(factoryId, {
      name: editDraft.name.trim(),
      email: editDraft.email.trim() || null,
      phone_number: editDraft.phone_number.trim() || null,
      address: editDraft.address.trim() || null,
    });

    if (updated) {
      setEditingId(null);
      setEditDraft(null);
    }
  };

  const handleToggleActive = async (factory: Factory) => {
    if (factory.is_active) {
      const confirmed = window.confirm(`"${factory.name}" 공장을 비활성화할까요?`);
      if (!confirmed) return;
    }

    await updateFactory(factory.id, { is_active: !factory.is_active });
  };

  const updateUserFactory = async (userId: string, factoryId: string | null) => {
    setUpdatingUserId(userId);
    setError(null);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, factoryId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '공장 사용자 업데이트에 실패했습니다.');
      }

      const payload = await response.json();
      const updatedUser = payload?.data as Profile | undefined;
      const nextManufacturerId = updatedUser?.manufacturer_id ?? factoryId;

      mutateFactoryUsers(
        factoryUsers.map((user) =>
          user.id === userId ? { ...user, manufacturer_id: nextManufacturerId } : user
        ),
        { revalidate: false }
      );
      return updatedUser ?? null;
    } catch (err) {
      console.error('Error updating factory user:', err);
      setError(err instanceof Error ? err.message : '공장 사용자 업데이트에 실패했습니다.');
      return null;
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleAssignUser = async (factoryId: string) => {
    const selectedUserId = selectedUserByFactory[factoryId];
    if (!selectedUserId) return;

    const updated = await updateUserFactory(selectedUserId, factoryId);
    if (updated) {
      setSelectedUserByFactory((prev) => ({ ...prev, [factoryId]: '' }));
    }
  };

  const createFactoryAccount = async (factoryId: string) => {
    if (!accountForm.email.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }
    if (!accountForm.password || accountForm.password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setCreatingAccount(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/factory-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturer_id: factoryId,
          email: accountForm.email.trim(),
          password: accountForm.password,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '계정 생성에 실패했습니다.');
      }

      const payload = await response.json();
      const created = payload?.data as Profile;
      mutateFactoryUsers([created, ...factoryUsers], { revalidate: false });
      setAccountForm({ email: '', password: '' });
      setCreatingAccountForId(null);
    } catch (err) {
      console.error('Error creating factory account:', err);
      setError(err instanceof Error ? err.message : '계정 생성에 실패했습니다.');
    } finally {
      setCreatingAccount(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Show color management view when a factory is selected
  if (selectedFactoryForColors) {
    return (
      <ManufacturerColorsEditor
        factory={selectedFactoryForColors}
        onBack={() => setSelectedFactoryForColors(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-xl font-semibold text-gray-900">공장 관리</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">총 {factories.length}개의 공장</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white border border-gray-200/60 rounded-md p-3 sm:p-4 shadow-sm space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2">
          <FactoryIcon className="w-5 h-5 text-gray-600" />
          <h3 className="text-base font-semibold text-gray-900">새 공장 등록</h3>
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          <label className="space-y-2 text-xs sm:text-sm text-gray-700">
            공장명
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
            />
          </label>
          <label className="space-y-2 text-xs sm:text-sm text-gray-700">
            이메일
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
            />
          </label>
          <label className="space-y-2 text-xs sm:text-sm text-gray-700">
            전화번호
            <input
              type="text"
              value={form.phone_number}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, phone_number: event.target.value }))
              }
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
            />
          </label>
        </div>
        <label className="block space-y-2 text-xs sm:text-sm text-gray-700">
          주소
          <input
            type="text"
            value={form.address}
            onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
            placeholder="공장 주소를 입력하세요"
            className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
            className="rounded border-gray-300"
          />
          활성 상태로 등록
        </label>
        <div className="flex justify-end">
          <button
            onClick={createFactory}
            disabled={creating}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {creating ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  공장명
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  이메일
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  전화번호
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  주소
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  소속 사용자
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {factories.map((factory) => {
                const isEditing = editingId === factory.id;
                const isUpdating = updatingFactoryId === factory.id;
                const isExpanded = expandedFactoryId === factory.id;
                const members = factoryUsers.filter((user) => user.manufacturer_id === factory.id);

                return (
                  <Fragment key={factory.id}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft?.name || ''}
                            onChange={(event) =>
                              setEditDraft((prev) =>
                                prev ? { ...prev, name: event.target.value } : prev
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          />
                        ) : (
                          <span className="text-sm font-medium text-gray-900">{factory.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="email"
                            value={editDraft?.email || ''}
                            onChange={(event) =>
                              setEditDraft((prev) =>
                                prev ? { ...prev, email: event.target.value } : prev
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          />
                        ) : (
                          <span className="text-sm text-gray-900">{factory.email || '-'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft?.phone_number || ''}
                            onChange={(event) =>
                              setEditDraft((prev) =>
                                prev ? { ...prev, phone_number: event.target.value } : prev
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          />
                        ) : (
                          <span className="text-sm text-gray-900">
                            {factory.phone_number || '-'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDraft?.address || ''}
                            onChange={(event) =>
                              setEditDraft((prev) =>
                                prev ? { ...prev, address: event.target.value } : prev
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 max-w-[200px] truncate block" title={factory.address || ''}>
                            {factory.address || '-'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() =>
                            setExpandedFactoryId((prev) => (prev === factory.id ? null : factory.id))
                          }
                          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <Users className="w-4 h-4" />
                          {members.length}명
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleActive(factory)}
                          disabled={isUpdating}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            factory.is_active
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                          }`}
                        >
                          {factory.is_active ? (
                            <>
                              <ToggleRight className="w-3 h-3" />
                              활성
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-3 h-3" />
                              비활성
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleEditSave(factory.id)}
                                disabled={isUpdating}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                              >
                                <Save className="w-4 h-4" />
                                {isUpdating ? '저장 중...' : '저장'}
                              </button>
                              <button
                                onClick={handleEditCancel}
                                disabled={isUpdating}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                              >
                                취소
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleEditStart(factory)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                              >
                                편집
                              </button>
                              <button
                                onClick={() => setSelectedFactoryForColors(factory)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-purple-700 hover:bg-purple-50 rounded-md transition-colors"
                              >
                                <Palette className="w-4 h-4" />
                                색상 관리
                              </button>
                              <button
                                onClick={() => {
                                  setCreatingAccountForId((prev) =>
                                    prev === factory.id ? null : factory.id
                                  );
                                  setAccountForm({ email: '', password: '' });
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-green-700 hover:bg-green-50 rounded-md transition-colors"
                              >
                                <UserPlus className="w-4 h-4" />
                                계정 생성
                              </button>
                              <button
                                onClick={() =>
                                  setExpandedFactoryId((prev) =>
                                    prev === factory.id ? null : factory.id
                                  )
                                }
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                              >
                                사용자 관리
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {creatingAccountForId === factory.id && (
                      <tr className="bg-green-50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <UserPlus className="w-4 h-4 text-green-700" />
                              <span className="text-sm font-medium text-gray-700">
                                공장 계정 생성
                              </span>
                            </div>
                            <div className="flex flex-wrap items-end gap-3">
                              <label className="space-y-1 text-sm text-gray-700">
                                이메일 *
                                <input
                                  type="email"
                                  value={accountForm.email}
                                  onChange={(e) =>
                                    setAccountForm((prev) => ({
                                      ...prev,
                                      email: e.target.value,
                                    }))
                                  }
                                  placeholder="factory@example.com"
                                  className="w-60 px-3 py-2 border border-gray-300 rounded-md text-sm"
                                />
                              </label>
                              <label className="space-y-1 text-sm text-gray-700">
                                비밀번호 *
                                <input
                                  type="text"
                                  value={accountForm.password}
                                  onChange={(e) =>
                                    setAccountForm((prev) => ({
                                      ...prev,
                                      password: e.target.value,
                                    }))
                                  }
                                  placeholder="6자 이상"
                                  className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm"
                                />
                              </label>
                              <button
                                onClick={() => createFactoryAccount(factory.id)}
                                disabled={creatingAccount}
                                className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                              >
                                <Plus className="w-4 h-4" />
                                {creatingAccount ? '생성 중...' : '생성'}
                              </button>
                              <button
                                onClick={() => {
                                  setCreatingAccountForId(null);
                                  setAccountForm({ email: '', password: '' });
                                }}
                                disabled={creatingAccount}
                                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-gray-500" />
                                <span className="text-sm font-medium text-gray-700">
                                  공장 사용자
                                </span>
                              </div>
                              {loadingUsers && (
                                <span className="text-xs text-gray-500">불러오는 중...</span>
                              )}
                            </div>

                            <div className="grid gap-2">
                              {members.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                  배정된 사용자가 없습니다.
                                </p>
                              ) : (
                                members.map((member) => (
                                  <div
                                    key={member.id}
                                    className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2"
                                  >
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {member.email || member.id}
                                      </p>
                                      <p className="text-xs text-gray-500">{member.id}</p>
                                    </div>
                                    <button
                                      onClick={() => updateUserFactory(member.id, null)}
                                      disabled={updatingUserId === member.id}
                                      className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                                    >
                                      {updatingUserId === member.id ? '해제 중...' : '해제'}
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="rounded-md border border-gray-200 bg-white p-3 space-y-3">
                              <p className="text-sm font-medium text-gray-700">
                                공장 사용자 배정
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <select
                                  value={selectedUserByFactory[factory.id] || ''}
                                  onChange={(event) =>
                                    setSelectedUserByFactory((prev) => ({
                                      ...prev,
                                      [factory.id]: event.target.value,
                                    }))
                                  }
                                  disabled={loadingUsers || unassignedFactoryUsers.length === 0}
                                  className="min-w-[220px] px-3 py-2 text-sm border border-gray-300 rounded-md bg-white disabled:opacity-50"
                                >
                                  <option value="">
                                    {unassignedFactoryUsers.length === 0
                                      ? '배정 가능한 사용자 없음'
                                      : '사용자 선택'}
                                  </option>
                                  {unassignedFactoryUsers.map((user) => (
                                    <option key={user.id} value={user.id}>
                                      {user.email || user.id}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleAssignUser(factory.id)}
                                  disabled={
                                    !selectedUserByFactory[factory.id] ||
                                    loadingUsers ||
                                    updatingUserId !== null
                                  }
                                  className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                                >
                                  <Plus className="w-4 h-4" />
                                  배정
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-gray-200">
          {factories.map((factory) => {
            const isEditing = editingId === factory.id;
            const isUpdating = updatingFactoryId === factory.id;
            const isExpanded = expandedFactoryId === factory.id;
            const members = factoryUsers.filter((user) => user.manufacturer_id === factory.id);
            return (
              <Fragment key={factory.id}>
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {isEditing ? (
                        <input type="text" value={editDraft?.name || ''} onChange={(e) => setEditDraft((prev) => prev ? {...prev, name: e.target.value} : prev)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
                      ) : (
                        <div className="text-xs font-semibold text-gray-900">{factory.name}</div>
                      )}
                    </div>
                    <button onClick={() => handleToggleActive(factory)} disabled={isUpdating} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 transition-colors ${factory.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>
                      {factory.is_active ? <><ToggleRight className="w-3 h-3" />활성</> : <><ToggleLeft className="w-3 h-3" />비활성</>}
                    </button>
                  </div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="email" value={editDraft?.email || ''} onChange={(e) => setEditDraft((prev) => prev ? {...prev, email: e.target.value} : prev)} placeholder="이메일" className="px-2 py-1 border border-gray-300 rounded text-xs" />
                        <input type="text" value={editDraft?.phone_number || ''} onChange={(e) => setEditDraft((prev) => prev ? {...prev, phone_number: e.target.value} : prev)} placeholder="전화번호" className="px-2 py-1 border border-gray-300 rounded text-xs" />
                      </div>
                      <input type="text" value={editDraft?.address || ''} onChange={(e) => setEditDraft((prev) => prev ? {...prev, address: e.target.value} : prev)} placeholder="주소" className="w-full px-2 py-1 border border-gray-300 rounded text-xs" />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                      <span>{factory.email || '-'}</span>
                      <span>{factory.phone_number || '-'}</span>
                      {factory.address && <span className="truncate max-w-[150px]" title={factory.address}>{factory.address}</span>}
                      <button onClick={() => setExpandedFactoryId((prev) => prev === factory.id ? null : factory.id)} className="text-blue-600 hover:text-blue-700"><Users className="w-3 h-3 inline mr-0.5" />{members.length}명</button>
                    </div>
                  )}
                  <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                    {isEditing ? (
                      <>
                        <button onClick={() => handleEditSave(factory.id)} disabled={isUpdating} className="px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"><Save className="w-3.5 h-3.5 inline mr-0.5" />{isUpdating ? '저장 중...' : '저장'}</button>
                        <button onClick={handleEditCancel} disabled={isUpdating} className="px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50">취소</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleEditStart(factory)} className="px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100 rounded transition-colors">편집</button>
                        <button onClick={() => setSelectedFactoryForColors(factory)} className="px-2 py-1 text-[11px] text-purple-700 hover:bg-purple-50 rounded transition-colors"><Palette className="w-3.5 h-3.5 inline mr-0.5" />색상</button>
                        <button onClick={() => { setCreatingAccountForId((prev) => prev === factory.id ? null : factory.id); setAccountForm({email: '', password: ''}); }} className="px-2 py-1 text-[11px] text-green-700 hover:bg-green-50 rounded transition-colors"><UserPlus className="w-3.5 h-3.5 inline mr-0.5" />계정</button>
                        <button onClick={() => setExpandedFactoryId((prev) => prev === factory.id ? null : factory.id)} className="px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 rounded transition-colors">사용자</button>
                      </>
                    )}
                  </div>
                </div>
                {creatingAccountForId === factory.id && (
                  <div className="bg-green-50 px-3 py-3 space-y-2">
                    <div className="flex items-center gap-2"><UserPlus className="w-3.5 h-3.5 text-green-700" /><span className="text-xs font-medium text-gray-700">공장 계정 생성</span></div>
                    <div className="grid grid-cols-1 gap-2">
                      <input type="email" value={accountForm.email} onChange={(e) => setAccountForm((prev) => ({...prev, email: e.target.value}))} placeholder="factory@example.com" className="px-2.5 py-1.5 border border-gray-300 rounded text-xs" />
                      <input type="text" value={accountForm.password} onChange={(e) => setAccountForm((prev) => ({...prev, password: e.target.value}))} placeholder="비밀번호 (6자 이상)" className="px-2.5 py-1.5 border border-gray-300 rounded text-xs" />
                      <div className="flex gap-2">
                        <button onClick={() => createFactoryAccount(factory.id)} disabled={creatingAccount} className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"><Plus className="w-3.5 h-3.5" />{creatingAccount ? '생성 중...' : '생성'}</button>
                        <button onClick={() => { setCreatingAccountForId(null); setAccountForm({email: '', password: ''}); }} disabled={creatingAccount} className="px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50">취소</button>
                      </div>
                    </div>
                  </div>
                )}
                {isExpanded && (
                  <div className="bg-gray-50 px-3 py-3 space-y-3">
                    <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-gray-500" /><span className="text-xs font-medium text-gray-700">공장 사용자</span></div>{loadingUsers && <span className="text-[11px] text-gray-500">불러오는 중...</span>}</div>
                    <div className="space-y-1.5">
                      {members.length === 0 ? <p className="text-xs text-gray-500">배정된 사용자가 없습니다.</p> : members.map((member) => (
                        <div key={member.id} className="flex items-center justify-between rounded border border-gray-200 bg-white px-2.5 py-1.5">
                          <div><p className="text-xs font-medium text-gray-900">{member.email || member.id}</p><p className="text-[11px] text-gray-500">{member.id.slice(0,8)}...</p></div>
                          <button onClick={() => updateUserFactory(member.id, null)} disabled={updatingUserId === member.id} className="text-[11px] text-red-600 hover:text-red-700 disabled:opacity-50">{updatingUserId === member.id ? '해제 중...' : '해제'}</button>
                        </div>
                      ))}
                    </div>
                    <div className="rounded border border-gray-200 bg-white p-2.5 space-y-2">
                      <p className="text-xs font-medium text-gray-700">공장 사용자 배정</p>
                      <div className="flex gap-2">
                        <select value={selectedUserByFactory[factory.id] || ''} onChange={(e) => setSelectedUserByFactory((prev) => ({...prev, [factory.id]: e.target.value}))} disabled={loadingUsers || unassignedFactoryUsers.length === 0} className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-gray-300 rounded bg-white disabled:opacity-50">
                          <option value="">{unassignedFactoryUsers.length === 0 ? '배정 가능한 사용자 없음' : '사용자 선택'}</option>
                          {unassignedFactoryUsers.map((user) => <option key={user.id} value={user.id}>{user.email || user.id}</option>)}
                        </select>
                        <button onClick={() => handleAssignUser(factory.id)} disabled={!selectedUserByFactory[factory.id] || loadingUsers || updatingUserId !== null} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"><Plus className="w-3.5 h-3.5" />배정</button>
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        {factories.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <FactoryIcon className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2">등록된 공장이 없습니다</h3>
            <p className="text-xs sm:text-sm text-gray-500">새 공장을 등록해보세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
