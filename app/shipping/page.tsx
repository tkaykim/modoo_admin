'use client';

import { useState, useEffect, useCallback } from 'react';
import { Truck, Package, CheckCircle, RefreshCw, Printer, ImageIcon, X, Loader2, AlertTriangle, Plus, Minus } from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { formatKstDateOnly, getKstYYYYMMDD } from '@/lib/kst';
import type { Order } from '@/types/types';

type Tab = 'pending' | 'registered' | 'shipping' | 'delivered';

const TAB_CONFIG: Record<Tab, { label: string; icon: typeof Package; color: string }> = {
  pending: { label: '접수 대기', icon: Package, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  registered: { label: '접수 완료', icon: Printer, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  shipping: { label: '배송 중', icon: Truck, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  delivered: { label: '배송 완료', icon: CheckCircle, color: 'text-green-600 bg-green-50 border-green-200' },
};

// 디자인 면(앞/뒤/좌/우) 라벨·정렬 순서
const SIDE_ORDER = ['front', 'back', 'left', 'right'];
const SIDE_LABEL: Record<string, string> = { front: '앞면', back: '뒷면', left: '좌측', right: '우측' };

type DesignImage = { side: string; label: string; url: string };

// order_items 의 image_urls(면별 객체)에서 면 이미지를 추출 (앞/뒤/좌/우 순 정렬)
function getDesignImages(order: Order): DesignImage[] {
  const out: DesignImage[] = [];
  for (const item of order.order_items || []) {
    const iu = (item as { image_urls?: unknown }).image_urls;
    if (!iu || typeof iu === 'string') continue;
    for (const [side, arr] of Object.entries(iu as Record<string, Array<{ url?: string }>>)) {
      const url = Array.isArray(arr) ? arr.find((a) => a?.url)?.url : undefined;
      if (url) out.push({ side, label: SIDE_LABEL[side] || side, url });
    }
  }
  out.sort((a, b) => {
    const ia = SIDE_ORDER.indexOf(a.side);
    const ib = SIDE_ORDER.indexOf(b.side);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return out;
}

function getThumb(order: Order): string | null {
  const first = (order.order_items || [])[0] as { thumbnail_url?: string | null } | undefined;
  if (first?.thumbnail_url) return first.thumbnail_url;
  const imgs = getDesignImages(order);
  return imgs[0]?.url || null;
}

function getDesignTitle(order: Order): string {
  const first = (order.order_items || [])[0] as { design_title?: string | null; product_title?: string | null } | undefined;
  return first?.design_title || first?.product_title || '디자인 미지정';
}

function getProductLine(order: Order): string {
  const items = (order.order_items || []) as Array<{ product_title?: string | null }>;
  const titles = items.map((i) => i.product_title).filter(Boolean) as string[];
  if (titles.length === 0) return '';
  if (titles.length === 1) return titles[0];
  return `${titles[0]} 외 ${titles.length - 1}건`;
}

// 접수 시 실제로 로젠에 전달되는 발송자 정보 (register API SENDER_* 와 동일하게 유지)
const SENDER = { name: '모두의 유니폼', addr: '서울특별시 마포구 성지3길 55 3층', tel: '010-8140-0621' };

function getItemsSummary(order: Order): { totalQty: number; goodsNm: string } {
  const items = (order.order_items || []) as Array<{ product_title?: string | null; quantity?: number | null }>;
  const totalQty = items.reduce((s, i) => s + (i.quantity || 1), 0);
  const goodsNm = items.map((i) => i.product_title).filter(Boolean).join(', ').slice(0, 80) || '상품';
  return { totalQty, goodsNm };
}

// 택배 박스 수량 상한 (register API의 MAX_BOX_QTY와 동일하게 유지)
const MAX_BOX_QTY = 99;

function isIncomplete(order: Order): boolean {
  return !order.address_line_1 || !order.customer_phone;
}

function fullAddress(order: Order): string {
  return `${order.postal_code ? `[${order.postal_code}] ` : ''}${order.address_line_1 || '주소 미입력'}${order.address_line_2 ? ` ${order.address_line_2}` : ''}`;
}

export default function ShippingPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [trackingResults, setTrackingResults] = useState<Record<string, { statNm?: string }>>({});
  // 디자인 썸네일 호버 시 4면 미리보기 — 커서 위치에 fixed 패널(테이블 overflow 클리핑 회피)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  // 접수 확인 모달 — 발송자(공통) + 수신자 상세를 보여주고 접수 실행
  const [confirmOrders, setConfirmOrders] = useState<Order[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 주문별 택배 박스 수량(문자열 = 입력 중 상태 보존). 기본 1박스, 상품 수량과 별개.
  const [boxQtyById, setBoxQtyById] = useState<Record<string, string>>({});

  const { data: allOrders, mutate } = useSWR<Order[]>('/api/admin/orders?status=all&withMedia=1', fetcher, {
    revalidateOnFocus: false,
  });

  const matchTab = useCallback((o: Order, key: Tab): boolean => {
    if (o.shipping_method !== 'domestic') return false;
    switch (key) {
      case 'pending':
        return !o.logen_registered_at && ['payment_completed', 'in_production'].includes(o.order_status);
      case 'registered':
        return !!o.logen_registered_at && !o.tracking_number;
      case 'shipping':
        return o.order_status === 'shipping' && !!o.tracking_number;
      case 'delivered':
        return o.order_status === 'delivered';
      default:
        return false;
    }
  }, []);

  const filteredOrders = (allOrders || []).filter((o) => matchTab(o, tab));

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  // 접수 확인 모달 열기 (단건/일괄 공통)
  const openConfirm = useCallback((orders: Order[]) => {
    if (orders.length === 0) return;
    setSubmitError(null);
    setBoxQtyById(Object.fromEntries(orders.map((o) => [o.id, '1'])));
    setConfirmOrders(orders);
  }, []);

  const readBoxQty = useCallback((id: string) => boxQtyById[id] ?? '1', [boxQtyById]);
  const isBoxQtyValid = useCallback((raw: string) => {
    const t = raw.trim();
    return /^\d+$/.test(t) && Number(t) >= 1 && Number(t) <= MAX_BOX_QTY;
  }, []);
  const setBoxQty = useCallback((id: string, raw: string) => {
    setBoxQtyById((prev) => ({ ...prev, [id]: raw }));
  }, []);
  const stepBoxQty = useCallback((id: string, delta: number) => {
    setBoxQtyById((prev) => {
      const cur = Number(prev[id] ?? '1');
      const base = Number.isInteger(cur) && cur >= 1 ? cur : 1;
      return { ...prev, [id]: String(Math.min(MAX_BOX_QTY, Math.max(1, base + delta))) };
    });
  }, []);

  const handleBulkRegister = useCallback(() => {
    const orders = filteredOrders.filter((o) => selectedIds.has(o.id));
    openConfirm(orders);
  }, [filteredOrders, selectedIds, openConfirm]);

  // 모달 "접수 실행" — 실제로 로젠에 접수 요청
  const confirmRegister = useCallback(async () => {
    if (!confirmOrders || confirmOrders.length === 0) return;
    const invalid = confirmOrders.find((o) => !isBoxQtyValid(boxQtyById[o.id] ?? '1'));
    if (invalid) {
      setSubmitError(`박스 수량은 1~${MAX_BOX_QTY} 사이의 숫자로 입력해 주세요.`);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/admin/shipping/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: confirmOrders.map((o) => o.id),
          boxQuantities: Object.fromEntries(
            confirmOrders.map((o) => [o.id, Number(boxQtyById[o.id] ?? '1')])
          ),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setConfirmOrders(null);
        setSelectedIds(new Set());
        mutate();
        alert(`${json.data?.registered || 0}건 접수 완료${json.data?.skipped?.length ? ` (${json.data.skipped.length}건 건너뜀)` : ''}`);
      } else {
        setSubmitError(json.error || '접수에 실패했습니다.');
      }
    } catch {
      setSubmitError('서버 연결에 실패했습니다. 로젠 API 설정을 확인해주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [confirmOrders, boxQtyById, isBoxQtyValid, mutate]);

  const handlePrintPopup = useCallback(async () => {
    const takeDt = getKstYYYYMMDD();
    const res = await fetch(`/api/admin/shipping/print?takeDt=${takeDt}`);
    const json = await res.json();
    if (res.ok && json.data?.url) {
      window.open(json.data.url, 'logen_print', 'width=900,height=700');
    } else {
      alert(json.error || '출력 URL 생성 실패');
    }
  }, []);

  const handleBulkFetchSlipNo = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/shipping/slip-no', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (res.ok) {
        alert(`${json.data?.updated?.length || 0}건 송장번호 동기화 완료`);
        mutate();
        setSelectedIds(new Set());
      } else {
        alert(json.error || '송장번호 조회 실패');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedIds, mutate]);

  const handleBulkTracking = useCallback(async () => {
    const slipNos = filteredOrders
      .filter((o) => selectedIds.size === 0 || selectedIds.has(o.id))
      .map((o) => o.tracking_number)
      .filter(Boolean) as string[];

    if (slipNos.length === 0) {
      alert('추적할 운송장번호가 없습니다.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/shipping/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slipNos }),
      });
      const json = await res.json();
      if (res.ok && json.data?.tracking) {
        const results: Record<string, { statNm?: string }> = {};
        for (const item of json.data.tracking) {
          if (item.data1 && Array.isArray(item.data1)) {
            results[item.slipNo] = item.data1[item.data1.length - 1];
          }
        }
        setTrackingResults(results);
        if (json.data.deliveredCount > 0) mutate();
      } else {
        alert(json.error || '추적 조회 실패');
      }
    } finally {
      setLoading(false);
    }
  }, [filteredOrders, selectedIds, mutate]);

  const hoverImages = hover ? getDesignImages((allOrders || []).find((o) => o.id === hover.id) as Order) : [];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">택배 관리</h1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          새로고침
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {(Object.entries(TAB_CONFIG) as [Tab, typeof TAB_CONFIG[Tab]][]).map(([key, cfg]) => {
          const count = (allOrders || []).filter((o) => matchTab(o, key)).length;
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
                tab === key ? cfg.color : 'text-gray-500 bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {cfg.label}
              <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                tab === key ? 'bg-white/60' : 'bg-gray-100'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {tab === 'pending' && (
          <button
            onClick={handleBulkRegister}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {`선택 일괄 접수 (${selectedIds.size}건)`}
          </button>
        )}
        {tab === 'registered' && (
          <>
            <button
              onClick={handlePrintPopup}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
            >
              <span className="flex items-center gap-1.5">
                <Printer className="w-4 h-4" />
                송장 출력 (로젠 팝업)
              </span>
            </button>
            <button
              onClick={handleBulkFetchSlipNo}
              disabled={selectedIds.size === 0 || loading}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '처리 중...' : `송장번호 가져오기 (${selectedIds.size}건)`}
            </button>
          </>
        )}
        {tab === 'shipping' && (
          <button
            onClick={handleBulkTracking}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '조회 중...' : `배송 추적 조회${selectedIds.size > 0 ? ` (${selectedIds.size}건)` : ' (전체)'}`}
          </button>
        )}
      </div>

      {/* Order Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {tab !== 'delivered' && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={filteredOrders.length > 0 && selectedIds.size === filteredOrders.length}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                )}
                <th className="px-3 py-3 text-left font-medium text-gray-600 w-16">디자인</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">디자인 / 상품</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">고객</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">주소</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">금액</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">주문일</th>
                {(tab === 'shipping' || tab === 'delivered') && (
                  <th className="px-3 py-3 text-left font-medium text-gray-600">운송장번호</th>
                )}
                {tab === 'shipping' && (
                  <th className="px-3 py-3 text-left font-medium text-gray-600">최종 상태</th>
                )}
                {tab === 'pending' && (
                  <th className="px-3 py-3 text-center font-medium text-gray-600">접수</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center text-gray-400">
                    해당하는 주문이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const thumb = getThumb(order);
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/50">
                      {tab !== 'delivered' && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(order.id)}
                            onChange={() => toggleSelect(order.id)}
                            className="rounded"
                          />
                        </td>
                      )}
                      {/* 썸네일 (호버 시 4면 크게) */}
                      <td className="px-3 py-3">
                        <div
                          className="w-12 h-12 rounded-md border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center cursor-zoom-in"
                          onMouseEnter={(e) => setHover({ id: order.id, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => setHover({ id: order.id, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setHover((h) => (h?.id === order.id ? null : h))}
                        >
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="design" className="w-full h-full object-contain" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-gray-300" />
                          )}
                        </div>
                      </td>
                      {/* 디자인 제목 / 상품 / 주문 ID */}
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900 truncate max-w-[220px]">{getDesignTitle(order)}</div>
                        {getProductLine(order) && (
                          <div className="text-xs text-gray-500 truncate max-w-[220px]">{getProductLine(order)}</div>
                        )}
                        <div className="text-[10px] font-mono text-gray-300 mt-0.5" title={order.id}>
                          {order.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900 whitespace-nowrap">{order.customer_name}</div>
                        {order.customer_phone && (
                          <div className="text-xs text-gray-500 whitespace-nowrap">{order.customer_phone}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-600 max-w-xs truncate">
                        {order.postal_code && `[${order.postal_code}] `}
                        {order.address_line_1}
                        {order.address_line_2 ? ` ${order.address_line_2}` : ''}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700 whitespace-nowrap">
                        {typeof order.total_amount === 'number' ? `${order.total_amount.toLocaleString()}원` : '-'}
                      </td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                        {formatKstDateOnly(order.created_at)}
                      </td>
                      {(tab === 'shipping' || tab === 'delivered') && (
                        <td className="px-3 py-3 font-mono text-xs text-gray-700">
                          {order.tracking_number || '-'}
                        </td>
                      )}
                      {tab === 'shipping' && (
                        <td className="px-3 py-3 text-xs">
                          {order.tracking_number && trackingResults[order.tracking_number] ? (
                            <span className="text-blue-600">{trackingResults[order.tracking_number].statNm}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      )}
                      {tab === 'pending' && (
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => openConfirm([order])}
                            className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 whitespace-nowrap"
                          >
                            접수
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 접수 확인 모달 — 발송자(공통) + 수신자 상세 */}
      {confirmOrders && (() => {
        const isBulk = confirmOrders.length > 1;
        const incompleteCount = confirmOrders.filter(isIncomplete).length;
        const allIncomplete = incompleteCount === confirmOrders.length;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !submitting && setConfirmOrders(null)}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h3 className="text-base font-semibold text-gray-900">
                  택배 접수 확인 {isBulk && <span className="text-blue-600">({confirmOrders.length}건)</span>}
                </h3>
                <button onClick={() => setConfirmOrders(null)} disabled={submitting} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4 overflow-y-auto">
                {/* 보내는 분 — 공통, 한 번만 */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">보내는 분 (공통)</p>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-0.5 text-sm">
                    <p className="font-medium text-gray-900">{SENDER.name}</p>
                    <p className="text-gray-600">{SENDER.addr}</p>
                    <p className="text-gray-600">{SENDER.tel}</p>
                  </div>
                </div>

                {/* 받는 분 — 단건이면 상세, 일괄이면 리스트 */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    받는 분 {isBulk && `· ${confirmOrders.length}명`}
                  </p>
                  <div className="space-y-2">
                    {confirmOrders.map((order) => {
                      const { totalQty, goodsNm } = getItemsSummary(order);
                      const bad = isIncomplete(order);
                      return (
                        <div key={order.id} className={`rounded-lg p-3 text-sm border ${bad ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'}`}>
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-gray-900">{order.customer_name || '-'}</p>
                            <span className="text-xs text-gray-500">{totalQty}개 · {(order.delivery_fee || 0).toLocaleString()}원</span>
                          </div>
                          <p className="text-gray-700">{fullAddress(order)}</p>
                          <p className="text-gray-600">{order.customer_phone || '연락처 없음'}</p>
                          {!isBulk && (
                            <p className="text-xs text-gray-500 mt-1 truncate">물품: {goodsNm} · 운임타입 본사신용</p>
                          )}
                          {/* 택배 박스 수량 — 상품 수량과 별개(실제 포장 결과) */}
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-gray-600">택배 박스</span>
                            <button
                              type="button"
                              onClick={() => stepBoxQty(order.id, -1)}
                              disabled={submitting || Number(readBoxQty(order.id)) <= 1}
                              className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label="박스 수량 감소"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={MAX_BOX_QTY}
                              step={1}
                              value={readBoxQty(order.id)}
                              onChange={(e) => setBoxQty(order.id, e.target.value)}
                              disabled={submitting}
                              className={`w-16 px-2 py-1 border rounded text-sm text-center font-medium bg-white ${
                                isBoxQtyValid(readBoxQty(order.id)) ? 'border-gray-300' : 'border-red-300 bg-red-50'
                              }`}
                              aria-label="박스 수량"
                            />
                            <button
                              type="button"
                              onClick={() => stepBoxQty(order.id, 1)}
                              disabled={submitting || Number(readBoxQty(order.id)) >= MAX_BOX_QTY}
                              className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label="박스 수량 증가"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[11px] text-gray-500">박스 (상품 {totalQty}개와 별개)</span>
                          </div>
                          {bad && (
                            <p className="flex items-center gap-1 text-xs text-amber-700 mt-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {!order.address_line_1 ? '주소 누락' : ''}{!order.address_line_1 && !order.customer_phone ? ' · ' : ''}{!order.customer_phone ? '연락처 누락' : ''}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 일괄 요약 */}
                {isBulk && (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-600">총 접수 건수</span>
                      <span className="font-medium text-gray-900">
                        {confirmOrders.length}건
                        {incompleteCount > 0 && <span className="text-amber-600"> (정보 누락 {incompleteCount}건)</span>}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">총 박스 수</span>
                      <span className="font-medium text-gray-900">
                        {confirmOrders.reduce((s, o) => {
                          const raw = readBoxQty(o.id);
                          return s + (isBoxQtyValid(raw) ? Number(raw) : 0);
                        }, 0)}박스
                      </span>
                    </div>
                  </div>
                )}

                {incompleteCount > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <p className="font-medium mb-1">주의: {incompleteCount}건의 배송 정보가 불완전합니다.</p>
                    <p>주소/연락처가 없는 건은 로젠 접수가 거부될 수 있습니다. 주문 상세에서 보완 후 접수를 권장합니다.</p>
                  </div>
                )}

                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{submitError}</div>
                )}
              </div>

              <div className="flex gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50/50">
                <button
                  onClick={() => setConfirmOrders(null)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={confirmRegister}
                  disabled={submitting || allIncomplete || confirmOrders.some((o) => !isBoxQtyValid(readBoxQty(o.id)))}
                  className="flex-1 px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> 접수 중...</>) : `${confirmOrders.length}건 접수하기`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 디자인 4면 미리보기 팝오버 (커서 추적, fixed) */}
      {hover && hoverImages.length > 0 && (
        <div
          className="fixed z-50 pointer-events-none bg-white border border-gray-200 rounded-lg shadow-xl p-2"
          style={{
            left: Math.min(hover.x + 20, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 380),
            top: Math.min(hover.y + 12, (typeof window !== 'undefined' ? window.innerHeight : 800) - 380),
          }}
        >
          <div className="grid grid-cols-2 gap-2" style={{ width: 340 }}>
            {hoverImages.slice(0, 4).map((img) => (
              <div key={img.side} className="relative">
                <div className="w-[160px] h-[160px] bg-gray-50 border border-gray-100 rounded flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.label} className="w-full h-full object-contain" />
                </div>
                <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-medium bg-black/55 text-white rounded">
                  {img.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
