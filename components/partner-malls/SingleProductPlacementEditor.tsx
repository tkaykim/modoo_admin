'use client';

import { useMemo, useRef } from 'react';
import type { PartnerMallProduct } from '@/types/types';
import { createMallDraft, mallDraftPayload } from '@/lib/partner-mall-design';
import MallProductDesignEditor from './MallProductDesignEditor';

export default function SingleProductPlacementEditor({ mallProduct, logoUrl, onClose, onSave }: {
  mallProduct: PartnerMallProduct; logoUrl: string; partnerMallName: string;
  onClose: () => void; onSave: () => void;
}) {
  const source = useMemo(() => {
    try {
      if (!mallProduct.product) throw new Error('제품을 찾을 수 없습니다.');
      return { draft: createMallDraft(mallProduct.product, mallProduct), error: '' };
    } catch (e) { return { draft: null, error: e instanceof Error ? e.message : '디자인을 불러오지 못했습니다.' }; }
  }, [mallProduct]);
  const copyId = useRef<string | null>(null);
  if (!source.draft) return <div role="alert" className="fixed inset-0 z-[70] flex items-center justify-center bg-white"><p>{source.error}</p><button onClick={onClose} className="ml-4 rounded border p-2">닫기</button></div>;
  return <MallProductDesignEditor draft={source.draft} logoUrl={logoUrl} allowCopy onCancel={onClose} onSave={async (next, asCopy) => {
    copyId.current ||= crypto.randomUUID();
    const payload = mallDraftPayload(next);
    const response = await fetch('/api/admin/partner-malls/products', { method: asCopy ? 'PUT' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(asCopy ? { partner_mall_id: mallProduct.partner_mall_id, products: [{ ...payload, id: copyId.current }] } : { ...payload, id: mallProduct.id }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '상품 저장에 실패했습니다.');
    onSave();
  }} />;
}
