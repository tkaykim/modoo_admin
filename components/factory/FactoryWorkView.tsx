'use client';

import { useState } from 'react';
import { Package } from 'lucide-react';
import FactoryPriceConfirmModal, { type FactoryPriceResult } from '@/components/factory/FactoryPriceConfirmModal';

/**
 * 공장 작업 화면 (로그인·링크 공용).
 *
 * 공장 담당자가 보는 단 하나의 화면:
 *  - 배정된 작업 카드 목록 (썸네일/디자인명/수량/기본 단가)
 *  - 배정완료 → 작업중 전환 시 "작업비 확인" 모달 (장당/총)
 *  - 디자인 보기(선택)
 *
 * 데이터/저장은 페이지가 onApply 콜백으로 주입한다(로그인=admin API, 링크=public API).
 * 두 진입점이 이 컴포넌트를 그대로 쓰므로 경험이 100% 동일하다.
 */

export interface FactoryWorkItem {
  id: string;
  product_title: string;
  design_title?: string | null;
  quantity: number;
  thumbnail_url?: string | null;
  product_code?: string | null;
  factory_status?: string | null;
  factory_amount?: number | null;
  factory_unit_price?: number | null;
  factory_price_confirmed_at?: string | null;
  variantsText?: string | null;
}

const STATUS_OPTIONS = [
  { value: 'assigned', label: '배정완료' },
  { value: 'in_progress', label: '작업중' },
  { value: 'completed', label: '작업완료' },
  { value: 'shipped', label: '출고완료' },
];

const STATUS_COLOR: Record<string, string> = {
  assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  shipped: 'bg-indigo-100 text-indigo-800',
};

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

function defaultUnit(item: FactoryWorkItem): number | null {
  if (item.factory_unit_price != null && item.factory_unit_price > 0) return Math.round(item.factory_unit_price);
  if (item.factory_amount != null && item.factory_amount > 0 && item.quantity > 0) {
    return Math.round(item.factory_amount / item.quantity);
  }
  return null;
}

export default function FactoryWorkView({
  items,
  title = '배정된 작업',
  subtitle,
  updatingItemId = null,
  onApply,
  onOpenDesign,
}: {
  items: FactoryWorkItem[];
  title?: string;
  subtitle?: string;
  updatingItemId?: string | null;
  /** 상태 변경 적용. in_progress면 price가 함께 온다. 성공 시 true 반환. */
  onApply: (item: FactoryWorkItem, payload: { status: string; price?: FactoryPriceResult }) => Promise<boolean> | boolean;
  /** 디자인 보기(선택) */
  onOpenDesign?: (item: FactoryWorkItem) => void;
}) {
  const [pending, setPending] = useState<FactoryWorkItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSelect = async (item: FactoryWorkItem, next: string) => {
    if (next === (item.factory_status || 'assigned')) return;
    if (next === 'in_progress') {
      setPending(item); // 단가 확인 모달
      return;
    }
    await onApply(item, { status: next });
  };

  const handleConfirm = async (result: FactoryPriceResult) => {
    if (!pending) return;
    setSubmitting(true);
    const ok = await onApply(pending, { status: 'in_progress', price: result });
    setSubmitting(false);
    if (ok) setPending(null);
  };

  return (
    <div className="space-y-3">
      <FactoryPriceConfirmModal
        open={!!pending}
        itemTitle={pending?.design_title || pending?.product_title || ''}
        quantity={pending?.quantity ?? null}
        initialAmount={pending?.factory_amount ?? 0}
        defaultUnitPrice={pending ? defaultUnit(pending) : null}
        submitting={submitting}
        onConfirm={handleConfirm}
        onClose={() => setPending(null)}
      />

      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          {title} <span className="text-sm font-normal text-gray-500">({items.length})</span>
        </h2>
        {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
          배정된 작업이 없습니다.
        </div>
      )}

      {items.map((item) => {
        const unit = defaultUnit(item);
        const confirmed = !!item.factory_price_confirmed_at;
        const status = item.factory_status || 'assigned';
        const busy = updatingItemId === item.id;
        return (
          <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex gap-3">
              <div
                className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded bg-gray-100 ${onOpenDesign ? 'cursor-pointer' : ''}`}
                onClick={() => onOpenDesign?.(item)}
              >
                {item.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnail_url} alt={item.product_title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-7 w-7 text-gray-400" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {item.design_title || item.product_title}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {item.product_title}
                      {item.product_code ? ` · ${item.product_code}` : ''}
                    </p>
                    {item.variantsText && <p className="mt-0.5 truncate text-xs text-gray-500">{item.variantsText}</p>}
                    <p className="mt-0.5 text-xs text-gray-500">수량 {item.quantity}개</p>
                  </div>
                  {onOpenDesign && (
                    <button
                      onClick={() => onOpenDesign(item)}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                    >
                      디자인 보기
                    </button>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={status}
                    onChange={(e) => handleSelect(item, e.target.value)}
                    disabled={busy || status === 'shipped'}
                    className={`rounded-md border-0 px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 ${STATUS_COLOR[status] || 'bg-gray-100 text-gray-700'}`}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>

                  {/* 단가: 확정값 우선, 없으면 기본(단가표) 단가를 '예정'으로 노출 */}
                  {item.factory_amount != null && item.factory_amount > 0 ? (
                    <span className="text-xs font-medium text-gray-700">
                      {won(item.factory_amount)}
                      {unit ? <span className="text-gray-400"> ({won(unit)}/장)</span> : null}
                      {confirmed && <span className="ml-0.5 text-emerald-600">✓</span>}
                    </span>
                  ) : confirmed ? (
                    <span className="text-xs font-medium text-gray-500">0원 확정<span className="ml-0.5 text-emerald-600">✓</span></span>
                  ) : unit ? (
                    <span className="text-xs text-gray-500">기본 {won(unit)}/장 (작업 시작 시 확정)</span>
                  ) : (
                    <span className="text-xs text-gray-400">작업 시작 시 단가 입력</span>
                  )}

                  {busy && <span className="text-xs text-gray-400">처리 중...</span>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
