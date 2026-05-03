'use client';

import { useState } from 'react';
import { Order } from '@/types/types';
import { X, RotateCcw } from 'lucide-react';

interface RefundModalProps {
  order: Order;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RefundModal({ order, onClose, onSuccess }: RefundModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPartial, setIsPartial] = useState(false);
  const [refundAmount, setRefundAmount] = useState<string>(order.total_amount.toString());
  const [reason, setReason] = useState('');

  const paymentMethodLabel =
    order.payment_method === 'toss'
      ? '토스페이'
      : order.payment_method === 'paypal'
      ? 'PayPal'
      : '카드';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        orderId: order.id,
        reason: reason.trim(),
      };

      if (isPartial) {
        const amount = parseFloat(refundAmount);
        if (isNaN(amount) || amount <= 0 || amount > order.total_amount) {
          throw new Error('환불 금액이 올바르지 않습니다.');
        }
        body.amount = amount;
      }

      const response = await fetch('/api/admin/orders/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '환불 처리에 실패했습니다.');
      }

      onSuccess();
    } catch (err) {
      console.error('Refund error:', err);
      setError(err instanceof Error ? err.message : '환불 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900">환불 처리</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Order Info */}
          <div className="mb-4 p-4 bg-gray-50 rounded-md space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">주문 ID</span>
              <span className="font-mono text-blue-600 text-xs">{order.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">고객명</span>
              <span className="font-medium">{order.customer_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">결제 수단</span>
              <span className="font-medium">{paymentMethodLabel}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">결제 금액</span>
              <span className="font-semibold">{order.total_amount.toLocaleString()}원</span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Full vs Partial toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">환불 유형</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPartial(false);
                    setRefundAmount(order.total_amount.toString());
                  }}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    !isPartial
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  전액 환불
                </button>
                <button
                  type="button"
                  onClick={() => setIsPartial(true)}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isPartial
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  부분 환불
                </button>
              </div>
            </div>

            {/* Refund Amount (partial only) */}
            {isPartial && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  환불 금액 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    required
                    min="1"
                    max={order.total_amount}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                    원
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  최대 {order.total_amount.toLocaleString()}원
                </p>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                환불 사유 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm resize-none"
                placeholder="환불 사유를 입력해주세요"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-red-700">환불 금액</span>
              <span className="text-red-700">
                {isPartial
                  ? `${Number(refundAmount || 0).toLocaleString()}원`
                  : `${order.total_amount.toLocaleString()}원 (전액)`}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? '처리중...' : '환불 처리'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
