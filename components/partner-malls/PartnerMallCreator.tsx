'use client';

import { useRef, useState } from 'react';
import MallProductWorkbench from './MallProductWorkbench';
import MallModalFrame from './MallModalFrame';
import LogoCapture from './LogoCapture';
import { mallDraftPayload, type MallProductDraft } from '@/lib/partner-mall-design';

export default function PartnerMallCreator({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logo, setLogo] = useState('');
  const [originalLogo, setOriginalLogo] = useState('');
  const [showLogo, setShowLogo] = useState(false);
  const [items, setItems] = useState<MallProductDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(false);
  const mallId = useRef<string | null>(null);
  const lock = useRef(false);
  const save = async () => {
    if (lock.current) return;
    setError('');
    if (!name.trim()) { setError('파트너몰 이름을 입력해주세요.'); return; }
    if (slug && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(slug)) { setError('주소는 영문 소문자·숫자·하이픈으로 2자 이상 입력해주세요.'); return; }
    if (!items.length) { setError('진열할 상품을 1개 이상 추가해주세요.'); return; }
    lock.current = true; setSaving(true);
    try {
      const products = items.map(item => ({ ...mallDraftPayload(item), id: item.key }));
      mallId.current ||= crypto.randomUUID();
      const response = await fetch('/api/admin/partner-malls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: mallId.current, name: name.trim(), slug: slug || null, logo_url: logo, original_logo_url: originalLogo || null, is_active: false }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '몰을 생성하지 못했습니다.');
      const added = await fetch('/api/admin/partner-malls/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partner_mall_id: mallId.current, products }) });
      if (!added.ok) { const result = await added.json(); throw new Error(result.error || '상품 저장 실패'); }
      // Publish only after every product is saved; a partial failure stays a private draft.
      const updated = await fetch('/api/admin/partner-malls', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: mallId.current, name: name.trim(), slug: slug || null, logo_url: logo, is_active: active }) });
      if (!updated.ok) { const result = await updated.json(); throw new Error(result.error || '몰 설정 저장 실패'); }
      onCreated();
    } catch (e) { setError(`${e instanceof Error ? e.message : '저장하지 못했습니다.'} 입력 내용은 유지되며 다시 저장할 수 있습니다.`); }
    finally { lock.current = false; setSaving(false); }
  };
  return <MallModalFrame label="파트너몰 생성" title="파트너몰 생성" description="몰 정보를 입력하고 진열할 상품을 추가하세요." onClose={onClose} saving={saving} footer={<>
    {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex items-center justify-between gap-3"><p className="text-xs text-gray-500 sm:text-sm"><strong className="font-semibold text-gray-900">{items.length}개 상품</strong> · {active ? '고객 공개' : '비공개 초안'}</p><div className="flex gap-2"><button onClick={onClose} disabled={saving} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">취소</button><button onClick={save} disabled={saving || !items.length} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? '저장 중...' : '파트너몰 저장'}</button></div></div>
  </>}>
    <div className="space-y-6">
      <div className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">파트너몰 이름<input aria-label="파트너몰 이름" value={name} onChange={e => setName(e.target.value)} placeholder="몰 이름을 입력하세요" className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-normal focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></label>
        <label className="text-sm font-medium text-gray-700">몰 주소 <span className="font-normal text-gray-400">(선택)</span><input aria-label="몰 주소" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} placeholder="my-team" className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-normal focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" /></label>
        <div className="flex items-center gap-3">{logo && <img src={logo} alt="몰 로고" className="h-10 w-10 rounded-lg bg-gray-50 object-contain" />}<button onClick={() => setShowLogo(true)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">몰 로고 {logo ? '변경' : '추가 (선택)'}</button></div>
        <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4 accent-blue-600" />저장 후 고객에게 공개</label>
      </div>
      {showLogo ? <LogoCapture onLogoReady={(url, original) => { setLogo(url); setOriginalLogo(original); setShowLogo(false); }} onCancel={() => setShowLogo(false)} /> : <MallProductWorkbench value={items} onChange={setItems} logoUrl={logo} />}
    </div>
  </MallModalFrame>;
}
