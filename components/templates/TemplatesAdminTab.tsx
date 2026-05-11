'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Filter,
  Star,
  StarOff,
  Eye,
  EyeOff,
  Trash2,
  Package,
  Loader2,
  ImageIcon,
  Tag,
  Layers,
} from 'lucide-react';
import ProductPickerModal from './ProductPickerModal';
import CreateGroupModal from './CreateGroupModal';
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from '@/lib/templateCategories';

type TemplateRow = {
  id: string;
  product_id: string;
  template_group_id: string | null;
  title: string;
  description: string | null;
  preview_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  category: string | null;
  tags: string[] | null;
  type: string;
  sort_order: number | null;
  image_slots: { slot_id: string }[] | null;
  text_slots: { slot_id: string }[] | null;
  products: {
    id: string;
    title: string;
    thumbnail_image_link: string[] | null;
  } | null;
};

type GroupRow = {
  id: string;
  title: string;
  description: string | null;
  preview_url: string | null;
  category: string | null;
  tags: string[] | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  instance_count: number;
};

type ViewMode = 'groups' | 'singles';
type StatusFilter = 'all' | 'active' | 'inactive';

// Picker modes for "+ 새 인스턴스 추가" or "+ 단일 템플릿"
type PickerState =
  | null
  | { mode: 'single' }                // create stand-alone template
  | { mode: 'group'; groupId: string }; // add product instance to a group

