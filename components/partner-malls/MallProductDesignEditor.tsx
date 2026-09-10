'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as fabric from 'fabric';
import EditorCanvas from '@/components/editor/EditorCanvas';
import Toolbar from '@/components/canvas/Toolbar';
import TextStylePanel from '@/components/canvas/TextStylePanel';
import LayerColorSelector from '@/components/canvas/LayerColorSelector';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useFontStore } from '@/store/useFontStore';
import { serializeCanvasState, pickPreviewCanvas } from '@/lib/canvasUtils';
import { mergeCustomFonts } from '@/lib/font-contract';
import { extractMallFonts, mallDraftPayload, type MallProductDraft } from '@/lib/partner-mall-design';

type Color = { id: string; hex: string; name: string; color_code: string };

export default function MallProductDesignEditor({ draft, logoUrl, onCancel, onSave, allowCopy = false }: {
  draft: MallProductDraft;
  logoUrl?: string;
  onCancel: () => void;
  onSave: (draft: MallProductDraft, asCopy: boolean) => Promise<void> | void;
  allowCopy?: boolean;
}) {
  const [name, setName] = useState(draft.display_name);
  const [price, setPrice] = useState(draft.price === null ? '' : String(draft.price));
  const [colors, setColors] = useState<Color[]>([]);
  const [color, setColor] = useState<Color | null>(draft.color_hex ? { id: draft.manufacturer_color_id || '', hex: draft.color_hex, name: draft.color_name || '', color_code: draft.color_code || '' } : null);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<fabric.FabricObject | null>(null);
  const loaded = useRef(new Set<string>());
  const restoringLegacy = useRef(new Set<string>());
  const liveCanvases = useRef<Record<string, fabric.Canvas>>({});
  const scales = useRef<Record<string, number>>({});
  const saveLock = useRef(false);
  const sides = useMemo(() => draft.product.configuration || [], [draft.product]);
  const activeSideId = useCanvasStore(s => s.activeSideId);
  const activeSide = sides.find(s => s.id === activeSideId) || sides[0];
  const fonts = useMemo(() => mergeCustomFonts(draft.custom_fonts, extractMallFonts(draft.canvas_state)), [draft]);
  const initialStates = useMemo(() => Object.fromEntries(sides.map(side => [side.id, draft.canvas_state[side.id] || JSON.stringify({ objects: [] })])), [draft, sides]);

  useEffect(() => {
    // A mounted editor owns the shared canvas store; no other canvas editor is mounted behind it.
    useCanvasStore.setState({ canvasMap: {}, layerColors: {}, canvasHistory: {}, historyIndex: {}, objectPrintMethods: {}, zoomLevels: {}, activeSideId: sides[0]?.id || null, productColor: draft.color_hex || '#FFFFFF', isEditMode: true });
    useFontStore.getState().setCustomFonts(fonts);
    setMounted(true);
    const timer = setTimeout(() => {
      if (loaded.current.size !== sides.length) setError('일부 면을 불러오지 못했습니다. 닫았다가 다시 열어주세요.');
    }, 30000);
    return () => { clearTimeout(timer); useCanvasStore.getState().setEditMode(false); };
  }, [draft, fonts, sides]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/product-colors?product_id=${draft.product.id}`, { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error('제품 색상을 불러오지 못했습니다.'); return r.json(); })
      .then(data => setColors((data.data || []).filter((c: { is_active: boolean }) => c.is_active).map((c: { manufacturer_colors: Color }) => c.manufacturer_colors).filter(Boolean)))
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [draft.product.id]);

  const onReady = useCallback(async (canvas: fabric.Canvas, sideId: string, scale: number) => {
    if (!canvas.getObjects().some(o => o.get('data')?.id === 'background-product-image')) {
      setError('제품 이미지를 불러오지 못했습니다. 닫았다가 다시 열어주세요.');
      return;
    }
    liveCanvases.current[sideId] = canvas;
    scales.current[sideId] = scale;
    // Older malls saved placement coordinates and a preview, without canvas JSON.
    // Restore that logo once; an explicitly saved empty side remains empty.
    const placement = draft.logo_placements[sideId];
    if (!(sideId in draft.canvas_state) && placement && !loaded.current.has(sideId)) {
      if (restoringLegacy.current.has(sideId)) return;
      restoringLegacy.current.add(sideId);
      try {
        if (!logoUrl) throw new Error('기존 로고 파일을 찾을 수 없습니다.');
        const logo = await fabric.FabricImage.fromURL(logoUrl, { crossOrigin: 'anonymous' });
        if (canvas.disposed) return;
        const area = canvas as fabric.Canvas & { printAreaLeft?: number; printAreaTop?: number };
        const logoScale = Math.min(placement.width / (logo.width || 100), placement.height / (logo.height || 100));
        logo.set({ left: (area.printAreaLeft || 0) + placement.x * scale, top: (area.printAreaTop || 0) + placement.y * scale, scaleX: logoScale * scale, scaleY: logoScale * scale, originX: 'left', originY: 'top', data: { id: 'partner-mall-logo' } });
        canvas.add(logo); canvas.requestRenderAll();
        useCanvasStore.getState().resetHistory(sideId);
      } catch { setError('기존 로고를 복원하지 못했습니다. 파일을 확인한 뒤 다시 열어주세요.'); return; }
      finally { restoringLegacy.current.delete(sideId); }
    }
    loaded.current.add(sideId);
    setReady(sides.length > 0 && sides.every(s => loaded.current.has(s.id)));
  }, [sides, draft, logoUrl]);

  const addLogo = async () => {
    const canvas = useCanvasStore.getState().getActiveCanvas();
    if (!canvas || !logoUrl) return;
    try {
      const img = await fabric.FabricImage.fromURL(logoUrl, { crossOrigin: 'anonymous' });
      img.scaleToWidth(80);
      img.set({ left: canvas.width / 2, top: canvas.height / 2, originX: 'center', originY: 'center', data: { id: crypto.randomUUID() } });
      canvas.add(img); canvas.setActiveObject(img); canvas.requestRenderAll();
    } catch { setError('로고를 불러오지 못했습니다.'); }
  };

  const save = async (asCopy: boolean) => {
    if (saveLock.current) return;
    setError('');
    if (!ready) { setError('모든 면을 불러온 뒤 저장할 수 있습니다.'); return; }
    saveLock.current = true; setSaving(true);
    try {
      const store = useCanvasStore.getState();
      const state = { ...draft.canvas_state };
      const placements = { ...draft.logo_placements };
      const allFonts = mergeCustomFonts(fonts, useFontStore.getState().customFonts);
      for (const side of sides) {
        const canvas = liveCanvases.current[side.id];
        if (!canvas || canvas.disposed) throw new Error(`${side.name} 면을 다시 불러와주세요.`);
        // Embed legacy top-level font metadata in objects so mall-only copies remain self-contained.
        const embedFonts = (objects: fabric.FabricObject[]) => objects.forEach(obj => {
          const text = obj as fabric.IText;
          const font = allFonts.find(f => f.fontFamily === text.fontFamily);
          if (font) obj.set('data', { ...(obj.get('data') || {}), fontUrl: font.url, fontMetadata: font, fontDisplayName: font.displayName });
          if (obj instanceof fabric.Group) embedFonts(obj.getObjects());
        });
        embedFonts(canvas.getObjects());
        state[side.id] = serializeCanvasState(canvas, store.layerColors[side.id] || {}, store.productColor);
        // The existing customer fallback prices each printed side from these bounds.
        // Clearing them would incorrectly charge only for the blank garment.
        const bounds = canvas.getObjects().filter(o => !o.excludeFromExport && o.get('data')?.id !== 'background-product-image').map(o => o.getBoundingRect());
        if (bounds.length) {
          const scale = scales.current[side.id];
          if (!(scale > 0)) throw new Error(`${side.name} 면의 인쇄 크기를 계산할 수 없습니다.`);
          const left = Math.min(...bounds.map(b => b.left));
          const top = Math.min(...bounds.map(b => b.top));
          const right = Math.max(...bounds.map(b => b.left + b.width));
          const bottom = Math.max(...bounds.map(b => b.top + b.height));
          const area = canvas as fabric.Canvas & { printAreaLeft?: number; printAreaTop?: number };
          placements[side.id] = { x: (left - (area.printAreaLeft || 0)) / scale, y: (top - (area.printAreaTop || 0)) / scale, width: (right - left) / scale, height: (bottom - top) / scale };
        } else delete placements[side.id];
      }
      const preview = pickPreviewCanvas(sides.map(s => s.id), liveCanvases.current);
      if (!preview) throw new Error('상품 미리보기를 만들 수 없습니다.');
      preview.discardActiveObject(); preview.renderAll();
      const next: MallProductDraft = { ...draft, display_name: name, price: price.trim() === '' ? null : Number(price), canvas_state: state, logo_placements: placements, custom_fonts: allFonts, preview_url: preview.toDataURL({ format: 'png', multiplier: 0.75 }), manufacturer_color_id: color?.id || null, color_hex: color?.hex || store.productColor, color_name: color?.name || null, color_code: color?.color_code || null, ready: true };
      mallDraftPayload(next);
      await onSave(next, asCopy);
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { saveLock.current = false; setSaving(false); }
  };

  return <div role="dialog" aria-label="파트너몰 전체 면 편집" className="fixed inset-0 z-[70] flex flex-col bg-neutral-700">
    <header className="flex flex-wrap items-center justify-between gap-2 bg-neutral-900 p-3 text-white">
      <button disabled={saving} onClick={onCancel}>편집 취소</button>
      <strong className="text-sm">전체 면 디자인 편집</strong>
      <div className="flex gap-2">
        {allowCopy && <button disabled={saving} onClick={() => save(true)} className="rounded bg-white px-3 py-2 text-sm text-blue-700">별도 상품으로 저장</button>}
        <button disabled={saving} onClick={() => save(false)} className="rounded bg-blue-600 px-3 py-2 text-sm">{saving ? '저장 중...' : allowCopy ? '수정 저장' : '편집 완료'}</button>
      </div>
    </header>
    {error && <p role="alert" className="bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="relative min-h-[300px] flex-1">
        {mounted && <EditorCanvas sides={sides} isEditing canvasStates={initialStates} productColor={draft.color_hex || '#FFFFFF'} customFonts={fonts} onCanvasReady={onReady} productId={draft.product.id} leftToolbarWidth={36} />}
        {mounted && <div className="absolute left-0 top-2 z-20"><Toolbar sides={sides} handleExitEditMode={() => {}} variant="editor" productId={draft.product.id} onSelectedObjectChange={setSelected} /></div>}
        <div className="absolute bottom-2 left-12 right-2 flex flex-wrap gap-1">
          {sides.map(s => <button key={s.id} onClick={() => useCanvasStore.getState().setActiveSide(s.id)} className={`rounded px-3 py-1 text-xs ${s.id === activeSideId ? 'bg-blue-600 text-white' : 'bg-white text-gray-800'}`}>{s.name}</button>)}
          <span className="rounded bg-neutral-900 px-2 py-1 text-xs text-white">{ready ? `${sides.length}개 면 준비 완료` : '디자인 불러오는 중...'}</span>
        </div>
      </div>
      <aside className="max-h-[38vh] w-full space-y-3 overflow-auto bg-white p-4 md:max-h-none md:w-72">
        <label className="block text-sm">상품명<input aria-label="상품명" value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label className="block text-sm">판매가 (원)<input aria-label="판매가" type="number" min="0" step="1" value={price} onChange={e => setPrice(e.target.value)} placeholder="비워두면 제품가 + 기본 인쇄비" className="mt-1 w-full rounded border p-2" /></label>
        <label className="block text-sm">의류 색상<select aria-label="의류 색상" value={color?.id || ''} className="mt-1 w-full rounded border p-2" onChange={e => { const c = colors.find(c => c.id === e.target.value); if (c) { setColor(c); useCanvasStore.getState().setProductColor(c.hex); } }}>
          <option value="">{color ? `${color.name || color.hex} (불러온 색상)` : '색상 선택'}</option>
          {colors.map(c => <option key={c.id} value={c.id}>{c.name} ({c.color_code})</option>)}
        </select></label>
        {logoUrl && <button onClick={addLogo} className="w-full rounded border p-2 text-sm">선택한 면에 몰 로고 추가</button>}
        {activeSide?.layers?.length ? <LayerColorSelector sideId={activeSide.id} layers={activeSide.layers} compact /> : null}
        {selected && /text/i.test(selected.type) && <TextStylePanel selectedObject={selected as fabric.IText} variant="desktop" compact />}
        <p className="text-xs leading-5 text-gray-500">제품이 제공하는 모든 면에서 이미지·문구·배치·크기를 수정할 수 있습니다.<br />불러온 원본 디자인과 기존 주문은 변경되지 않습니다.</p>
      </aside>
    </div>
  </div>;
}
