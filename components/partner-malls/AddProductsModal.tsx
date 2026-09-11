'use client';

import { useRef, useState } from 'react';
import MallProductWorkbench from './MallProductWorkbench';
import MallModalFrame from './MallModalFrame';
import { mallDraftPayload, requireMallPrices, type MallProductDraft } from '@/lib/partner-mall-design';

export default function AddProductsModal({ partnerMallId, partnerMallName, logoUrl, logoAssets = [], onClose, onProductsAdded }: {
  partnerMallId: string; partnerMallName: string; logoUrl: string;
  logoAssets?: Array<{ id: string; url: string; name?: string | null; is_primary?: boolean }>;
  onClose: () => void; onProductsAdded: () => void;
}) {
  const [items, setItems] = useState<MallProductDraft[]>([]);
  const [selectedLogo, setSelectedLogo] = useState(logoUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const save = async () => {
    if (lock.current) return;
    if (!items.length) { setError('상품을 1개 이상 추가해주세요.'); return; }
    lock.current = true; setSaving(true); setError('');
    try {
      requireMallPrices(items);
      const response = await fetch('/api/admin/partner-malls/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partner_mall_id: partnerMallId, products: items.map(item => ({ ...mallDraftPayload(item), id: item.key })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '상품을 추가하지 못했습니다.');
      onProductsAdded();
    } catch (e) { setError(e instanceof Error ? e.message : '상품 저장 실패'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <MallModalFrame label="파트너몰 상품 추가" title="상품 추가" description={partnerMallName} onClose={onClose} saving={saving} footer={<>
    {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-gray-500">진열할 상품 <strong className="font-semibold text-gray-900">{items.length}개</strong></p><div className="flex gap-2"><button onClick={onClose} disabled={saving} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">취소</button><button onClick={save} disabled={saving || !items.length} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? '저장 중...' : '몰에 상품 추가'}</button></div></div>
  </>}>
    <div className="space-y-5">
      {logoAssets.length > 0 && <label className="flex flex-wrap items-center gap-3 text-sm font-medium text-gray-700">사용할 몰 로고<select aria-label="사용할 몰 로고" value={selectedLogo} onChange={e => setSelectedLogo(e.target.value)} className="max-w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"><option value={logoUrl}>기본 로고</option>{logoAssets.map(asset => <option value={asset.url} key={asset.id}>{asset.name || '등록한 로고'}</option>)}</select></label>}
      <MallProductWorkbench value={items} onChange={setItems} logoUrl={selectedLogo} />
    </div>
  </MallModalFrame>;
}
