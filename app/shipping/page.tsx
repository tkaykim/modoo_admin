'use client';

import { useState, useEffect, useCallback } from 'react';
import { Truck, Package, CheckCircle, RefreshCw, Printer, ImageIcon } from 'lucide-react';
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

export default function ShippingPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [trackingResults, setTrackingResults] = useState<Record<string, { statNm?: string }>>({});
  // 디자인 썸네일 호버 시 4면 미리보기 — 커서 위치에 fixed 패널(테이블 overflow 클리핑 회피)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

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

  // 로젠 접수 (단건/다건 공통) — orderIds 배열로 호출
  const registerOrders = useCallback(async (orderIds: string[]) => {
    const res = await fetch('/api/admin/shipping/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds }),
    });
    const json = await res.json();
    if (res.ok) {
      alert(`${json.data?.registered || 0}건 접수 완료`);
      mutate();
      return true;
    }
    alert(json.error || '접수 실패');
    return false;
  }, [mutate]);

  const handleBulkRegister = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}건을 로젠택배에 접수하시겠습니까?`)) return;
    setLoading(true);
    try {
      if (await registerOrders(Array.from(selectedIds))) setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [selectedIds, registerOrders]);

  const handleSingleRegister = useCallback(async (order: Order) => {
    if (!confirm(`'${getDesignTitle(order)}' (${order.customer_name}) 1건을 로젠택배에 접수하시겠습니까?`)) return;
    setRegisteringId(order.id);
    try {
      await registerOrders([order.id]);
    } finally {
      setRegisteringId(null);
    }
  }, [registerOrders]);

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
            disabled={selectedIds.size === 0 || loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '처리 중...' : `선택 일괄 접수 (${selectedIds.size}건)`}
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
                            onClick={() => handleSingleRegister(order)}
                            disabled={registeringId === order.id}
                            className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap"
                          >
                            {registeringId === order.id ? '접수 중...' : '접수'}
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
