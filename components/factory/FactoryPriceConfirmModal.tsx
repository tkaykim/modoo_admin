'use client';

import { useEffect, useState } from 'react';
import { Loader2, Wallet, X } from 'lucide-react';

export type FactoryPriceMode = 'per_piece' | 'total';

export interface FactoryPriceResult {
  amount: number;            // 최종 총 작업비
  unitPrice: number | null;  // 장당 단가 (총액 모드면 amount/qty 역산)
  mode: FactoryPriceMode;
}

/**
 * 공장 단가 확정 모달 (장당 / 총 토글).
 *
 * 로그인 공장과 링크 전용 공장이 "동일 경험"을 갖도록 두 화면이 공용으로 사용한다.
 * - 장당 작업비(인쇄비): 기본값은 단가표 자동값(defaultUnitPrice), 조정 가능 → 장당 × 수량 = 총액.
 * - 총 작업비: 총액을 직접 입력.
 * 작업을 "작업중"으로 전환(= 작업 시작)할 때 호출. 0원도 가능하나 한 번 확인을 거친다.
 */
export default function FactoryPriceConfirmModal({
  open,
  itemTitle,
  quantity,
  initialAmount,
  defaultUnitPrice = null,
  submitting = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  itemTitle: string;
  quantity?: number | null;
  /** 기존 총 작업비 (있으면 그대로 노출) */
  initialAmount: number | null;
  /** 단가표 자동값 (장당 기본 단가) */
  defaultUnitPrice?: number | null;
  submitting?: boolean;
  onConfirm: (result: FactoryPriceResult) => void;
  onClose: () => void;
}) {
  const qty = Math.max(0, Math.round(Number(quantity || 0)));
  const [mode, setMode] = useState<FactoryPriceMode>('per_piece');
  const [unitInput, setUnitInput] = useState('');
  const [totalInput, setTotalInput] = useState('');

  // 모달이 열릴 때마다 값 초기화.
  // 장당 기본값 우선순위: 단가표 자동값 → (기존 총액 ÷ 수량) → 0
  useEffect(() => {
    if (!open) return;
    const seedUnit =
      defaultUnitPrice != null && defaultUnitPrice > 0
        ? Math.round(defaultUnitPrice)
        : initialAmount != null && initialAmount > 0 && qty > 0
        ? Math.round(initialAmount / qty)
        : 0;
    const seedTotal = initialAmount != null && initialAmount > 0 ? Math.round(initialAmount) : seedUnit * qty;
    setUnitInput(String(seedUnit));
    setTotalInput(String(seedTotal));
    setMode('per_piece');
  }, [open, defaultUnitPrice, initialAmount, qty]);

  if (!open) return null;

  const num = (s: string) => Math.max(0, Math.round(Number(String(s).replace(/[^0-9.-]/g, '')) || 0));
  const unitPrice = num(unitInput);
  const perPieceTotal = unitPrice * qty;
  const finalAmount = mode === 'per_piece' ? perPieceTotal : num(totalInput);
  const isZero = finalAmount === 0;

  const handleConfirm = () => {
    if (mode === 'per_piece') {
      onConfirm({ amount: perPieceTotal, unitPrice, mode: 'per_piece' });
    } else {
      const total = num(totalInput);
      onConfirm({ amount: total, unitPrice: qty > 0 ? Math.round(total / qty) : null, mode: 'total' });
    }
  };

  const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-gray-900">작업 시작 — 작업비 확인</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div>
            <p className="truncate text-sm font-medium text-gray-900">{itemTitle}</p>
            <p className="text-xs text-gray-500">수량 {qty}개</p>
          </div>

          {/* 장당 / 총 토글 */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode('per_piece')}
              className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === 'per_piece' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              장당 작업비
            </button>
            <button
              type="button"
              onClick={() => setMode('total')}
              className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === 'total' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              총 작업비
            </button>
          </div>

          {mode === 'per_piece' ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">장당 작업비 (인쇄비)</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={unitInput}
                  onChange={(e) => setUnitInput(e.target.value)}
                  disabled={submitting}
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-base font-semibold focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 disabled:bg-gray-100"
                />
                <span className="whitespace-nowrap text-sm text-gray-600">원 / 장</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                기본 단가가 자동으로 채워져 있어요. 다르면 수정해 주세요.
              </p>
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
                <span className="text-gray-600">총 작업비</span>{' '}
                <span className="font-bold text-amber-800">{won(perPieceTotal)}</span>
                <span className="text-gray-500"> ({won(unitPrice)} × {qty}장)</span>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">총 작업비 (인쇄비)</label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={totalInput}
                  onChange={(e) => setTotalInput(e.target.value)}
                  disabled={submitting}
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-base font-semibold focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 disabled:bg-gray-100"
                />
                <span className="text-sm text-gray-600">원</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">이 작업 전체에 대한 작업비를 입력해 주세요.</p>
            </div>
          )}

          {isZero && (
            <p className="text-xs font-medium text-rose-600">
              0원으로 확정됩니다. 무상 작업이 맞는지 확인해 주세요.
            </p>
          )}
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
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-[1.6] rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" /> 처리 중...
              </span>
            ) : (
              '이 작업비로 확정하고 작업 시작'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
