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
  Loader2,
  Layers,
} from 'lucide-react';
import ProductPickerModal from './ProductPickerModal';
import CreateGroupModal from './CreateGroupModal';
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
} from '@/lib/templateCategories';

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

type StatusFilter = 'all' | 'active' | 'inactive';

/** Picker is only used to add a new product instance to an existing group. */
type PickerState = null | { mode: 'group'; groupId: string };

export default function TemplatesAdminTab() {
  const router = useRouter();

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);

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

  useEffect(() => {
    refetchGroups();
  }, []);

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

  const deleteGroup = async (id: string, title: string, instanceCount: number) => {
    const msg = instanceCount > 0
      ? `"${title}" 그룹을 삭제하시겠습니까?\n그룹 안의 ${instanceCount}개 제품 템플릿은 단일 템플릿으로 남습니다.`
      : `"${title}" 그룹을 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/admin/template-groups?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || '삭제에 실패했습니다.');
      }
      setGroups((prev) => prev.filter((g) => g.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  // Picker is only used for "이 그룹에 제품 추가" from a group card.
  const handlePickerSelect = (productId: string) => {
    if (!picker) return;
    const url = `/editor/${productId}?mode=template&groupId=${picker.groupId}`;
    setPicker(null);
    router.push(url);
  };

  return (
    <div className="p-4 lg:p-6 max-w-screen-xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">템플릿 관리</h1>
          <p className="text-xs text-gray-500 mt-1">
            제품과 무관한 디자인 그룹을 만들고, 그룹 상세에서 제품별 템플릿을 추가합니다.
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
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="그룹 제목, 태그 검색"
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
          <span className="ml-auto text-gray-400">{filteredGroups.length} / {groups.length}</span>
        </div>
      </div>

      {/* Groups grid */}
      {groupsLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : groupsError ? (
        <div className="py-12 text-center text-sm text-red-500">{groupsError}</div>
      ) : filteredGroups.length === 0 ? (
        <div className="py-20 text-center text-sm text-gray-400">
          {groups.length === 0 ? '아직 등록된 디자인 그룹이 없습니다. 위 "디자인 그룹 만들기"로 시작하세요.' : '조건에 맞는 그룹이 없습니다.'}
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
                    그룹 · 제품 {g.instance_count}개
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
                      title="이 그룹에 제품 템플릿 추가"
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

      {/* Modals */}
      <ProductPickerModal
        isOpen={picker !== null}
        title="이 그룹에 추가할 제품 선택"
        onClose={() => setPicker(null)}
        onSelect={handlePickerSelect}
      />
      <CreateGroupModal
        isOpen={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={(groupId) => {
          setCreateGroupOpen(false);
          refetchGroups();
          // 사용자 모델: 그룹 생성 직후 곧장 아트워크 편집기로 (제품 선택 X)
          router.push(`/templates/group/${groupId}/artwork`);
        }}
      />
    </div>
  );
}
