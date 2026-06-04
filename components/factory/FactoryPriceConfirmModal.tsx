'use client';

import { useEffect, useState } from 'react';
import { Loader2, Wallet, X } from 'lucide-react';

/**
 * 공장 단가 확정 모달.
 *
 * 로그인 공장(FactoryOrderInfoPanel)과 링크 전용 공장(shared/order 페이지)이
 * "동일 경험"을 갖도록 두 화면이 공용으로 사용한다.
 *
 * 동작: 공장이 작업을 "작업중"으로 전환(= 작업 시작)할 때 항상 표시.
 * 미리 세팅된 단가를 보여주고, 그대로 확정하거나 수정해서 확정한다.
 * 0원이어도 확정 가능하나(무상 등), 반드시 한 번 확인을 거친다.
 */
export default function FactoryPriceConfirmModal({
  open,
  itemTitle,
  quantity,
  initialAmount,
  submitting = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  itemTitle: string;
  quantity?: number | null;
  initialAmount: number | null;
  submitting?: boolean;
  onConfirm: (amount: number) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState<string>('');

  // 모달이 열릴 때마다 현재 단가로 입력값 초기화
  useEffect(() => {
    if (open) setAmount(initialAmount != null ? String(Math.round(initialAmount)) : '0');
  }, [open, initialAmount]);

  if (!open) return null;

  const numeric = Math.max(0, Math.round(Number(amount.replace(/[^0-9.-]/g, '')) || 0));
  const isZero = numeric === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-gray-900">작업 시작 — 정산 단가 확인</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div>
            <p className="truncate text-sm font-medium text-gray-900">{itemTitle}</p>
            {quantity != null && <p className="text-xs text-gray-500">수량 {quantity}개</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">이 작업의 정산 단가</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitting}
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-base font-semibold focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 disabled:bg-gray-100"
              />
              <span className="text-sm text-gray-600">원</span>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              미리 세팅된 단가가 맞으면 그대로, 다르면 수정 후 확정해 주세요.
            </p>
            {isZero && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                0원으로 확정됩니다. 무상 작업이 맞는지 확인해 주세요.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t px-4 py-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(numeric)}
            disabled={submitting}
            className="flex-[1.6] rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" /> 처리 중...
              </span>
            ) : (
              '이 단가로 확정하고 작업 시작'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
