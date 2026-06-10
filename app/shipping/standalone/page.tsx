'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { Truck, Plus, Printer, RefreshCw, X, Loader2, Search } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';
import { formatKstDateTimeCompact, getKstYYYYMMDD } from '@/lib/kst';
import type { Factory } from '@/types/types';

type Party = { name: string; addr: string; tel: string };
type Source = 'company' | 'manufacturer' | 'custom';

interface ManualShipment {
  id: string;
  fix_take_no: string;
  sender_name: string; sender_addr: string; sender_tel: string;
  receiver_name: string; receiver_addr: string; receiver_tel: string;
  sender_manufacturer_id: string | null;
  receiver_manufacturer_id: string | null;
  fare_ty: string;
  qty: number; delivery_fee: number; goods_nm: string;
  category: string | null; memo: string | null;
  tracking_number: string | null;
  tracking_carrier: string | null;
  status: 'registered' | 'shipping' | 'delivered' | 'cancelled';
  logen_slip_printed: boolean;
  take_dt: string;
  created_at: string;
}

const COMPANY: Party = { name: '모두의 유니폼', addr: '서울특별시 마포구 성지3길 55 3층', tel: '010-8140-0621' };
const fareTyLabel = (t: string) => (t === '010' ? '선불' : t === '020' ? '착불' : t === '030' ? '신용' : '본사신용');
const statusLabel = (s: string) => (s === 'registered' ? '접수' : s === 'shipping' ? '배송중' : s === 'delivered' ? '배송완료' : '취소');
const statusColor = (s: string) =>
  s === 'registered' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
  s === 'shipping' ? 'bg-blue-50 text-blue-700 border-blue-200' :
  s === 'delivered' ? 'bg-green-50 text-green-700 border-green-200' :
  'bg-gray-50 text-gray-600 border-gray-200';

const CATEGORIES = ['재고확보', '자재이동', '공장간 이동', '사무용품', '샘플', '기타'];

