'use client';

import { useEffect, useMemo, useState } from 'react';
import { Truck, Save, AlertTriangle } from 'lucide-react';
import { CoBuyDeliverySettings } from '@/types/types';

interface Props {
  sessionId: string;
  settings: CoBuyDeliverySettings | null;
  participantCount: number;
  onSaved: (next: CoBuyDeliverySettings) => void;
}

const INDIVIDUAL_DELIVERY_FEE = 5000;

function isEqual(a: CoBuyDeliverySettings | null, b: CoBuyDeliverySettings | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export default function AdminDeliverySettingsCard({ sessionId, settings, participantCount, onSaved }: Props) {
  const [allowIndividual, setAllowIndividual] = useState<boolean>(settings?.enabled ?? false);
  const [postalCode, setPostalCode] = useState<string>(settings?.deliveryAddress?.postalCode ?? '');
  const [roadAddress, setRoadAddress] = useState<string>(settings?.deliveryAddress?.roadAddress ?? '');
  const [addressDetail, setAddressDetail] = useState<string>(settings?.deliveryAddress?.addressDetail ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setAllowIndividual(settings?.enabled ?? false);
    setPostalCode(settings?.deliveryAddress?.postalCode ?? '');
    setRoadAddress(settings?.deliveryAddress?.roadAddress ?? '');
    setAddressDetail(settings?.deliveryAddress?.addressDetail ?? '');
    setError('');
  }, [sessionId, settings]);

  const isAllowIndividualLocked = participantCount > 0;

  const draft = useMemo<CoBuyDeliverySettings>(() => {
    const base: CoBuyDeliverySettings = {
      enabled: allowIndividual,
      deliveryFee: allowIndividual ? INDIVIDUAL_DELIVERY_FEE : 0,
    };
    if (roadAddress.trim()) {
      base.deliveryAddress = {
        roadAddress: roadAddress.trim(),
        postalCode: postalCode.trim(),
        addressDetail: addressDetail.trim() || undefined,
      };
    }
    return base;
  }, [allowIndividual, postalCode, roadAddress, addressDetail]);

  const dirty = !isEqual(draft, settings);
  const bulkAddressMissing = !draft.deliveryAddress?.roadAddress;

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/cobuy/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, deliverySettings: draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '저장에 실패했습니다.');
      onSaved(json.data?.delivery_settings ?? draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200/60 rounded-md p-3 sm:p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Truck className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">배송 설정</h3>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={allowIndividual}
          disabled={isAllowIndividualLocked}
          onChange={(e) => setAllowIndividual(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm text-gray-700">
          참여자별 개별 배송 허용 (1인당 +5,000원)
          {isAllowIndividualLocked && (
            <span className="ml-2 text-[11px] text-gray-500">참여자가 있어 변경 불가</span>
          )}
        </span>
      </label>

      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">일괄 수령지</label>
          {bulkAddressMissing && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
              <AlertTriangle className="w-3 h-3" />
              배송 전까지 입력 필요
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            placeholder="우편번호"
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={roadAddress}
            onChange={(e) => setRoadAddress(e.target.value)}
            placeholder="도로명/지번 주소"
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <input
          type="text"
          value={addressDetail}
          onChange={(e) => setAddressDetail(e.target.value)}
          placeholder="상세주소 (동/호수 등)"
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isSaving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? '저장 중…' : '배송 설정 저장'}
        </button>
      </div>
    </div>
  );
}
