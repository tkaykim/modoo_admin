'use client';

import { useRef, useState } from 'react';
import MallProductWorkbench from './MallProductWorkbench';
import { mallDraftPayload, type MallProductDraft } from '@/lib/partner-mall-design';

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
      const response = await fetch('/api/admin/partner-malls/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partner_mall_id: partnerMallId, products: items.map(item => ({ ...mallDraftPayload(item), id: item.key })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '상품을 추가하지 못했습니다.');
      onProductsAdded();
    } catch (e) { setError(e instanceof Error ? e.message : '상품 저장 실패'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <div role="dialog" aria-label="파트너몰 상품 추가" className="fixed inset-0 z-50 flex flex-col bg-white">
    <header className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">{partnerMallName} · 상품 추가</h2><button onClick={onClose} disabled={saving}>닫기</button></header>
    <div className="flex-1 overflow-auto p-4 md:p-6"><div className="mx-auto max-w-5xl space-y-4">
      {logoAssets.length > 0 && <label className="block text-sm">사용할 몰 로고<select aria-label="사용할 몰 로고" value={selectedLogo} onChange={e => setSelectedLogo(e.target.value)} className="ml-3 rounded border p-2"><option value={logoUrl}>기본 로고</option>{logoAssets.map(asset => <option value={asset.url} key={asset.id}>{asset.name || '등록한 로고'}</option>)}</select></label>}
      <MallProductWorkbench value={items} onChange={setItems} logoUrl={selectedLogo} />
    </div></div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-4">{error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}<span className="text-sm">{items.length}개 상품</span><button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-5 py-3 text-white">{saving ? '저장 중...' : '몰에 상품 추가'}</button></footer>
  </div>;
}
