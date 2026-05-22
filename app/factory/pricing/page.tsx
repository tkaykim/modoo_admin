'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import FactoryPricingEditorModal from '@/components/factories/FactoryPricingEditorModal';
import type { Factory } from '@/types/types';
import { DollarSign, AlertCircle } from 'lucide-react';

/**
 * Factory user self-service: edit their OWN manufacturer's print pricing.
 * AdminLayout already runs useAdminAuth() globally and gates rendering on
 * authStatus === 'authenticated'. We must NOT call useAdminAuth() again here
 * or we cause cascading store mutations and a render storm.
 */
export default function FactoryPricingPage() {
  const authStatus = useAuthStore((s) => s.authStatus);
  const userId = useAuthStore((s) => s.user?.id);
  const [factory, setFactory] = useState<Factory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedForUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    if (!userId) return;
    if (fetchedForUserIdRef.current === userId) return;
    fetchedForUserIdRef.current = userId;

    const ctrl = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/my-factory/info', { signal: ctrl.signal });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || '공장 정보를 불러오지 못했습니다.');
        }
        const payload = await res.json();
        if (!payload?.data) throw new Error('공장 정보가 없습니다.');
        setFactory(payload.data as Factory);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '불러오기 실패');
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [authStatus, userId]);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <DollarSign className="w-6 h-6 text-emerald-600" />
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">단가표 관리</h1>
      </div>

      {authStatus !== 'authenticated' || loading ? (
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
          factory={factory}
          onClose={() => {
            /* inline mode — no close action */
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
