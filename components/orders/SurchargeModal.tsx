'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Copy, Check, Coins, Plus, Minus } from 'lucide-react';
import type { Order, OrderItem, SizeOption } from '@/types/types';

interface SurchargeModalProps {
  order: Order;
  orderItems: OrderItem[];
  onClose: () => void;
  onCreated: () => void;
}

interface VariantInput {
  sizeLabel: string;
  sizeCode: string;
  quantity: number;
}

const REASON_PRESETS = ['작업량 증가', '긴급 제작비', '디자인 사양 변경', '배송비 추가', '직접 입력'] as const;

// 차액(추가결제) 청구 — 2가지 맥락.
//  A) 수량 추가: 원주문 품목을 골라 제품의 정식 size_options로 사이즈별 수량 입력.
//     원주문 디자인을 그대로 승계(재목업 X)하므로 결제 확정 시 발주/공장 추가작업으로 정상 진입.
//  B) 기타 사유(정액): 작업량 증가·긴급 제작비 등 자유 사유 + 자유 금액.
// 두 경우 모두 원주문에 연결된 별도 주문(order_category='surcharge')을 만들고 기존 결제레일로 수금.
// 원주문/원결제는 일절 건드리지 않는다.
export default function SurchargeModal({ order, orderItems, onClose, onCreated }: SurchargeModalProps) {
  // 원주문 품목 = 차액의 기준(승계 원본). product_id 있는 품목만.
  const itemChoices = useMemo(
    () =>
      orderItems
        .filter((it) => it.product_id && it.id)
        .map((it) => ({
          orderItemId: it.id,
          productId: it.product_id as string,
          productTitle: it.product_title || '제품',
          unitPrice: Number(it.price_per_item) || 0,
          thumbnailUrl: (it as unknown as { thumbnail_url?: string | null }).thumbnail_url ?? null,
        })),
    [orderItems],
  );

  const [mode, setMode] = useState<'quantity' | 'reason'>('quantity');
  const [selectedOrderItemId, setSelectedOrderItemId] = useState<string>(itemChoices[0]?.orderItemId || '');
  const selectedItem = itemChoices.find((c) => c.orderItemId === selectedOrderItemId) || itemChoices[0] || null;

  // 제품 size_options 로드 (원주문에 없던 사이즈도 추가 가능해야 하므로 제품 정의 기준)
  const [products, setProducts] = useState<Array<{ id: string; size_options?: SizeOption[] | null }>>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [variants, setVariants] = useState<VariantInput[]>([]);
  const [unitPrice, setUnitPrice] = useState<string>('');

  // 기타 사유 모드
  const [reasonPreset, setReasonPreset] = useState<(typeof REASON_PRESETS)[number]>('작업량 증가');
  const [reasonText, setReasonText] = useState('');
  const [amount, setAmount] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/products');
        const json = await res.json();
        if (!cancelled) setProducts(Array.isArray(json?.data) ? json.data : []);
      } catch {
        /* noop */
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 선택 품목/제품 변경 시 사이즈 그리드 + 기본 단가 초기화
  useEffect(() => {
    if (!selectedItem) return;
    const product = products.find((p) => p.id === selectedItem.productId);
    const opts = product?.size_options || [];
    setVariants(opts.map((o) => ({ sizeLabel: o.label, sizeCode: o.size_code, quantity: 0 })));
    setUnitPrice(selectedItem.unitPrice > 0 ? String(selectedItem.unitPrice) : '');
  }, [selectedOrderItemId, products]); // eslint-disable-line react-hooks/exhaustive-deps

  const setQty = (idx: number, delta: number) =>
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, quantity: Math.max(0, v.quantity + delta) } : v)));
  const setQtyInput = (idx: number, val: string) => {
    const q = Math.max(0, parseInt(val, 10) || 0);
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, quantity: q } : v)));
  };

  const totalQty = variants.reduce((s, v) => s + v.quantity, 0);
  const unitPriceNum = Math.max(0, parseInt(unitPrice, 10) || 0);
  const amountNum = Math.max(0, parseInt(amount, 10) || 0);
  const surchargeTotal = mode === 'quantity' ? totalQty * unitPriceNum : amountNum;

  const resolvedReason = reasonPreset === '직접 입력'
    ? reasonText.trim()
    : (reasonText.trim() ? `${reasonPreset} — ${reasonText.trim()}` : reasonPreset);

  const handleSubmit = async () => {
    setError(null);
    if (!selectedItem) {
      setError('차액 기준이 될 원주문 품목이 없습니다.');
      return;
    }

    let items: Record<string, unknown>[];
    let pricingNote: string;

    if (mode === 'quantity') {
      if (totalQty <= 0) {
        setError('추가할 사이즈별 수량을 입력해주세요.');
        return;
      }
      if (unitPriceNum <= 0) {
        setError('장당 단가를 입력해주세요.');
        return;
      }
      items = [
        {
          inheritFromOrderItemId: selectedItem.orderItemId,
          productId: selectedItem.productId,
          pricingMode: 'custom_unit_price',
          customUnitPrice: unitPriceNum,
          variants: variants.filter((v) => v.quantity > 0),
        },
      ];
      const sizeSummary = variants.filter((v) => v.quantity > 0).map((v) => `${v.sizeLabel} ${v.quantity}개`).join(', ');
      pricingNote = `차액(수량추가) 원주문 ${order.id}: ${sizeSummary}`;
    } else {
      if (!resolvedReason) {
        setError('차액 사유를 입력해주세요.');
        return;
      }
      if (amountNum <= 0) {
        setError('차액 금액을 입력해주세요.');
        return;
      }
      const thumb = selectedItem.thumbnailUrl || 'https://placehold.co/200x200/png';
      items = [
        {
          quickImage: true,
          productId: selectedItem.productId,
          thumbnailUrl: thumb,
          designTitle: `[차액] ${resolvedReason}`,
          pricingMode: 'custom_unit_price',
          customUnitPrice: amountNum,
          variants: [{ sizeLabel: '차액', sizeCode: '', quantity: 1 }],
        },
      ];
      pricingNote = `차액(기타사유) 원주문 ${order.id}: ${resolvedReason}`;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentOrderId: order.id,
          paymentType: 'customer_payment',
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          customerPhone: order.customer_phone || undefined,
          shippingMethod: 'pickup',
          pricingNote,
          items,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || '차액 주문 생성에 실패했습니다.');
      setResultUrl(json?.data?.paymentLinkUrl ?? null);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : '차액 주문 생성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-600" />
            차액 추가청구
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        {resultUrl !== null ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-green-800 mb-1">차액 결제링크가 생성되었습니다.</p>
              <p className="text-xs text-green-700">
                원주문 {order.id}에 연결된 차액 주문입니다. 아래 링크를 고객에게 전달하면 추가 결제를 받을 수 있습니다.
                {mode === 'quantity' ? ' 결제 확정 시 발주관리·공장 배정에 추가 제작분으로 자동 진입합니다.' : ''}
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">결제 링크</label>
              <div className="flex items-center gap-2">
                <input readOnly value={resultUrl} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50" />
                <button onClick={handleCopy} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 shrink-0">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={onClose} className="px-5 py-2 text-sm bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800">닫기</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                원주문 <span className="font-mono text-gray-700">{order.id}</span> · 고객 {order.customer_name}
                <br />변경분만큼 <b>별도 결제건</b>을 만듭니다. 원주문 결제는 그대로 유지됩니다.
              </div>

              {/* 모드 토글 */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('quantity')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${mode === 'quantity' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                >
                  수량 추가
                </button>
                <button
                  type="button"
                  onClick={() => setMode('reason')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${mode === 'reason' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                >
                  기타 사유(정액)
                </button>
              </div>

              {/* 기준 품목 선택 */}
              {itemChoices.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{mode === 'quantity' ? '추가할 품목 (원주문 기준)' : '연결 품목'}</label>
                  <select
                    value={selectedOrderItemId}
                    onChange={(e) => setSelectedOrderItemId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-amber-500"
                  >
                    {itemChoices.map((c) => (
                      <option key={c.orderItemId} value={c.orderItemId}>{c.productTitle} ({c.unitPrice.toLocaleString()}원)</option>
                    ))}
                  </select>
                </div>
              )}

              {mode === 'quantity' ? (
                <>
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    원주문 디자인을 그대로 승계해 같은 디자인으로 추가 제작합니다(재목업 없음). 사이즈는 제품 정식 사이즈로만 입력됩니다.
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">사이즈별 추가 수량</label>
                    {loadingProducts ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400 py-3"><Loader2 className="w-4 h-4 animate-spin" /> 사이즈 불러오는 중...</div>
                    ) : variants.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">이 제품에 등록된 사이즈가 없습니다. "기타 사유" 모드를 이용하세요.</p>
                    ) : (
                      <div className="space-y-2">
                        {variants.map((v, i) => (
                          <div key={v.sizeCode || v.sizeLabel + i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                            <span className="text-sm font-medium text-gray-700">{v.sizeLabel}</span>
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => setQty(i, -1)} disabled={v.quantity <= 0} className="p-1.5 rounded bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40"><Minus className="w-3.5 h-3.5" /></button>
                              <input type="number" min="0" value={v.quantity} onChange={(e) => setQtyInput(i, e.target.value)} className="w-14 text-center p-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                              <button type="button" onClick={() => setQty(i, 1)} className="p-1.5 rounded bg-white border border-gray-200 hover:bg-gray-100"><Plus className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>
                        ))}
                        <p className="text-xs text-gray-500">추가 총 수량: {totalQty}개</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">장당 단가(원) — 원주문 단가 자동, 수정 가능</label>
                    <input type="number" min={0} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">차액 사유</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {REASON_PRESETS.map((r) => (
                        <button key={r} type="button" onClick={() => setReasonPreset(r)} className={`px-2.5 py-1 rounded-full text-xs border ${reasonPreset === r ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>{r}</button>
                      ))}
                    </div>
                    <input
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                      placeholder={reasonPreset === '직접 입력' ? '사유를 직접 입력하세요' : '보충 설명 (선택)'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">차액 금액(원)</label>
                    <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                </>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-amber-800">청구 차액</span>
                <span className="text-lg font-bold text-amber-900">{surchargeTotal.toLocaleString()}원</span>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
              <button
                onClick={handleSubmit}
                disabled={submitting || surchargeTotal <= 0}
                className="px-5 py-2 text-sm bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                차액 결제링크 생성
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
