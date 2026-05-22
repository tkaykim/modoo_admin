'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import FactoryPricingEditorModal from '@/components/factories/FactoryPricingEditorModal';
import type { Factory } from '@/types/types';
import { DollarSign, AlertCircle } from 'lucide-react';

/**
 * Factory user self-service: edit their OWN manufacturer's print pricing.
 * The /api/my-factory/* endpoints derive the factory_id from the session, so
 * the user cannot edit any other factory's pricing (RLS also enforces this).
 *
 * Admin/super_admin users can technically navigate here, but the API will
 * 403 them — they should use 공장관리 → 단가표 instead.
 */
export default function FactoryPricingPage() {
  const { authStatus, user } = useAdminAuth();
  const [factory, setFactory] = useState<Factory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Force the editor to remount (and reload data) after a save to reflect deletions
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get one row to derive factory_id, then look up the manufacturer record.
        const res = await fetch('/api/my-factory/print-pricing');
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || '단가 조회에 실패했습니다.');
        }
        const payload = await res.json();
        const factoryId: string | undefined = payload?.factory_id;
        if (!factoryId) {
          throw new Error('소속 공장 정보를 찾을 수 없습니다.');
        }
        // Fetch the manufacturer record for display (name etc.)
        const mfgRes = await fetch(`/api/my-factory/info`);
        if (mfgRes.ok) {
          const mfgPayload = await mfgRes.json();
          if (!cancelled && mfgPayload?.data) {
            setFactory(mfgPayload.data);
            return;
          }
        }
        // Fallback: minimal factory shell using just the id
        if (!cancelled) {
          setFactory({
            id: factoryId,
            name: '내 공장',
            email: null,
            phone_number: null,
            address: null,
            is_active: true,
            created_at: '',
            updated_at: '',
          } as Factory);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '불러오기 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [authStatus, user?.id]);

  if (authStatus !== 'authenticated') {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <DollarSign className="w-6 h-6 text-emerald-600" />
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">단가표 관리</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700 flex gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            {error}
            <p className="mt-1 text-xs text-red-600">
              공장 계정이 아니거나 소속 공장이 지정되지 않은 경우 이 페이지를 사용할 수 없습니다.
            </p>
          </div>
        </div>
      ) : factory ? (
        <FactoryPricingEditorModal
          key={editorKey}
          factory={factory}
          onClose={() => {
            // Re-mount the editor to reload from server (acts as "reset/refresh")
            setEditorKey((k) => k + 1);
          }}
          onSaved={() => {
            setEditorKey((k) => k + 1);
          }}
          endpoints={{
            methodsUrl: '/api/my-factory/print-methods',
            pricingGetUrl: '/api/my-factory/print-pricing',
            pricingBulkUrl: '/api/my-factory/print-pricing/bulk',
          }}
          presentation="inline"
        />
      ) : null}
    </div>
  );
}
