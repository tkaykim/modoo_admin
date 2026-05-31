'use client';

import { useMemo, useState } from 'react';
import { X, Upload, Loader2, Copy, Check, Coins } from 'lucide-react';
import type { Order, OrderItem } from '@/types/types';
import { createClient } from '@/lib/supabase-client';
import { uploadFileToStorage } from '@/lib/supabase-storage';

interface SurchargeModalProps {
  order: Order;
  orderItems: OrderItem[];
  onClose: () => void;
  onCreated: () => void;
}

// 차액(추가결제) 청구: 이미 결제된 원주문에서 수량/사양 증가로 발생한 차액만큼
// "원주문에 연결된 별도의 작은 주문(order_category='surcharge')"을 만들고, 기존 결제레일
// (payment_link_token → /order/custom/[token])로 고객이 추가 결제하게 한다.
// 기존 원주문/결제건은 일절 건드리지 않는다. 결제 후 생산사양 반영·공장배정은 기존 흐름대로.
export default function SurchargeModal({ order, orderItems, onClose, onCreated }: SurchargeModalProps) {
  // 부모 주문의 제품들(중복 제거) — 차액 품목의 제품/이미지 기본값으로 재사용
  const productChoices = useMemo(() => {
    const seen = new Set<string>();
    const list: { productId: string; productTitle: string; thumbnailUrl: string | null }[] = [];
    for (const it of orderItems) {
      if (!it.product_id || seen.has(it.product_id)) continue;
      seen.add(it.product_id);
      list.push({
        productId: it.product_id,
        productTitle: it.product_title || '제품',
        thumbnailUrl: (it as unknown as { thumbnail_url?: string | null }).thumbnail_url ?? null,
      });
    }
    return list;
  }, [orderItems]);

  const [productId, setProductId] = useState<string>(productChoices[0]?.productId || '');
  const selectedChoice = productChoices.find((p) => p.productId === productId) || productChoices[0] || null;

  const [reason, setReason] = useState('');
  const [sizeLabel, setSizeLabel] = useState('추가분');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [overrideImageUrl, setOverrideImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const qtyNum = Math.max(0, parseInt(quantity, 10) || 0);
  const priceNum = Math.max(0, parseInt(unitPrice, 10) || 0);
  const surchargeTotal = qtyNum * priceNum;
  const imageUrl = overrideImageUrl ?? selectedChoice?.thumbnailUrl ?? null;

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const res = await uploadFileToStorage(supabase, file, 'products', 'quick-order-images');
      if (!res.success || !res.url) throw new Error(res.error || '이미지 업로드에 실패했습니다.');
      setOverrideImageUrl(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!selectedChoice) {
      setError('차액 청구할 제품이 없습니다.');
      return;
    }
    if (!reason.trim()) {
      setError('차액 사유를 입력해주세요. (예: 110 사이즈 1개 추가)');
      return;
    }
    if (qtyNum <= 0) {
      setError('수량은 1개 이상이어야 합니다.');
      return;
    }
    if (priceNum <= 0) {
      setError('장당 단가를 입력해주세요.');
      return;
    }
    if (!imageUrl) {
      setError('이미지가 없습니다. 이미지를 업로드해주세요.');
      return;
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
          pricingNote: `차액 청구 (원주문 ${order.id}): ${reason.trim()}`,
          shippingMethod: 'pickup',
          items: [
            {
              quickImage: true,
              productId: selectedChoice.productId,
              thumbnailUrl: imageUrl,
              designTitle: `[차액] ${reason.trim()}`,
              pricingMode: 'custom_unit_price',
              customUnitPrice: priceNum,
              variants: [{ sizeLabel: sizeLabel.trim() || '추가분', sizeCode: '', quantity: qtyNum }],
            },
          ],
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || '차액 주문 생성에 실패했습니다.');
      }
      const url: string | null = json?.data?.paymentLinkUrl ?? null;
      setResultUrl(url);
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
          // 생성 완료 — 결제링크 안내
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-green-800 mb-1">차액 결제링크가 생성되었습니다.</p>
              <p className="text-xs text-green-700">
                원주문 {order.id}에 연결된 차액 주문입니다. 아래 링크를 고객에게 전달하면 추가 결제를 받을 수 있습니다.
                {order.inquiry_id ? ' 연결된 문의의 "연결된 주문/결제" 카드에도 자동 표시됩니다.' : ''}
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">결제 링크</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={resultUrl}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                />
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 shrink-0"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={onClose} className="px-5 py-2 text-sm bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800">
                닫기
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                원주문 <span className="font-mono text-gray-700">{order.id}</span> · 고객 {order.customer_name}
                <br />
                수량/사양 증가로 생긴 <b>차액만큼</b> 별도 결제건을 만듭니다. 원주문 결제는 그대로 유지됩니다.
              </div>

              {productChoices.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">제품</label>
                  <select
                    value={productId}
                    onChange={(e) => { setProductId(e.target.value); setOverrideImageUrl(null); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  >
                    {productChoices.map((p) => (
                      <option key={p.productId} value={p.productId}>{p.productTitle}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">차액 사유 / 설명</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="예: 110 사이즈 1개 추가"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">사이즈/라벨</label>
                  <input
                    value={sizeLabel}
                    onChange={(e) => setSizeLabel(e.target.value)}
                    placeholder="추가분"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">수량</label>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">장당 단가(원)</label>
                  <input
                    type="number"
                    min={0}
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">이미지</label>
                {imageUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={imageUrl} alt="차액 품목 이미지" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                    <label className="text-sm text-blue-600 hover:underline cursor-pointer">
                      {uploading ? '업로드 중...' : '이미지 변경'}
                      <input type="file" accept="image/*" className="hidden" disabled={uploading}
                        onChange={(e) => { void handleUpload(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400">
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin text-blue-500" /> : <Upload className="w-5 h-5 text-gray-400" />}
                    <span className="text-xs text-gray-500">{uploading ? '업로드 중...' : '이미지 선택'}</span>
                    <input type="file" accept="image/*" className="hidden" disabled={uploading}
                      onChange={(e) => { void handleUpload(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} />
                  </label>
                )}
                <p className="mt-1 text-xs text-gray-400">기본값은 원주문 이미지입니다. 필요하면 변경하세요.</p>
              </div>

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
                disabled={submitting || uploading || surchargeTotal <= 0}
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
