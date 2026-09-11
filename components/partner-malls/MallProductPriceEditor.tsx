'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MallOverlay } from './MallModalFrame';
import type { PartnerMallProduct } from '@/types/types';

export default function MallProductPriceEditor({ product, onClose, onSaved, hasDiscount }: {
  product: PartnerMallProduct; onClose: () => void; onSaved: () => void; hasDiscount: boolean;
}) {
  const [price, setPrice] = useState(product.price == null ? '' : String(product.price));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (lock.current) return;
    const amount = Number(price);
    if (!price.trim() || !Number.isSafeInteger(amount) || amount < 0) { setError('판매가는 0 이상의 정수로 입력해주세요.'); return; }
    lock.current = true; setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/partner-malls/products', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: product.id, price: amount }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '가격 저장에 실패했습니다.');
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : '가격 저장에 실패했습니다.'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <MallOverlay onClose={saving ? undefined : onClose} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
    <form onSubmit={save} role="dialog" aria-modal="true" aria-label="상품 가격 수정" className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4"><h2 className="text-base font-semibold">상품 가격 수정</h2><button type="button" aria-label="닫기" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button></header>
      <div className="space-y-4 p-5"><p className="text-sm font-medium text-gray-800">{product.display_name || product.product?.title}</p>
        <label className="block text-sm text-gray-700">판매가 (원)<input aria-label="판매가" type="number" min="0" step="1" required value={price} onChange={e => setPrice(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></label>
        <p className="text-xs leading-5 text-gray-500">인쇄비를 포함한 상품 1개의 판매가입니다.<br />저장하면 고객몰에 반영되며 기존 주문의 가격은 변경되지 않습니다.{hasDiscount && <><br />이 몰에 설정된 할인·쿠폰은 별도로 적용됩니다.</>}</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-gray-200 p-4"><button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700">취소</button><button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? '저장 중...' : '가격 저장'}</button></footer>
    </form>
  </MallOverlay>;
}