export default function StandaloneShippingPage() {
  const { data: shipments, mutate: refetch } = useSWR<ManualShipment[]>(
    '/api/admin/shipping/standalone?status=all',
    (url: string) => fetcher(url).then((r: { data: ManualShipment[] }) => r.data || [])
  );
  const { data: factories } = useSWR<Factory[]>(
    '/api/admin/manufacturers',
    (url: string) => fetcher(url).then((r: { data: Factory[] }) => r.data || [])
  );

  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  // 새 접수 폼 상태
  const [senderSource, setSenderSource] = useState<Source>('company');
  const [senderManufacturerId, setSenderManufacturerId] = useState('');
  const [senderForm, setSenderForm] = useState<Party>(COMPANY);
  const [receiverSource, setReceiverSource] = useState<Source>('manufacturer');
  const [receiverManufacturerId, setReceiverManufacturerId] = useState('');
  const [receiverForm, setReceiverForm] = useState<Party>({ name: '', addr: '', tel: '' });
  const [fareTy, setFareTy] = useState<'010' | '020' | '030' | '040'>('040');
  const [qty, setQty] = useState(1);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [goodsNm, setGoodsNm] = useState('');
  const [category, setCategory] = useState('재고확보');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const factoryById = useCallback(
    (id: string) => (factories || []).find((f) => f.id === id) || null,
    [factories]
  );
  const factoryParty = (id: string): Party => {
    const f = factoryById(id);
    return { name: f?.name || '', addr: f?.address || '', tel: f?.phone_number || '' };
  };

  // 출처가 바뀌면 폼 자동 채움 (custom으로 가면 비우기 — 다만 첫 진입 시 기존값 유지)
  useEffect(() => {
    if (senderSource === 'company') setSenderForm(COMPANY);
    else if (senderSource === 'manufacturer' && senderManufacturerId) setSenderForm(factoryParty(senderManufacturerId));
    else if (senderSource === 'custom') setSenderForm({ name: '', addr: '', tel: '' });
  }, [senderSource, senderManufacturerId, factories]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (receiverSource === 'company') setReceiverForm(COMPANY);
    else if (receiverSource === 'manufacturer' && receiverManufacturerId) setReceiverForm(factoryParty(receiverManufacturerId));
    else if (receiverSource === 'custom') setReceiverForm({ name: '', addr: '', tel: '' });
  }, [receiverSource, receiverManufacturerId, factories]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setSenderSource('company'); setSenderManufacturerId(''); setSenderForm(COMPANY);
    setReceiverSource('manufacturer'); setReceiverManufacturerId(''); setReceiverForm({ name: '', addr: '', tel: '' });
    setFareTy('040'); setQty(1); setDeliveryFee(0); setGoodsNm(''); setCategory('재고확보'); setMemo('');
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (!senderForm.name || !senderForm.addr || !senderForm.tel) { setSubmitError('보내는 분 정보를 모두 입력해 주세요.'); return; }
    if (!receiverForm.name || !receiverForm.addr || !receiverForm.tel) { setSubmitError('받는 분 정보를 모두 입력해 주세요.'); return; }
    if (!goodsNm.trim()) { setSubmitError('물품명을 입력해 주세요.'); return; }
    setSubmitting(true); setSubmitError(null);
    try {
      const res = await fetch('/api/admin/shipping/standalone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { ...senderForm, manufacturerId: senderSource === 'manufacturer' ? senderManufacturerId : null },
          receiver: { ...receiverForm, manufacturerId: receiverSource === 'manufacturer' ? receiverManufacturerId : null },
          fareTy, qty, deliveryFee, goodsNm: goodsNm.trim(), category, memo: memo.trim() || null,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        alert(`접수 완료 — 주문번호 ${json.data?.fix_take_no || '?'}`);
        resetForm(); setShowForm(false); refetch();
      } else {
        setSubmitError(json.error || '접수에 실패했습니다.');
      }
    } catch {
      setSubmitError('서버 연결 실패. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleAll = (rows: ManualShipment[]) => {
    if (selectedIds.size === rows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map((r) => r.id)));
  };

  const handleFetchSlipNo = async () => {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/shipping/standalone/slip-no', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (res.ok) { alert(`${json.data?.updated?.length || 0}건 송장번호 동기화 완료`); refetch(); setSelectedIds(new Set()); }
      else alert(json.error || '실패');
    } finally { setActionLoading(false); }
  };

  const handleTracking = async () => {
    const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : (shipments || []).filter((s) => s.tracking_number && s.status === 'shipping').map((s) => s.id);
    if (targetIds.length === 0) { alert('추적할 송장번호가 없습니다.'); return; }
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/shipping/standalone/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds }),
      });
      const json = await res.json();
      if (res.ok) { alert(`추적 조회 완료 · 배송완료 ${json.data?.deliveredCount || 0}건 전환`); refetch(); }
      else alert(json.error || '실패');
    } finally { setActionLoading(false); }
  };

  const handlePrintPopup = async () => {
    const takeDt = getKstYYYYMMDD();
    const res = await fetch(`/api/admin/shipping/print?takeDt=${takeDt}`);
    const json = await res.json();
    if (res.ok && json.data?.url) window.open(json.data.url, 'logen_print', 'width=900,height=700');
    else alert(json.error || '출력 URL 생성 실패');
  };

  const rows = shipments || [];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">수동 택배 접수</h1>
          <p className="text-xs text-gray-500 mt-1">고객 주문과 무관한 택배(재고확보 · 자재이동 · 공장간 이동 · 사무용품 등) 접수 및 추적</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> 새로고침
          </button>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 새 수동 접수
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={handlePrintPopup} className="px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 flex items-center gap-1.5">
          <Printer className="w-4 h-4" /> 송장 출력 (로젠 팝업)
        </button>
        <button onClick={handleFetchSlipNo} disabled={selectedIds.size === 0 || actionLoading}
          className="px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50">
          {`송장번호 가져오기 (${selectedIds.size}건)`}
        </button>
        <button onClick={handleTracking} disabled={actionLoading}
          className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
          <Search className="w-4 h-4" /> 배송 추적{selectedIds.size > 0 ? ` (${selectedIds.size}건)` : ' (배송중 전체)'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={rows.length > 0 && selectedIds.size === rows.length} onChange={() => toggleAll(rows)} className="rounded" />
                </th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">접수일</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">분류</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">보내는 분</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">받는 분</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">물품 / 수량</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">송장번호</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">상태</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">메모</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-12 text-center text-gray-400">아직 수동 접수건이 없습니다.</td></tr>
              ) : rows.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/50">
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} className="rounded" />
                  </td>
                  <td className="px-3 py-3 text-gray-500 whitespace-nowrap text-xs">{formatKstDateTimeCompact(s.created_at)}</td>
                  <td className="px-3 py-3 text-xs"><span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700">{s.category || '-'}</span></td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900 text-xs">{s.sender_name}</div>
                    <div className="text-[11px] text-gray-500 truncate max-w-[180px]" title={s.sender_addr}>{s.sender_addr}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900 text-xs">{s.receiver_name}</div>
                    <div className="text-[11px] text-gray-500 truncate max-w-[180px]" title={s.receiver_addr}>{s.receiver_addr}</div>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div className="truncate max-w-[180px]" title={s.goods_nm}>{s.goods_nm}</div>
                    <div className="text-[11px] text-gray-500">{s.qty}개 · {fareTyLabel(s.fare_ty)}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-gray-700">{s.tracking_number || '-'}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${statusColor(s.status)}`}>{statusLabel(s.status)}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500 max-w-[160px] truncate" title={s.memo || ''}>{s.memo || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New shipment modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !submitting && setShowForm(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">새 수동 택배 접수</h3>
              <button onClick={() => setShowForm(false)} disabled={submitting} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-5 overflow-y-auto">
              {/* 보내는 분 */}
              <PartyEditor
                title="보내는 분" source={senderSource} onSourceChange={setSenderSource}
                manufacturerId={senderManufacturerId} onManufacturerChange={setSenderManufacturerId}
                value={senderForm} onChange={setSenderForm} factories={factories || []}
              />
              {/* 받는 분 */}
              <PartyEditor
                title="받는 분" source={receiverSource} onSourceChange={setReceiverSource}
                manufacturerId={receiverManufacturerId} onManufacturerChange={setReceiverManufacturerId}
                value={receiverForm} onChange={setReceiverForm} factories={factories || []}
              />

              {/* 물품 / 운임 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">물품명</label>
                  <input value={goodsNm} onChange={(e) => setGoodsNm(e.target.value)} placeholder="예: 무지 티셔츠 100장 / 인쇄 자재 등"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">수량</label>
                  <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">운임 (원)</label>
                  <input type="number" min={0} value={deliveryFee} onChange={(e) => setDeliveryFee(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">운임타입</label>
                  <select value={fareTy} onChange={(e) => setFareTy(e.target.value as '010' | '020' | '030' | '040')}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm bg-white">
                    <option value="040">본사신용 (040)</option>
                    <option value="010">선불 (010)</option>
                    <option value="020">착불 (020)</option>
                    <option value="030">신용 (030)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">분류</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm bg-white">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">메모 (선택)</label>
                  <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="용도·연관 주문·기타 메모"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
                </div>
              </div>

              {submitError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{submitError}</div>}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50/50">
              <button onClick={() => setShowForm(false)} disabled={submitting}
                className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50">취소</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> 접수 중...</>) : '접수하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 보내는 분/받는 분 공통 편집 UI */
function PartyEditor({
  title, source, onSourceChange, manufacturerId, onManufacturerChange, value, onChange, factories,
}: {
  title: string;
  source: Source; onSourceChange: (s: Source) => void;
  manufacturerId: string; onManufacturerChange: (id: string) => void;
  value: Party; onChange: (v: Party) => void;
  factories: Factory[];
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-2">{title}</p>
      <div className="flex gap-2 mb-2">
        {([
          { v: 'company' as const, label: '모두의 유니폼' },
          { v: 'manufacturer' as const, label: '공장' },
          { v: 'custom' as const, label: '직접 입력' },
        ]).map((opt) => (
          <button key={opt.v} onClick={() => onSourceChange(opt.v)}
            className={`px-3 py-1.5 text-xs rounded border ${source === opt.v ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {opt.label}
          </button>
        ))}
      </div>
      {source === 'manufacturer' && (
        <select value={manufacturerId} onChange={(e) => onManufacturerChange(e.target.value)}
          className="w-full mb-2 px-2.5 py-1.5 border border-gray-300 rounded text-sm bg-white">
          <option value="">공장 선택</option>
          {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
      <div className="space-y-1.5">
        <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="이름/상호" className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
        <input value={value.addr} onChange={(e) => onChange({ ...value, addr: e.target.value })}
          placeholder="주소" className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm" />
        <input value={value.tel} onChange={(e) => onChange({ ...value, tel: e.target.value })}
          placeholder="연락처" className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm font-mono" />
      </div>
    </div>
  );
}
