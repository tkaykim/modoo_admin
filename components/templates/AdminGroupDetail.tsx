'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Eye,
  EyeOff,
  Star,
  StarOff,
  Loader2,
  ImageIcon,
  X,
} from 'lucide-react';
import ProductPickerModal from './ProductPickerModal';
import CompositionEditor from './CompositionEditor';
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from '@/lib/templateCategories';
import type { DesignComposition } from '@/types/types';

const EMPTY_COMPOSITION: DesignComposition = { slots: [] };

interface InstanceRow {
  id: string;
  product_id: string;
  title: string;
  preview_url: string | null;
  is_active: boolean;
  sort_order: number;
  products: {
    id: string;
    title: string;
    thumbnail_image_link: string[] | null;
    base_price: number;
  } | null;
}

interface GroupRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  preview_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  design_composition: DesignComposition | null;
  templates: InstanceRow[];
}

interface Props {
  groupId: string;
}

export default function AdminGroupDetail({ groupId }: Props) {
  const router = useRouter();
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Editable meta state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory | ''>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [composition, setComposition] = useState<DesignComposition>(EMPTY_COMPOSITION);

  const fetchGroup = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/template-groups?id=${groupId}&withInstances=1`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '그룹을 불러오지 못했습니다.');
      const g: GroupRow = json.data;
      setGroup(g);
      setTitle(g.title);
      setDescription(g.description ?? '');
      setCategory((g.category as TemplateCategory) || '');
      setTags(g.tags ?? []);
      setPreviewUrl(g.preview_url ?? '');
      setIsActive(g.is_active);
      setIsFeatured(g.is_featured);
      setComposition(
        g.design_composition && Array.isArray(g.design_composition.slots)
          ? g.design_composition
          : EMPTY_COMPOSITION,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '그룹을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const metaDirty = useMemo(() => {
    if (!group) return false;
    return (
      title !== group.title ||
      (description ?? '') !== (group.description ?? '') ||
      (category || null) !== group.category ||
      JSON.stringify(tags) !== JSON.stringify(group.tags ?? []) ||
      (previewUrl || null) !== group.preview_url ||
      isActive !== group.is_active ||
      isFeatured !== group.is_featured
    );
  }, [group, title, description, category, tags, previewUrl, isActive, isFeatured]);

  const compositionDirty = useMemo(() => {
    if (!group) return false;
    return JSON.stringify(composition) !== JSON.stringify(group.design_composition ?? EMPTY_COMPOSITION);
  }, [group, composition]);

  const dirty = metaDirty || compositionDirty;

  const saveAll = async () => {
    if (!group) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/template-groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: group.id,
          title,
          description: description || null,
          category: category || null,
          tags,
          preview_url: previewUrl || null,
          is_active: isActive,
          is_featured: isFeatured,
          design_composition: composition,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '저장 실패');
      setGroup({ ...group, ...json.data });
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async () => {
    if (!group) return;
    if (
      !confirm(
        `"${group.title}" 그룹을 삭제하시겠습니까?\n그룹 안의 ${group.templates.length}개 템플릿은 단일 템플릿으로 남습니다.`,
      )
    )
      return;
    try {
      const res = await fetch(`/api/admin/template-groups?id=${group.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || '삭제 실패');
      }
      router.push('/templates');
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  const removeInstance = async (templateId: string, productTitle: string) => {
    if (!confirm(`"${productTitle}" 템플릿을 이 그룹에서 빼겠습니까?\n(템플릿은 단일 템플릿으로 남습니다)`)) return;
    try {
      const res = await fetch('/api/admin/design-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: templateId, template_group_id: null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || '실패');
      }
      fetchGroup();
    } catch (e) {
      alert(e instanceof Error ? e.message : '실패');
    }
  };

  const handlePickerSelect = (productId: string) => {
    setPickerOpen(false);
    router.push(`/editor/${productId}?mode=template&groupId=${groupId}`);
  };

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
      <button onClick={() => router.push('/templates')} className="text-xs text-gray-500 mb-3 inline-flex items-center gap-1 hover:text-gray-700">
        <ArrowLeft className="w-3.5 h-3.5" /> 템플릿 목록
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Meta panel */}
        <aside className="bg-white border border-gray-200 rounded-lg p-4 h-fit lg:sticky lg:top-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">그룹 정보</h2>
            <span className="text-[10px] text-gray-400">{group.templates.length}개 제품</span>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:border-black resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TemplateCategory | '')}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
            >
              <option value="">(없음)</option>
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{TEMPLATE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">태그</label>
            <div className="flex gap-1 mb-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const v = tagInput.trim();
                    if (v && !tags.includes(v)) setTags([...tags, v]);
                    setTagInput('');
                  }
                }}
                placeholder="태그 + Enter"
                className="flex-1 px-2 py-1 border border-gray-200 rounded text-[11px]"
              />
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[10px]">
                    #{t}
                    <button onClick={() => setTags(tags.filter((x) => x !== t))} className="text-gray-400 hover:text-red-500">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5">대표 이미지 URL (비우면 첫 인스턴스 사용)</label>
            <input
              type="text"
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-black"
            />
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => setIsActive(!isActive)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
                isActive ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'
              }`}
            >
              {isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {isActive ? '활성' : '비활성'}
            </button>
            <button
              onClick={() => setIsFeatured(!isFeatured)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
                isFeatured ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-400'
              }`}
            >
              {isFeatured ? <Star className="w-3 h-3 fill-current" /> : <StarOff className="w-3 h-3" />}
              Featured
            </button>
          </div>

          <button
            onClick={saveAll}
            disabled={!dirty || saving || !title.trim()}
            className="w-full mt-2 inline-flex items-center justify-center gap-1.5 py-2 rounded bg-black text-white text-xs font-medium hover:bg-gray-800 disabled:bg-gray-300"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            <Save className="w-3 h-3" /> 변경 저장
          </button>

          <button
            onClick={deleteGroup}
            className="w-full text-xs text-red-500 inline-flex items-center justify-center gap-1 py-1 hover:bg-red-50 rounded"
          >
            <Trash2 className="w-3 h-3" /> 그룹 삭제
          </button>
        </aside>

        {/* Right column: composition + instances */}
        <main className="space-y-6">
          {/* Composition editor */}
          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <CompositionEditor
              value={composition}
              onChange={setComposition}
            />
            {compositionDirty && (
              <p className="mt-2 text-[11px] text-amber-600">
                ⚠️ 컴포지션 변경 사항은 좌측의 "변경 저장" 버튼으로 저장됩니다.
              </p>
            )}
          </section>

          {/* Instances grid */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">제품 인스턴스</h3>
            <button
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-xs font-medium hover:bg-gray-800"
            >
              <Plus className="w-3.5 h-3.5" />
              제품 추가
            </button>
          </div>

          {group.templates.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400">
              아직 추가된 제품이 없습니다. <br />
              <span className="text-xs">"제품 추가"로 첫 인스턴스를 만드세요.</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.templates.map((t) => {
                const productThumb = Array.isArray(t.products?.thumbnail_image_link)
                  ? t.products?.thumbnail_image_link?.[0]
                  : null;
                return (
                  <div
                    key={t.id}
                    className={`bg-white border rounded-lg overflow-hidden transition ${
                      t.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'
                    }`}
                  >
                    <button
                      onClick={() => router.push(`/editor/${t.product_id}?mode=template&templateId=${t.id}`)}
                      className="block w-full aspect-square bg-gray-100 relative overflow-hidden"
                    >
                      {t.preview_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.preview_url} alt={t.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-gray-300" />
                        </div>
                      )}
                    </button>
                    <div className="p-2">
                      <p className="text-xs font-medium text-gray-900 truncate flex items-center gap-1">
                        {productThumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={productThumb} alt="" className="w-3 h-3 rounded object-cover" />
                        )}
                        {t.products?.title || '(제품 없음)'}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">{t.title}</p>
                      <button
                        onClick={() => removeInstance(t.id, t.products?.title ?? t.title)}
                        className="mt-1.5 text-[10px] text-gray-400 hover:text-red-500 inline-flex items-center gap-1"
                      >
                        <X className="w-2.5 h-2.5" /> 그룹에서 제외
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <ProductPickerModal
        isOpen={pickerOpen}
        title="이 그룹에 추가할 제품 선택"
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
      />
    </div>
  );
}