export default function TemplatesAdminTab() {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>('groups');

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const [items, setItems] = useState<TemplateRow[]>([]);
  const [singlesLoading, setSinglesLoading] = useState(true);
  const [singlesError, setSinglesError] = useState<string | null>(null);

  const [picker, setPicker] = useState<PickerState>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | 'all' | 'none'>('all');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [q, setQ] = useState('');

  const refetchGroups = async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const res = await fetch('/api/admin/template-groups');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '그룹을 불러오지 못했습니다.');
      setGroups(json.data || []);
    } catch (e) {
      setGroupsError(e instanceof Error ? e.message : '그룹을 불러오지 못했습니다.');
    } finally {
      setGroupsLoading(false);
    }
  };

  const refetchSingles = async () => {
    setSinglesLoading(true);
    setSinglesError(null);
    try {
      const res = await fetch('/api/admin/design-templates?withProduct=1');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '템플릿을 불러오지 못했습니다.');
      // Only stand-alone templates (no group) for the singles view
      const onlySingles = (json.data || []).filter((t: TemplateRow) => !t.template_group_id);
      setItems(onlySingles);
    } catch (e) {
      setSinglesError(e instanceof Error ? e.message : '템플릿을 불러오지 못했습니다.');
    } finally {
      setSinglesLoading(false);
    }
  };

  useEffect(() => {
    refetchGroups();
    refetchSingles();
  }, []);

  // ─── Filters (apply to both views) ────────────────────────────────
  const filteredGroups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (statusFilter === 'active' && !g.is_active) return false;
      if (statusFilter === 'inactive' && g.is_active) return false;
      if (featuredOnly && !g.is_featured) return false;
      if (categoryFilter === 'none' && g.category) return false;
      if (categoryFilter !== 'all' && categoryFilter !== 'none' && g.category !== categoryFilter) return false;
      if (term) {
        const hay = [g.title, g.description ?? '', (g.tags ?? []).join(' ')].join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [groups, q, statusFilter, categoryFilter, featuredOnly]);

  const filteredSingles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((t) => {
      if (statusFilter === 'active' && !t.is_active) return false;
      if (statusFilter === 'inactive' && t.is_active) return false;
      if (featuredOnly && !t.is_featured) return false;
      if (categoryFilter === 'none' && t.category) return false;
      if (categoryFilter !== 'all' && categoryFilter !== 'none' && t.category !== categoryFilter) return false;
      if (term) {
        const hay = [
          t.title,
          t.description ?? '',
          t.products?.title ?? '',
          (t.tags ?? []).join(' '),
        ].join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [items, q, statusFilter, categoryFilter, featuredOnly]);

  // ─── Mutations ────────────────────────────────────────────────────
  const patchTemplate = async (id: string, patch: Record<string, unknown>) => {
    setItems((prev) => prev.map((t) => (t.id === id ? ({ ...t, ...patch } as TemplateRow) : t)));
    try {
      const res = await fetch('/api/admin/design-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || '업데이트에 실패했습니다.');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '업데이트에 실패했습니다.');
      refetchSingles();
    }
  };

  const patchGroup = async (id: string, patch: Record<string, unknown>) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? ({ ...g, ...patch } as GroupRow) : g)));
    try {
      const res = await fetch('/api/admin/template-groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || '업데이트에 실패했습니다.');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '업데이트에 실패했습니다.');
      refetchGroups();
    }
  };

  const deleteTemplate = async (id: string, title: string) => {
    if (!confirm(`"${title}" 템플릿을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/admin/design-templates?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || '삭제에 실패했습니다.');
      }
      setItems((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  const deleteGroup = async (id: string, title: string, instanceCount: number) => {
    const msg = instanceCount > 0
      ? `"${title}" 그룹을 삭제하시겠습니까?\n그룹 안의 ${instanceCount}개 템플릿은 단일 템플릿으로 남습니다.`
      : `"${title}" 그룹을 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/admin/template-groups?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || '삭제에 실패했습니다.');
      }
      setGroups((prev) => prev.filter((g) => g.id !== id));
      refetchSingles(); // instances become singles
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  // ─── Picker handlers ──────────────────────────────────────────────
  const handlePickerSelect = (productId: string) => {
    if (!picker) return;
    const url = picker.mode === 'group'
      ? `/editor/${productId}?mode=template&groupId=${picker.groupId}`
      : `/editor/${productId}?mode=template`;
    setPicker(null);
    router.push(url);
  };

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">템플릿 관리</h1>
          <p className="text-xs text-gray-500 mt-1">
            디자인 그룹(여러 제품에 적용 가능한 컨셉)과 단일 템플릿을 관리합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={() => setCreateGroupOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black text-white text-xs font-medium hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />
            디자인 그룹 만들기
          </button>
          <button
            onClick={() => setPicker({ mode: 'single' })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-xs font-medium hover:bg-gray-50"
          >
            <Package className="w-4 h-4" />
            단일 템플릿 만들기
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 mb-3 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setView('groups')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition ${
            view === 'groups' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers className="w-3 h-3 inline mr-1" />
          그룹 ({groups.length})
        </button>
        <button
          onClick={() => setView('singles')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition ${
            view === 'singles' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package className="w-3 h-3 inline mr-1" />
          단일 템플릿 ({items.length})
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={view === 'groups' ? '그룹 제목, 태그 검색' : '제목, 제품, 태그 검색'}
            className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:border-black"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">상태:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="px-2 py-1 border border-gray-200 rounded text-xs"
            >
              <option value="all">전체</option>
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">카테고리:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as TemplateCategory | 'all' | 'none')}
              className="px-2 py-1 border border-gray-200 rounded text-xs"
            >
              <option value="all">전체</option>
              <option value="none">미지정</option>
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{TEMPLATE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={featuredOnly}
              onChange={(e) => setFeaturedOnly(e.target.checked)}
            />
            <span className="text-gray-600">Featured만</span>
          </label>
          <span className="ml-auto text-gray-400">
            {view === 'groups' ? `${filteredGroups.length} / ${groups.length}` : `${filteredSingles.length} / ${items.length}`}
          </span>
        </div>
      </div>

      {/* Groups grid */}
      {view === 'groups' && (
        <>
          {groupsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : groupsError ? (
            <div className="py-12 text-center text-sm text-red-500">{groupsError}</div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">
              조건에 맞는 그룹이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredGroups.map((g) => {
                const categoryLabel = g.category && (TEMPLATE_CATEGORY_LABELS as Record<string, string>)[g.category];
                return (
                  <div
                    key={g.id}
                    className={`group bg-white border rounded-lg overflow-hidden hover:shadow-md transition ${
                      g.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'
                    }`}
                  >
                    <button
                      onClick={() => router.push(`/templates/group/${g.id}`)}
                      className="block w-full aspect-square bg-gray-100 relative overflow-hidden"
                    >
                      {g.preview_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.preview_url} alt={g.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Layers className="w-8 h-8 text-gray-300" />
                        </div>
                      )}
                      <span className="absolute top-2 left-2 text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        그룹 · {g.instance_count}개 제품
                      </span>
                      {categoryLabel && (
                        <span className="absolute top-2 right-2 text-[9px] font-medium px-1.5 py-0.5 rounded bg-white/90 text-gray-700">
                          {categoryLabel}
                        </span>
                      )}
                    </button>

                    <div className="p-2.5 space-y-1.5">
                      <button
                        onClick={() => router.push(`/templates/group/${g.id}`)}
                        className="block w-full text-left"
                      >
                        <p className="text-xs font-semibold text-gray-900 truncate">{g.title}</p>
                        {(g.tags ?? []).length > 0 && (
                          <p className="text-[10px] text-gray-500 truncate">
                            {(g.tags ?? []).map((t) => `#${t}`).join(' ')}
                          </p>
                        )}
                      </button>

                      <div className="flex items-center gap-1 pt-1.5 border-t border-gray-100">
                        <button
                          onClick={() => setPicker({ mode: 'group', groupId: g.id })}
                          title="이 그룹에 제품 추가"
                          className="flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium bg-gray-50 text-gray-700 hover:bg-gray-100"
                        >
                          <Plus className="w-3 h-3" />
                          제품 추가
                        </button>
                        <button
                          onClick={() => patchGroup(g.id, { is_active: !g.is_active })}
                          title={g.is_active ? '비활성으로 전환' : '활성으로 전환'}
                          className={`p-1 rounded transition ${
                            g.is_active
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          {g.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => patchGroup(g.id, { is_featured: !g.is_featured })}
                          title={g.is_featured ? 'Featured 해제' : 'Featured 설정'}
                          className={`p-1 rounded transition ${
                            g.is_featured
                              ? 'text-yellow-500 hover:bg-yellow-50'
                              : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {g.is_featured ? <Star className="w-3.5 h-3.5 fill-current" /> : <StarOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => deleteGroup(g.id, g.title, g.instance_count)}
                          title="그룹 삭제"
                          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Singles grid */}
      {view === 'singles' && (
        <>
          {singlesLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : singlesError ? (
            <div className="py-12 text-center text-sm text-red-500">{singlesError}</div>
          ) : filteredSingles.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">
              조건에 맞는 단일 템플릿이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredSingles.map((t) => {
                const slotCount = (t.image_slots?.length ?? 0) + (t.text_slots?.length ?? 0);
                const productThumb = Array.isArray(t.products?.thumbnail_image_link)
                  ? t.products?.thumbnail_image_link?.[0]
                  : null;
                const categoryLabel = t.category && (TEMPLATE_CATEGORY_LABELS as Record<string, string>)[t.category];
                return (
                  <div
                    key={t.id}
                    className={`group bg-white border rounded-lg overflow-hidden hover:shadow-md transition ${
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
                      {t.type === 'cobuy_preset' && (
                        <span className="absolute top-2 left-2 text-[9px] font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                          공구 프리셋
                        </span>
                      )}
                      {categoryLabel && (
                        <span className="absolute top-2 right-2 text-[9px] font-medium px-1.5 py-0.5 rounded bg-white/90 text-gray-700">
                          {categoryLabel}
                        </span>
                      )}
                    </button>

                    <div className="p-2.5 space-y-1.5">
                      <button
                        onClick={() => router.push(`/editor/${t.product_id}?mode=template&templateId=${t.id}`)}
                        className="block w-full text-left"
                      >
                        <p className="text-xs font-semibold text-gray-900 truncate">{t.title}</p>
                        <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                          {productThumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={productThumb} alt="" className="w-3 h-3 rounded object-cover" />
                          )}
                          {t.products?.title || '(제품 없음)'}
                        </p>
                      </button>

                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        <Tag className="w-2.5 h-2.5" />
                        슬롯 {slotCount}개
                      </div>

                      <div className="flex items-center gap-1 pt-1.5 border-t border-gray-100">
                        <button
                          onClick={() => patchTemplate(t.id, { is_active: !t.is_active })}
                          title={t.is_active ? '비활성으로 전환' : '활성으로 전환'}
                          className={`flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition ${
                            t.is_active
                              ? 'bg-green-50 text-green-700 hover:bg-green-100'
                              : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                          }`}
                        >
                          {t.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {t.is_active ? '활성' : '비활성'}
                        </button>
                        <button
                          onClick={() => patchTemplate(t.id, { is_featured: !t.is_featured })}
                          title={t.is_featured ? 'Featured 해제' : 'Featured 설정'}
                          className={`p-1 rounded transition ${
                            t.is_featured
                              ? 'text-yellow-500 hover:bg-yellow-50'
                              : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {t.is_featured ? <Star className="w-3.5 h-3.5 fill-current" /> : <StarOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => deleteTemplate(t.id, t.title)}
                          title="삭제"
                          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <ProductPickerModal
        isOpen={picker !== null}
        title={picker?.mode === 'group' ? '이 그룹에 추가할 제품 선택' : '단일 템플릿을 만들 제품 선택'}
        onClose={() => setPicker(null)}
        onSelect={handlePickerSelect}
      />
      <CreateGroupModal
        isOpen={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={(groupId) => {
          setCreateGroupOpen(false);
          refetchGroups();
          // Immediately open product-picker so admin adds the first instance.
          setPicker({ mode: 'group', groupId });
        }}
      />
    </div>
  );
}
