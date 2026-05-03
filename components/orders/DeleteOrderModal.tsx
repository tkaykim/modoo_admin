'use client';

import { useState } from 'react';
import { Order } from '@/types/types';
import { X, Trash2, AlertTriangle } from 'lucide-react';

interface DeleteOrderModalProps {
  order: Order;
  onClose: () => void;
  onSuccess: (orderId: string) => void;
}

export default function DeleteOrderModal({ order, onClose, onSuccess }: DeleteOrderModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirmPaidOrder, setConfirmPaidOrder] = useState(false);

  const isPaid = order.payment_status === 'completed';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (reason.trim().length < 5) {
        throw new Error('삭제 사유를 5자 이상 입력하세요.');
      }
      if (isPaid && !confirmPaidOrder) {
        throw new Error('결제 완료 주문은 확인 체크박스가 필요합니다.');
      }

      const response = await fetch(`/api/admin/orders?orderId=${encodeURIComponent(order.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          reason: reason.trim(),
          confirmPaidOrder,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '주문 삭제에 실패했습니다.');
      }

      onSuccess(order.id);
    } catch (err) {
      console.error('Delete order error:', err);
      setError(err instanceof Error ? err.message : '주문 삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900">주문 영구 삭제</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 flex gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              이 작업은 <strong>되돌릴 수 없습니다</strong>. 주문과 모든 항목이 DB에서 영구 삭제됩니다.
              (감사 로그에 스냅샷은 보관됩니다.)
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

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
              <span className="text-gray-500">결제 상태</span>
              <span className={`font-medium ${isPaid ? 'text-red-600' : ''}`}>
                {order.payment_status}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">결제 금액</span>
              <span className="font-semibold">{order.total_amount.toLocaleString()}원</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                삭제 사유 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={3}
                minLength={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm resize-none"
                placeholder="감사 로그에 기록됩니다 (최소 5자)"
              />
            </div>

            {isPaid && (
              <label className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-300 rounded-md cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmPaidOrder}
                  onChange={(e) => setConfirmPaidOrder(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-sm text-yellow-900">
                  이 주문은 <strong>결제 완료</strong> 상태입니다. 환불 없이 삭제하는 것에 동의합니다.
                </span>
              </label>
            )}
          </div>

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
              disabled={loading || reason.trim().length < 5 || (isPaid && !confirmPaidOrder)}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? '삭제 중...' : '영구 삭제'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
