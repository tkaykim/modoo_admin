'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PartnerMall } from '@/types/types';
import PartnerMallDetail from '@/components/partner-malls/PartnerMallDetail';

export default function PartnerMallDetailPage() {
  const params = useParams();
  const router = useRouter();
  const mallId = params.id as string;

  const [partnerMall, setPartnerMall] = useState<PartnerMall | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialFetchDone = useRef(false);

  const fetchPartnerMall = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/partner-malls');

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || '파트너몰 정보를 불러오지 못했습니다.');
      }

      const payload = await response.json();
      const malls: PartnerMall[] = payload?.data || [];
      const foundMall = malls.find((m) => m.id === mallId);

      if (!foundMall) {
        throw new Error('파트너몰을 찾을 수 없습니다.');
      }

      setPartnerMall(foundMall);
    } catch (err) {
      console.error('Error fetching partner mall:', err);
      setError(err instanceof Error ? err.message : '파트너몰 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [mallId]);

  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    fetchPartnerMall();
  }, [fetchPartnerMall]);

  const handleBack = useCallback(() => {
    router.push('/partner_malls');
  }, [router]);

  const handleUpdate = useCallback(() => {
    fetchPartnerMall();
  }, [fetchPartnerMall]);

  const handleMallUpdate = useCallback((updatedMall: PartnerMall) => {
    setPartnerMall(updatedMall);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !partnerMall) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error || '파트너몰을 찾을 수 없습니다.'}</p>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <PartnerMallDetail
      partnerMall={partnerMall}
      onBack={handleBack}
      onUpdate={handleUpdate}
      onMallUpdate={handleMallUpdate}
    />
  );
}
