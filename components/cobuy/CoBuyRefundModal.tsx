'use client';

import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { CoBuyParticipant } from '@/types/types';

interface CoBuyRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: CoBuyParticipant | null;
  onRefunded: () => void;
}

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return `${value.toLocaleString()}원`;
};

export default function CoBuyRefundModal({
  isOpen,
  onClose,
  participant,
  onRefunded,
}: CoBuyRefundModalProps) {
  const [reason, setReason] = useState('');
  const [isFullRefund, setIsFullRefund] = useState(true);
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !participant) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      setError('환불 사유를 입력해주세요.');
      return;
    }

    if (!isFullRefund && (refundAmount <= 0 || (participant.payment_amount && refundAmount > participant.payment_amount))) {
      setError('올바른 환불 금액을 입력해주세요.');
      return;
    }

    const confirmed = window.confirm(
      `${participant.name}님에게 ${isFullRefund ? '전액' : formatCurrency(refundAmount)} 환불을 진행하시겠습니까?`
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        participantId: participant.id,
        reason: reason.trim(),
      };
      if (!isFullRefund) {
        body.amount = refundAmount;
      }

      const response = await fetch('/api/admin/cobuy/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || '환불 처리에 실패했습니다.');
      }

      onRefunded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '환불 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">공동구매 환불</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">{participant.name}</p>
              <p className="text-xs mt-1">결제 금액: {formatCurrency(participant.payment_amount)}</p>
              <p className="text-xs">결제 키: {participant.payment_key ? `${participant.payment_key.slice(0, 12)}...` : '없음'}</p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">환불 사유 *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="환불 사유를 입력해주세요"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">환불 유형</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={isFullRefund}
                  onChange={() => setIsFullRefund(true)}
                  className="text-blue-600"
                />
                전액 환불
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={!isFullRefund}
                  onChange={() => {
                    setIsFullRefund(false);
                    setRefundAmount(participant.payment_amount || 0);
                  }}
                  className="text-blue-600"
                />
                부분 환불
              </label>
            </div>
          </div>

          {!isFullRefund && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">환불 금액</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={participant.payment_amount || undefined}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">원</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {loading ? '처리 중...' : '환불 처리'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
