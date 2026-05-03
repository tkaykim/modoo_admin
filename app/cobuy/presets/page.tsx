'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR, { mutate } from 'swr';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { DesignTemplate } from '@/types/types';
import { formatKstDateTimeMedium } from '@/lib/kst';

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
});

const formatDate = (dateString?: string | null) =>
  dateString ? formatKstDateTimeMedium(dateString) : '-';

// Fetch products for display names
function useProducts() {
  const { data } = useSWR('/api/admin/products', fetcher);
  const products: { id: string; title: string }[] = data?.data || [];
  return products;
}

export default function CoBuyPresetsPage() {
  const { data, error } = useSWR<{ data: DesignTemplate[] }>(
    '/api/admin/design-templates?type=cobuy_preset',
    fetcher
  );
  const products = useProducts();
  const [deleting, setDeleting] = useState<string | null>(null);

  const presets = data?.data || [];
  const isLoading = !data && !error;

  const getProductName = (productId: string) => {
    return products.find(p => p.id === productId)?.title || productId.slice(0, 8);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 프리셋을 삭제하시겠습니까?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/design-templates?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      mutate('/api/admin/design-templates?type=cobuy_preset');
    } catch {
      alert('삭제에 실패했습니다.');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (preset: DesignTemplate) => {
    try {
      const res = await fetch('/api/admin/design-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: preset.id, is_active: !preset.is_active }),
      });
      if (!res.ok) throw new Error();
      mutate('/api/admin/design-templates?type=cobuy_preset');
    } catch {
      alert('상태 변경에 실패했습니다.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">공동구매 프리셋</h2>
          <p className="text-xs text-gray-500 mt-0.5">공동구매 생성 시 캔버스에 자동으로 배치되는 기본 디자인을 관리합니다.</p>
        </div>
        <Link
          href="/editor/0d8f53fa-bac2-4f0a-8eb4-870a70e072eb?mode=template&presetType=cobuy_preset&returnUrl=/cobuy/presets"
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          새 프리셋
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 text-center py-8">데이터를 불러오지 못했습니다.</p>
      )}

      {!isLoading && !error && presets.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <p className="text-sm text-gray-500 mb-2">등록된 프리셋이 없습니다.</p>
          <p className="text-xs text-gray-400">프리셋을 만들면 공동구매 생성 시 기본 디자인이 자동으로 적용됩니다.</p>
        </div>
      )}

      {presets.length > 0 && (
        <div className="space-y-2">
          {presets.map(preset => (
            <div key={preset.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
              {/* Preview */}
              <div className="w-14 h-14 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden shrink-0">
                {preset.preview_url ? (
                  <img src={preset.preview_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">미리보기</div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{preset.title}</p>
                <p className="text-[11px] text-gray-500">{getProductName(preset.product_id)}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    preset.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {preset.is_active ? '활성' : '비활성'}
                  </span>
                  <span className="text-[10px] text-gray-400">{formatDate(preset.updated_at)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggleActive(preset)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600"
                  title={preset.is_active ? '비활성화' : '활성화'}
                >
                  {preset.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <Link
                  href={`/editor/${preset.product_id}?mode=template&templateId=${preset.id}&presetType=cobuy_preset&returnUrl=/cobuy/presets`}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-blue-600"
                  title="편집"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Link>
                <button
                  onClick={() => handleDelete(preset.id)}
                  disabled={deleting === preset.id}
                  className="p-1.5 rounded-lg hover:bg-red-50 transition text-gray-400 hover:text-red-500 disabled:opacity-50"
                  title="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
